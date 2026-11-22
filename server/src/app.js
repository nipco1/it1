import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomBytes, createHash } from 'node:crypto';
import path from 'node:path';
import { validateControl } from './control-validation.js';
import { prepareLegacyImport } from './legacy-import.js';
import { stripUsersFromState } from './state-security.js';

const TOKEN_RE = /^[a-f0-9]{64}$/;
const digest = token => createHash('sha256').update(token).digest('hex');
const cookieName = '__Secure-control_session';
const cookieOptions = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api', maxAge: 8 * 60 * 60 * 1000 };
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: !!u.active, groupIds: u.groupIds ?? 'all' });
const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
const canonical = value => Array.isArray(value) ? value.map(canonical) : isObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
function normalizeComparableItems(items) {
  if (!isObject(items)) return items;
  const out = {};
  for (const [key, val] of Object.entries(items)) {
    if (!isObject(val)) { out[key] = val; continue; }
    const clean = { ...val };
    if (clean.failLocId === null || (clean.result === 'ok' && clean.failLocId === '')) delete clean.failLocId;
    if (clean.desc === null || (clean.result === 'ok' && clean.desc === '')) delete clean.desc;
    out[key] = clean;
  }
  return out;
}
function readToken(req) {
  const cookie = req.headers.cookie || '';
  const matches = cookie.split(';').map(v => v.trim()).filter(v => v.startsWith(cookieName + '='));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return TOKEN_RE.test(token) ? token : null;
}
function validState(s) {
  const limits = { groups: 10000, equipments: 50000, checklists: 50000, sections: 100000, items: 250000,
    controls: 250000, drafts: 50000, opHours: 500000, failLocs: 1000, shifts: 100, logs: 1000000,
    sync: 0, savedFilters: 10000, archivedYears: 500 };
  const objects = ['branding','layouts','perms','yearAccess'];
  if (!isObject(s) || !Number.isInteger(s.v) || !objects.every(k => isObject(s[k])) || typeof s.theme !== 'string') return false;
  for (const [key, max] of Object.entries(limits)) if (!Array.isArray(s[key]) || s[key].length > max) return false;
  if (s.users !== undefined && !Array.isArray(s.users)) return false;
  if (typeof s.branding.title !== 'string' || typeof s.branding.logoText !== 'string' ||
      typeof s.branding.version !== 'string' || typeof s.branding.primary !== 'string' ||
      !/^#[0-9a-f]{6}$/i.test(s.branding.primary) || !Number.isFinite(s.branding.radius)) return false;
  for (const key of ['groups','equipments','checklists','sections','items','controls','drafts','opHours','failLocs','shifts']) {
    const ids = s[key].map(row => row && row.id);
    if (ids.some(id => typeof id !== 'string' || id.length < 1 || id.length > 150) || new Set(ids).size !== ids.length) return false;
  }
  return true;
}
function currentJalaliDate() {
  const zone = process.env.APP_TIME_ZONE || 'Asia/Tehran';
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(item => item.type === type)?.value || '00';
  return `${part('year')}/${part('month')}/${part('day')}`;
}
function serverAuditClock() {
  const zone = process.env.APP_TIME_ZONE || 'Asia/Tehran';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const part = type => parts.find(item => item.type === type)?.value || '00';
  return { dateKey: `${part('year')}/${part('month')}/${part('day')}`, time: `${part('hour')}:${part('minute')}`, iso: now.toISOString() };
}
const ROLE_PERMISSION = {
  admin: ['*'],
  supervisor: ['dashboard:view','control:view','control:create','control:edit','control:submit','control:approve','control:print','reports:view','reports:export','reports:print','equipment:view','equipment:edit','settings:view'],
  engineer: ['dashboard:view','control:view','control:create','control:submit','control:print','reports:view','reports:export','reports:print','equipment:view','equipment:edit','settings:view'],
  technician: ['dashboard:view','control:view','control:create','control:submit','control:print','reports:view','equipment:view'],
  viewer: ['dashboard:view','control:view','reports:view','reports:print','equipment:view'],
};
function hasPermission(user, key, state) {
  if (user.role === 'admin') return true;
  const stored = state?.perms?.[user.role];
  return typeof stored?.[key] === 'boolean' ? stored[key] : ROLE_PERMISSION[user.role]?.includes(key) || false;
}
function withinGroups(user, equipment, groups) {
  if (user.role === 'admin' || user.groupIds === 'all') return true;
  const groupId = groups.find(g => g.id === equipment?.groupId)?.id;
  return !!groupId && Array.isArray(user.groupIds) && user.groupIds.includes(groupId);
}
function authorizeNonAdminChange(previous, next, user, roleUsers) {
  const protectedKeys = ['groups','failLocs','shifts','branding','perms','yearAccess','archivedYears','theme'];
  for (const key of protectedKeys) if (!same(previous?.[key], next[key])) return 'تغییر این تنظیم پایه فقط برای مدیر سیستم مجاز است';
  const equipmentKeys = ['equipments','checklists','sections','items'];
  const equipmentConfigChanged = equipmentKeys.some(key => !same(previous?.[key], next[key]));
  if (equipmentConfigChanged && !hasPermission(user, 'equipment:edit', previous)) return 'دسترسی ویرایش تجهیزات و چک‌لیست‌ها ندارید';
  if (equipmentConfigChanged) {
    const allowedGroups = new Set((previous.groups || []).filter(g => user.groupIds === 'all' || user.groupIds?.includes(g.id)).map(g => g.id));
    const oldEquipment = previous.equipments || [], newEquipment = next.equipments || [];
    if (oldEquipment.some(old => !newEquipment.some(item => item.id === old.id))) return 'حذف تجهیز مجاز نیست؛ وضعیت آن را به بازنشسته تغییر دهید';
    if (newEquipment.some(item => !allowedGroups.has(item.groupId) || typeof item.code !== 'string' || !item.code.trim() || typeof item.name !== 'string' || !item.name.trim())) return 'تجهیز جدید یا ویرایش‌شده خارج از گروه مجاز یا فاقد مشخصات معتبر است';
    const equipmentCodes = newEquipment.map(item => `${item.groupId}|${item.code.trim().toLowerCase()}`);
    if (new Set(equipmentCodes).size !== equipmentCodes.length) return 'کد تجهیز در همان گروه نباید تکراری باشد';
    const equipmentIds = new Set(newEquipment.map(item => item.id));
    const oldChecklists = previous.checklists || [], newChecklists = next.checklists || [];
    if (oldChecklists.some(old => !newChecklists.some(item => item.id === old.id))) return 'حذف چک‌لیست مجاز نیست؛ چک‌لیست را ویرایش کنید';
    const allowedChecklist = item => (item.groupId && allowedGroups.has(item.groupId)) || (item.equipmentId && equipmentIds.has(item.equipmentId));
    if (newChecklists.some(item => !allowedChecklist(item) || (!!item.groupId === !!item.equipmentId))) return 'چک‌لیست باید دقیقاً به یک گروه یا تجهیز مجاز متصل باشد';
    const checklistIds = new Set(newChecklists.map(item => item.id));
    const oldSections = previous.sections || [], newSections = next.sections || [];
    if (oldSections.some(old => !newSections.some(item => item.id === old.id))) return 'حذف بخش چک‌لیست مجاز نیست';
    if (newSections.some(item => !checklistIds.has(item.checklistId) || typeof item.title !== 'string' || !item.title.trim())) return 'بخش چک‌لیست نامعتبر است';
    const sectionIds = new Set(newSections.map(item => item.id));
    const oldItems = previous.items || [], newItems = next.items || [];
    if (oldItems.some(old => !newItems.some(item => item.id === old.id))) return 'حذف آیتم چک‌لیست مجاز نیست؛ سابقه کنترل باید قابل تفسیر بماند';
    if (newItems.some(item => !sectionIds.has(item.sectionId) || !['oknok','numeric'].includes(item.type) || (item.type === 'numeric' && ((item.min != null && !Number.isFinite(item.min)) || (item.max != null && !Number.isFinite(item.max)) || (item.min != null && item.max != null && item.min > item.max) || (item.precision != null && (!Number.isInteger(item.precision) || item.precision < 0 || item.precision > 6)))))) return 'آیتم چک‌لیست یا محدوده عددی معتبر نیست';
  }
  if (!same(previous?.users, roleUsers)) return 'تغییر کاربران فقط برای مدیر سیستم مجاز است';
  for (const [id, layout] of Object.entries(previous?.layouts || {})) if (id !== user.id && !same(layout, next.layouts?.[id])) return 'تغییر داشبورد کاربران دیگر مجاز نیست';
  for (const id of Object.keys(next.layouts || {})) if (id !== user.id && !Object.hasOwn(previous?.layouts || {}, id)) return 'ایجاد داشبورد برای کاربر دیگر مجاز نیست';
  const oldFilters = (previous?.savedFilters || []).filter(x => x.userId !== user.id);
  const newFilters = (next.savedFilters || []).filter(x => x.userId !== user.id);
  if (!same(oldFilters, newFilters)) return 'تغییر فیلترهای کاربران دیگر مجاز نیست';
  const oldControls = previous?.controls || [];
  const newControls = next.controls || [];
  for (const old of oldControls) {
    const changed = newControls.find(x => x.id === old.id);
    if (!changed) return 'حذف سابقه ثبت‌شده مجاز نیست';
    if (!same(changed, old)) {
      if (!(user.role === 'supervisor' && hasPermission(user, 'control:approve', previous) && old.status !== 'cancelled' && changed.status === 'cancelled' && changed.equipmentId === old.equipmentId && changed.dateKey === old.dateKey && changed.techId === old.techId)) return 'ویرایش سابقه ثبت‌شده مجاز نیست';
    }
  }
  for (const c of newControls) if (!oldControls.some(x => x.id === c.id)) {
    const equipment = (previous?.equipments || []).find(e => e.id === c.equipmentId);
    const group = (previous?.groups || []).find(g => g.id === equipment?.groupId);
    if (c.techId !== user.id || !hasPermission(user, 'control:submit', previous) || !withinGroups(user, equipment, previous?.groups || [])) return 'ثبت کنترل برای این تجهیز مجاز نیست';
    if (!equipment || !group || equipment.status === 'retired') return 'تجهیز برای ثبت کنترل معتبر یا فعال نیست';
    if (typeof c.id !== 'string' || !/^dc-[0-9a-f-]{36}$/i.test(c.id) || !['completed','nok'].includes(c.status)) return 'شناسه یا وضعیت سند کنترل معتبر نیست';
    if (!Array.isArray(previous.shifts) || !previous.shifts.some(shift => shift.id === c.shiftId)) return 'شیفت انتخاب‌شده معتبر نیست';
    const selectedChecklist = (previous.checklists || []).find(x => x.equipmentId === equipment.id) || (previous.checklists || []).find(x => x.groupId === equipment.groupId);
    if (!selectedChecklist) return 'برای این تجهیز چک‌لیست معتبر تعریف نشده است';
    const sectionIds = new Set((previous.sections || []).filter(x => x.checklistId === selectedChecklist.id).map(x => x.id));
    const checklist = (previous.items || []).filter(x => sectionIds.has(x.sectionId)).map(x => ({ id: x.id, kind: x.type, min: x.min, max: x.max, precision: x.precision }));
    const checked = validateControl(c, checklist, previous.shifts.map(shift => shift.id));
    if (!checked || checked.status !== c.status || !same(normalizeComparableItems(checked.items), normalizeComparableItems(c.items)) || c.dateKey > currentJalaliDate()) return 'مقادیر فرم، تاریخ یا وضعیت با قواعد معتبر سامانه مطابقت ندارد';
    for (const value of Object.values(c.items || {})) if (value.result === 'nok' && !(previous.failLocs || []).some(location => location.id === value.failLocId)) return 'محل خرابی انتخاب‌شده معتبر نیست';
    if (typeof c.createdAt !== 'string' || c.createdAt.length > 80 || typeof c.submittedAt !== 'string' || c.submittedAt.length > 80) return 'زمان ثبت سند معتبر نیست';
    if (group.trackHours) {
      if (typeof c.opHours !== 'number' || !Number.isFinite(c.opHours) || c.opHours < 0) return 'ثبت ساعت کارکرد معتبر الزامی است';
      const readings = (previous.opHours || []).filter(h => h.equipmentId === equipment.id).sort((a,b) => (a.dateKey+a.time).localeCompare(b.dateKey+b.time));
      const previousReading = readings.filter(h => h.dateKey <= c.dateKey).at(-1);
      const nextReading = readings.find(h => h.dateKey > c.dateKey);
      if (previousReading && c.opHours < previousReading.hours) return 'ساعت کارکرد نباید از آخرین مقدار ثبت‌شده کمتر باشد';
      if (nextReading && c.opHours > nextReading.hours) return 'ساعت کارکرد نباید از مقدار ثبت‌شده در تاریخ بعد بیشتر باشد';
    } else if (c.opHours !== undefined && c.opHours !== null) return 'این تجهیز نباید ساعت کارکرد ثبت کند';
    if ((newControls.filter(x => x.equipmentId === c.equipmentId && x.dateKey === c.dateKey && x.status !== 'cancelled').length) > 1) return 'برای این تجهیز در این تاریخ سند دیگری ثبت شده است';
  }
  for (const old of oldControls) {
    const changed = newControls.find(x => x.id === old.id);
    if (changed && old.status !== 'cancelled' && changed.status === 'cancelled' && (typeof changed.cancelReason !== 'string' || !changed.cancelReason.trim() || changed.cancelReason.length > 1000)) return 'دلیل ابطال سند الزامی است';
  }
  const oldDrafts = previous?.drafts || [];
  const newDrafts = next.drafts || [];
  if (oldDrafts.some(d => d.techId !== user.id && !newDrafts.some(x => x.id === d.id && same(x, d)))) return 'تغییر پیش‌نویس کاربران دیگر مجاز نیست';
  if (newDrafts.some(d => d.techId !== user.id && !oldDrafts.some(x => x.id === d.id && same(x, d)))) return 'ثبت پیش‌نویس برای کاربر دیگر مجاز نیست';
  for (const draft of newDrafts) {
    const equipment = (previous?.equipments || []).find(e => e.id === draft.equipmentId);
    if (draft.techId !== user.id || !withinGroups(user, equipment, previous?.groups || []) || !previous.shifts.some(x => x.id === draft.shiftId) || typeof draft.dateKey !== 'string' || !/^\d{4}\/\d{2}\/\d{2}$/.test(draft.dateKey)) return 'پیش‌نویس برای این تجهیز یا شیفت مجاز نیست';
  }
  const oldHours = previous?.opHours || [];
  const newHours = next.opHours || [];
  if (oldHours.some(h => !newHours.some(x => x.id === h.id && same(x, h)))) return 'ویرایش یا حذف سابقه ساعت کارکرد مجاز نیست';
  if (newHours.some(h => !oldHours.some(x => x.id === h.id) && h.techId !== user.id)) return 'ثبت ساعت کارکرد برای کاربر دیگر مجاز نیست';
  for (const hour of newHours.filter(h => !oldHours.some(x => x.id === h.id))) {
    const equipment = (previous?.equipments || []).find(e => e.id === hour.equipmentId);
    const group = (previous?.groups || []).find(g => g.id === equipment?.groupId);
    if (!equipment || !group?.trackHours || !withinGroups(user, equipment, previous?.groups || []) || !Number.isFinite(hour.hours) || hour.hours < 0 || !/^\d{4}\/\d{2}\/\d{2}$/.test(hour.dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hour.time)) return 'رکورد ساعت کارکرد معتبر نیست';
    const corresponding = newControls.find(c => c.equipmentId === hour.equipmentId && c.dateKey === hour.dateKey && c.techId === user.id && c.status !== 'cancelled');
    if (!corresponding || corresponding.opHours !== hour.hours) return 'ساعت کارکرد باید همراه با سند کنترل معتبر ثبت شود';
  }
  const oldLogs = previous?.logs || [];
  const newLogs = next.logs || [];
  if (oldLogs.some((l, i) => !same(l, newLogs[i]))) return 'ویرایش سوابق رویداد مجاز نیست';
  const addedLogs = newLogs.slice(oldLogs.length);
  if (addedLogs.some(l => l.userId !== user.id || typeof l.detail !== 'string' || l.detail.length > 1000 || !['INSERT','UPDATE','DELETE','EXPORT','CANCEL'].includes(l.action))) return 'ثبت رویداد به نام کاربر دیگر یا با نوع غیرمجاز مجاز نیست';
  return null;
}

function projectForUser(state, users, user) {
  if (!state || user.role === 'admin') return { state, users };
  const allowedGroups = user.groupIds === 'all' ? new Set((state.groups || []).map(g => g.id)) : new Set(user.groupIds || []);
  const groups = (state.groups || []).filter(g => allowedGroups.has(g.id));
  const equipments = (state.equipments || []).filter(e => allowedGroups.has(e.groupId));
  const equipmentIds = new Set(equipments.map(e => e.id));
  const checklists = (state.checklists || []).filter(c => (c.groupId && allowedGroups.has(c.groupId)) || (c.equipmentId && equipmentIds.has(c.equipmentId)));
  const checklistIds = new Set(checklists.map(c => c.id));
  const sections = (state.sections || []).filter(s => checklistIds.has(s.checklistId));
  const sectionIds = new Set(sections.map(s => s.id));
  const visibleUser = u => u.id === user.id || (u.role !== 'admin' && (user.groupIds === 'all' || u.groupIds === 'all' || (Array.isArray(u.groupIds) && u.groupIds.some(g => allowedGroups.has(g)))));
  const projectedUsers = (users || []).filter(visibleUser);
  const projectedState = {
    ...state,
    groups,
    equipments,
    checklists,
    sections,
    items: (state.items || []).filter(i => sectionIds.has(i.sectionId)),
    controls: (state.controls || []).filter(c => equipmentIds.has(c.equipmentId)),
    drafts: (state.drafts || []).filter(d => d.techId === user.id),
    opHours: (state.opHours || []).filter(h => equipmentIds.has(h.equipmentId)),
    layouts: Object.hasOwn(state.layouts || {}, user.id) ? { [user.id]: state.layouts[user.id] } : {},
    savedFilters: (state.savedFilters || []).filter(f => f.userId === user.id),
    logs: (state.logs || []).filter(l => l.userId === user.id),
  };
  return { state: projectedState, users: projectedUsers };
}

function mergeNonAdminState(previous, incoming, user, remoteIp) {
  const merged = { ...previous };
  if (hasPermission(user, 'equipment:edit', previous)) {
    const groupIds = new Set((previous.groups || []).filter(g => user.groupIds === 'all' || user.groupIds?.includes(g.id)).map(g => g.id));
    const equipmentAllowed = item => groupIds.has(item.groupId);
    const permittedEquipments = new Set((incoming.equipments || []).filter(equipmentAllowed).map(item => item.id));
    const checklistAllowed = item => (item.groupId && groupIds.has(item.groupId)) || (item.equipmentId && permittedEquipments.has(item.equipmentId));
    const permittedChecklists = new Set((incoming.checklists || []).filter(checklistAllowed).map(item => item.id));
    const sectionAllowed = item => permittedChecklists.has(item.checklistId);
    const permittedSections = new Set((incoming.sections || []).filter(sectionAllowed).map(item => item.id));
    merged.equipments = (previous.equipments || []).filter(item => !equipmentAllowed(item)).concat((incoming.equipments || []).filter(equipmentAllowed));
    merged.checklists = (previous.checklists || []).filter(item => !checklistAllowed(item)).concat((incoming.checklists || []).filter(checklistAllowed));
    merged.sections = (previous.sections || []).filter(item => !sectionAllowed(item)).concat((incoming.sections || []).filter(sectionAllowed));
    merged.items = (previous.items || []).filter(item => !permittedSections.has(item.sectionId)).concat((incoming.items || []).filter(item => permittedSections.has(item.sectionId)));
  }
  const incomingControls = new Map((incoming.controls || []).map(c => [c.id, c]));
  const previousEquipmentIds = new Set((previous.equipments || []).filter(e => user.groupIds === 'all' || user.groupIds?.includes(e.groupId)).map(e => e.id));
  const visiblePreviousControls = (previous.controls || []).filter(c => previousEquipmentIds.has(c.equipmentId));
  const visibleIds = new Set(visiblePreviousControls.map(c => c.id));
  merged.controls = (previous.controls || []).map(c => visibleIds.has(c.id) && incomingControls.has(c.id) ? incomingControls.get(c.id) : c);
  for (const c of (incoming.controls || [])) if (!visibleIds.has(c.id)) merged.controls.push(c);
  merged.drafts = (previous.drafts || []).filter(d => d.techId !== user.id).concat(incoming.drafts || []);
  const oldHourIds = new Set((previous.opHours || []).map(h => h.id));
  merged.opHours = (previous.opHours || []).concat((incoming.opHours || []).filter(h => !oldHourIds.has(h.id)));
  merged.layouts = { ...(previous.layouts || {}) };
  if (Object.hasOwn(incoming.layouts || {}, user.id)) merged.layouts[user.id] = incoming.layouts[user.id];
  else delete merged.layouts[user.id];
  merged.savedFilters = (previous.savedFilters || []).filter(f => f.userId !== user.id).concat(incoming.savedFilters || []);
  const previousProjectedLogs = projectForUser(previous, [], user).state.logs || [];
  merged.logs = (previous.logs || []).concat((incoming.logs || []).slice(previousProjectedLogs.length).map(entry => ({ ...entry, userId: user.id, userName: user.name, ip: String(remoteIp || 'unknown').slice(0, 64) })));
  // Sync metadata is local transport state and has no authority over stored records.
  merged.sync = previous.sync || [];
  return merged;
}

export function createApp({ store, verifyPassword, hashPassword, dummyHash, publicOrigin, staticRoot, backupDir }) {
  const origin = new URL(publicOrigin);
  if (origin.protocol !== 'https:' || origin.origin !== publicOrigin) throw new Error('PUBLIC_ORIGIN must be an HTTPS origin without a trailing slash');
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:'], styleSrc: ["'self'", "'unsafe-inline'"], scriptSrc: ["'self'"], connectSrc: ["'self'"], fontSrc: ["'self'", 'data:'] } } }));
  app.use(express.json({ limit: '100mb' }));
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', (req, res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== publicOrigin) return res.status(403).json({ error: 'درخواست نامعتبر است' });
    next();
  });
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'تعداد تلاش‌ها بیش از حد مجاز است؛ بعداً دوباره تلاش کنید' } });
  async function currentUser(req) {
    const token = readToken(req);
    return token ? store.findSession(digest(token)) : null;
  }
  async function requireUser(req, res) {
    const user = await currentUser(req);
    if (!user) { res.status(401).json({ error: 'ورود به سامانه لازم است' }); return null; }
    return user;
  }
  app.get('/api/health', async (_req, res) => {
    try { await store.loadAppState(); return res.json({ ok: true, database: 'connected' }); }
    catch { return res.status(503).json({ ok: false, database: 'unavailable' }); }
  });
  app.post('/api/auth/login', loginLimit, async (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || username.trim().length < 1 || username.length > 128 || password.length < 1 || password.length > 1024) return res.status(400).json({ error: 'ورودی نامعتبر است' });
    const user = await store.findUser(username.trim().toLowerCase());
    const match = await verifyPassword(user?.passwordHash || dummyHash, password);
    if (!user || !match || !user.active) return res.status(401).json({ error: 'نام کاربری یا رمز عبور اشتباه است' });
    const prior = readToken(req); if (prior) await store.deleteSession(digest(prior));
    const token = randomBytes(32).toString('hex');
    await store.createSession(digest(token), user.id, new Date(Date.now() + cookieOptions.maxAge));
    res.cookie(cookieName, token, cookieOptions);
    return res.json({ user: publicUser(user) });
  });
  app.get('/api/auth/me', async (req, res) => {
    const user = await currentUser(req);
    if (!user) return res.status(401).json({ error: 'ورود به سامانه لازم است' });
    return res.json({ user: publicUser(user) });
  });
  app.post('/api/auth/logout', async (req, res) => {
    const token = readToken(req); if (token) await store.deleteSession(digest(token));
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined }); return res.status(204).end();
  });
  app.get('/api/backups', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin' || !store.listBackups) return res.status(403).json({ error: 'فقط مدیر سیستم مجاز است' });
    return res.json({ backups: await store.listBackups() });
  });
  app.post('/api/backups', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin' || !store.createBackup) return res.status(403).json({ error: 'فقط مدیر سیستم مجاز است' });
    const backup = await store.createBackup(user.id);
    return res.status(201).json({ backup });
  });
  app.post('/api/admin/import-legacy', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (user.role !== 'admin') return res.status(403).json({ error: 'فقط مدیر سیستم مجاز است' });
    const stored = await store.loadAppState();
    const currentState = stored.state;
    const operationalKeys = ['groups','equipments','checklists','sections','items','controls','drafts','opHours','logs','savedFilters','archivedYears'];
    const isEmpty = !currentState || operationalKeys.every(key => Array.isArray(currentState[key]) && currentState[key].length === 0);
    if (!isEmpty) return res.status(409).json({ error: 'انتقال فقط روی پایگاه تازه و بدون اطلاعات عملیاتی مجاز است؛ اطلاعات فعلی برای جلوگیری از بازنویسی حفظ شد.' });
    try {
      const currentUsers = await store.listUsers();
      const prepared = prepareLegacyImport(req.body?.legacy, currentUsers, serverAuditClock());
      if (!validState(prepared.state)) return res.status(400).json({ error: 'ساختار داده‌های قدیمی با مدل فعلی سازگار نیست؛ فایل اصلی بدون تغییر باقی ماند.' });
      const saved = await store.saveAppState(stored.revision, prepared.state, user.id, prepared.users, hashPassword);
      if (saved.kind === 'conflict') return res.status(409).json({ error: 'پایگاه هم‌زمان تغییر کرده است؛ صفحه را تازه کنید و انتقال را دوباره بررسی کنید.', revision: saved.revision });
      return res.status(201).json({ revision: saved.revision, imported: {
        groups: prepared.state.groups.length, equipments: prepared.state.equipments.length,
        controls: prepared.state.controls.length, opHours: prepared.state.opHours.length,
        importedLegacyAccountsDisabled: prepared.importedUsers,
      }, users: saved.users || await store.listUsers() });
    } catch (error) {
      return res.status(400).json({ error: error?.message || 'انتقال داده‌های قدیمی انجام نشد.' });
    }
  });
  app.get('/api/state/revision', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    if (typeof store.loadRevision !== 'function') return res.status(503).json({ error: 'بررسی نسخه پایگاه داده در دسترس نیست' });
    return res.json({ revision: await store.loadRevision() });
  });
  app.get('/api/state', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const [stored, users] = await Promise.all([store.loadAppState(), store.listUsers()]);
    // User credentials and account metadata belong only in the relational Users table.
    // Older builds could have embedded `users` (including a just-entered password) in
    // the JSON application payload; never return that legacy property to any client.
    const safeState = stripUsersFromState(stored.state);
    const projected = projectForUser(safeState, users, user);
    return res.json({ revision: stored.revision, state: projected.state, users: projected.users });
  });
  app.put('/api/state', async (req, res) => {
    const user = await requireUser(req, res); if (!user) return;
    const revision = req.body?.revision;
    const incoming = req.body?.state;
    if (!Number.isSafeInteger(revision) || revision < 0 || !validState(incoming)) return res.status(400).json({ error: 'ساختار اطلاعات ارسالی معتبر نیست' });
    const [stored, previousUsers] = await Promise.all([store.loadAppState(), store.listUsers()]);
    if (stored.revision !== revision) return res.status(409).json({ error: 'اطلاعات توسط کاربر دیگری تغییر کرده است؛ داده‌ها را تازه‌سازی کنید', revision: stored.revision });
    let userChanges = null;
    let stateToSave = incoming;
    if (user.role === 'admin') {
      if (!Array.isArray(incoming.users)) return res.status(400).json({ error: 'فهرست کاربران ارسال نشده است' });
      if (!incoming.users.some(account => account?.role === 'admin' && account.active === true)) return res.status(400).json({ error: 'حداقل یک مدیر سیستم فعال باید باقی بماند' });
      userChanges = incoming.users;
      // Passwords may be sent once over HTTPS for hashing, but must never be copied
      // into control.AppState. Users are stored separately with Argon2id hashes only.
      stateToSave = stripUsersFromState(incoming);
    } else {
      if (!stored.state) return res.status(403).json({ error: 'ایجاد پایگاه اولیه فقط برای مدیر سیستم مجاز است' });
      const previousView = projectForUser(stored.state, previousUsers, user);
      if (!Array.isArray(incoming.users) || !same(incoming.users, previousView.users)) return res.status(403).json({ error: 'تغییر کاربران فقط برای مدیر سیستم مجاز است' });
      const reason = authorizeNonAdminChange({ ...previousView.state, users: previousView.users }, incoming, user, previousView.users);
      if (reason) return res.status(403).json({ error: reason });
      const prevControlIds = new Set((previousView.state.controls || []).map(c => c.id));
      const addedControl = (incoming.controls || []).some(c => !prevControlIds.has(c.id));
      if (addedControl && !hasPermission(user, 'control:submit', stored.state)) return res.status(403).json({ error: 'دسترسی ثبت کنترل ندارید' });
      stateToSave = mergeNonAdminState(stored.state, incoming, user, req.ip);
    }
    // Audit history is append-only for every role. The server, not the browser, owns identity, clock and client IP.
    const priorLogs = stored.state?.logs || [];
    const submittedLogs = stateToSave.logs || [];
    if (submittedLogs.length < priorLogs.length || !same(priorLogs, submittedLogs.slice(0, priorLogs.length))) {
      return res.status(403).json({ error: 'ویرایش یا حذف سوابق رویداد مجاز نیست' });
    }
    const auditClock = serverAuditClock();
    const validActions = new Set(['INSERT','UPDATE','DELETE','EXPORT','CANCEL','BACKUP','LOGIN','SYNC']);
    const additions = submittedLogs.slice(priorLogs.length);
    if (additions.some(entry => !entry || !validActions.has(entry.action) || typeof entry.entity !== 'string' || entry.entity.length > 120 || typeof entry.detail !== 'string' || entry.detail.length > 1000)) {
      return res.status(400).json({ error: 'ساختار رویداد ثبت‌شده معتبر نیست' });
    }
    stateToSave = stripUsersFromState(stateToSave);
    const stampedAdditions = additions.map(entry => ({
      ...entry, userId: user.id, userName: user.name, dateKey: auditClock.dateKey, time: auditClock.time, ip: String(req.ip || 'unknown').slice(0, 64),
    }));
    stateToSave = { ...stateToSave, logs: priorLogs.concat(stampedAdditions) };
    const payload = { ...stateToSave }; delete payload.users;
    const saved = await store.saveAppState(revision, payload, user.id, userChanges, hashPassword);
    if (saved.kind === 'conflict') return res.status(409).json({ error: 'اطلاعات توسط کاربر دیگری ثبت شده است؛ داده‌ها را تازه‌سازی کنید', revision: saved.revision });
    const responseUsers = user.role === 'admin' ? (saved.users || await store.listUsers()) : projectForUser(payload, previousUsers, user).users;
    return res.json({ revision: saved.revision, users: responseUsers, stampedLogs: stampedAdditions });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'مسیر یافت نشد' }));
  if (staticRoot) {
    app.use(express.static(path.resolve(staticRoot), { index: false, etag: true, maxAge: '1h' }));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      return res.sendFile(path.join(path.resolve(staticRoot), 'index.html'));
    });
  }
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'دادهٔ نامعتبر' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'داده بیش از حد مجاز است' });
    console.error('API error:', err.name);
    return res.status(500).json({ error: 'خطای سرور' });
  });
  return app;
}
