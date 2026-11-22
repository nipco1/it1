import { randomBytes, randomUUID } from 'node:crypto';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const validUsername = value => /^[A-Za-z0-9._@-]{3,128}$/.test(value);
const safeName = (value, fallback) => typeof value === 'string' && value.trim() ? value.trim().slice(0, 200) : fallback;
const securePlaceholderPassword = () => `Legacy-${randomBytes(32).toString('base64url')}-A1`;

/**
 * Converts the old browser database to the server's state model. Legacy accounts
 * are retained as disabled audit identities; old plaintext passwords are never
 * read or imported. Administrators must set a new password before reactivation.
 */
export function prepareLegacyImport(legacy, currentUsers, audit = {}) {
  if (!isObject(legacy)) throw new Error('فایل مهاجرت باید یک شیء JSON معتبر باشد.');
  const expectedArrays = ['groups','equipments','checklists','sections','items','controls','drafts','opHours','failLocs','shifts','logs','savedFilters','archivedYears','users'];
  for (const key of expectedArrays) if (!Array.isArray(legacy[key])) throw new Error(`ساختار داده قدیمی ناقص است: ${key}`);
  for (const key of ['branding','layouts','perms','yearAccess']) if (!isObject(legacy[key])) throw new Error(`بخش تنظیمات داده قدیمی ناقص است: ${key}`);
  if (legacy.v !== 8) throw new Error(`نسخه داده قدیمی پشتیبانی نمی‌شود: ${String(legacy.v)}؛ فقط نسخه ساختار 8 قابل انتقال است.`);
  const limits = { groups: 10000, equipments: 50000, checklists: 50000, sections: 100000, items: 250000, controls: 250000, drafts: 50000, opHours: 500000, failLocs: 1000, shifts: 100, logs: 1000000, savedFilters: 10000, archivedYears: 500, users: 1000 };
  for (const [key, limit] of Object.entries(limits)) if (legacy[key].length > limit) throw new Error(`تعداد رکوردهای ${key} از حد امن انتقال بیشتر است.`);

  const state = structuredClone(legacy);
  delete state.users;
  delete state.plc;
  state.sync = [];
  // Records created by the retired, non-authoritative PLC feature are never migrated.
  const autoEquipmentIds = new Set((state.opHours || []).filter(x => x?.source === 'AUTO').map(x => x.equipmentId));
  state.opHours = (state.opHours || []).filter(x => x?.source !== 'AUTO');
  for (const item of state.opHours) if (autoEquipmentIds.has(item.equipmentId)) item.diff = null;
  for (const control of state.controls || []) {
    if (control.opSource === 'AUTO') { delete control.opSource; delete control.opHours; }
  }
  for (const filter of state.savedFilters || []) if (filter?.filters?.source === 'AUTO') filter.filters.source = '';

  const current = Array.isArray(currentUsers) ? currentUsers.map(u => ({ ...u, pass: undefined })) : [];
  const usernames = new Set(current.map(u => String(u.username).toLowerCase()));
  const idMap = new Map();
  const importedUsers = [];
  const legacyUsers = Array.isArray(legacy.users) ? legacy.users : [];
  const oldGroups = new Set((state.groups || []).map(g => g.id));

  const createLegacyIdentity = (oldId, oldUser = {}) => {
    if (typeof oldId !== 'string' || !oldId) return null;
    if (idMap.has(oldId)) return idMap.get(oldId);
    const base = String(oldUser.username || `former-${oldId}`).toLowerCase().replace(/[^a-z0-9._@-]/g, '-').slice(0, 80);
    let username = `legacy_${base}`.slice(0, 128);
    let suffix = 1;
    while (!validUsername(username) || usernames.has(username.toLowerCase())) {
      const tail = `_${suffix++}`;
      username = (`legacy_${base.slice(0, 128 - tail.length - 7)}${tail}`).slice(0, 128);
    }
    const id = randomUUID();
    const groups = oldUser.groupIds === 'all' ? 'all' : Array.isArray(oldUser.groupIds) ? oldUser.groupIds.filter(g => oldGroups.has(g)) : [];
    const identity = {
      id, username, name: safeName(oldUser.name, 'کاربر منتقل‌شده از نسخه قبلی'), role: 'viewer',
      active: false, groupIds: groups, pass: securePlaceholderPassword(),
    };
    idMap.set(oldId, id); usernames.add(username.toLowerCase()); importedUsers.push(identity);
    return id;
  };

  const currentByUsername = new Map(current.map(u => [String(u.username).toLowerCase(), u]));
  for (const oldUser of legacyUsers) {
    if (!isObject(oldUser) || typeof oldUser.id !== 'string') continue;
    const matchingCurrent = typeof oldUser.username === 'string' ? currentByUsername.get(oldUser.username.trim().toLowerCase()) : null;
    if (matchingCurrent) idMap.set(oldUser.id, matchingCurrent.id);
    else createLegacyIdentity(oldUser.id, oldUser);
  }
  const referencedIds = new Set();
  for (const item of state.controls || []) if (typeof item.techId === 'string') referencedIds.add(item.techId);
  for (const item of state.drafts || []) if (typeof item.techId === 'string') referencedIds.add(item.techId);
  for (const item of state.opHours || []) if (typeof item.techId === 'string') referencedIds.add(item.techId);
  for (const item of state.logs || []) if (typeof item.userId === 'string') referencedIds.add(item.userId);
  for (const item of state.savedFilters || []) if (typeof item.userId === 'string') referencedIds.add(item.userId);
  for (const id of Object.keys(state.layouts || {})) if (id !== 'default') referencedIds.add(id);
  for (const id of Object.keys(state.yearAccess || {})) if (id !== 'default' && !/^\d{4}$/.test(id)) referencedIds.add(id);
  for (const id of referencedIds) if (!idMap.has(id)) createLegacyIdentity(id, { name: `کاربر سابق (${id.slice(0, 12)})` });

  const mapId = oldId => idMap.get(oldId) || oldId;
  for (const item of state.controls || []) if (item.techId) item.techId = mapId(item.techId);
  for (const item of state.drafts || []) if (item.techId) item.techId = mapId(item.techId);
  for (const item of state.opHours || []) if (item.techId) item.techId = mapId(item.techId);
  for (const item of state.logs || []) {
    if (item.userId) item.userId = mapId(item.userId);
    if (typeof item.userName !== 'string') item.userName = 'کاربر نسخه قبلی';
  }
  for (const item of state.savedFilters || []) if (item.userId) item.userId = mapId(item.userId);
  const mappedLayouts = {};
  for (const [id, value] of Object.entries(state.layouts || {})) mappedLayouts[mapId(id)] = value;
  state.layouts = mappedLayouts;
  const mappedYearAccess = {};
  for (const [id, value] of Object.entries(state.yearAccess || {})) mappedYearAccess[/^\d{4}$/.test(id) ? id : mapId(id)] = value;
  state.yearAccess = mappedYearAccess;

  const admin = current.find(u => u.role === 'admin' && u.active);
  if (!admin) throw new Error('برای انتقال اطلاعات، حساب مدیر فعال لازم است.');
  const importLog = {
    id: `migration-${randomUUID()}`, userId: admin.id, userName: admin.name, action: 'SYNC',
    entity: 'LegacyBrowserDatabase', detail: `انتقال داده‌های نسخه قبلی؛ ${state.equipments.length} تجهیز، ${state.controls.length} کنترل و ${state.opHours.length} رکورد ساعت کارکرد`,
    dateKey: audit.dateKey || '1400/01/01', time: audit.time || '00:00', ip: 'server-migration',
  };
  state.logs = [...(state.logs || []), importLog];
  return { state, users: [...current, ...importedUsers], importedUsers: importedUsers.length };
}
