import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { createApp } from '../src/app.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, '..', '..', 'dist');
const origin = 'https://nipco-prod.test';

const hashPass = p => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

const ids = {
  admin: 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b',
  supervisor: '11111111-1111-4111-8111-111111111111',
  engineer: '22222222-2222-4222-8222-222222222222',
  tech: '33333333-3333-4333-8333-333333333333',
  viewer: '44444444-4444-4444-8444-444444444444',
};

const defaultPerms = () => {
  const actions = ['view', 'create', 'edit', 'delete', 'submit', 'export', 'print', 'approve'];
  const modules = ['dashboard', 'control', 'reports', 'equipment', 'settings'];
  const make = enabled => Object.fromEntries(modules.flatMap(m => actions.map(a => [`${m}:${a}`, enabled.includes('*') || enabled.includes(`${m}:${a}`)])));
  return {
    admin: make(['*']),
    supervisor: make(['dashboard:view', 'control:view', 'control:create', 'control:edit', 'control:submit', 'control:approve', 'control:print', 'reports:view', 'reports:export', 'reports:print', 'equipment:view', 'equipment:edit', 'settings:view']),
    engineer: make(['dashboard:view', 'control:view', 'control:create', 'control:submit', 'control:print', 'reports:view', 'reports:export', 'reports:print', 'equipment:view', 'equipment:edit', 'settings:view']),
    technician: make(['dashboard:view', 'control:view', 'control:create', 'control:submit', 'control:print', 'reports:view', 'equipment:view']),
    viewer: make(['dashboard:view', 'control:view', 'reports:view', 'reports:print', 'equipment:view']),
  };
};

function makeHarness(initialUsers = []) {
  const users = [...initialUsers];
  const sessions = new Map();
  const backups = [];
  let revision = 0;
  let state = null;
  let dbHealthy = true;

  const store = {
    async findUser(username) { return users.find(u => u.username === username) || null; },
    async listUsers() { return users.map(({ passwordHash, ...u }) => structuredClone(u)); },
    async createSession(hash, userId, expiresAt) { sessions.set(hash, { userId, expiresAt }); },
    async findSession(hash) {
      const s = sessions.get(hash);
      return s && s.expiresAt > new Date() ? users.find(u => u.id === s.userId && u.active) || null : null;
    },
    async deleteSession(hash) { sessions.delete(hash); },
    async loadAppState() {
      if (!dbHealthy) throw new Error('SQL offline');
      return { revision, state: state ? structuredClone(state) : null };
    },
    async loadRevision() { return revision; },
    async createBackup(userId) {
      const b = { fileName: `NIPCO_Control_${backups.length + 1}.bak`, size: 1048576, backupType: 'FULL', createdBy: userId, createdAt: new Date().toISOString(), verified: false };
      backups.unshift(b);
      return b;
    },
    async listBackups() { return structuredClone(backups); },
    async saveAppState(expectedRevision, payload, _userId, userChanges, hashPassword) {
      if (expectedRevision !== revision) return { kind: 'conflict', revision };
      if (userChanges) {
        const nextUsers = [];
        for (const u of userChanges) {
          const prev = users.find(x => x.id === u.id);
          const passwordHash = u.pass ? await hashPassword(u.pass) : prev?.passwordHash;
          assert.ok(passwordHash, 'every stored user must have a password hash');
          const { pass, ...clean } = u;
          nextUsers.push({ ...clean, passwordHash });
        }
        users.splice(0, users.length, ...nextUsers);
      }
      state = structuredClone(payload);
      revision += 1;
      return { kind: 'saved', revision, users: await this.listUsers() };
    },
  };

  return { store, users, sessions, setDbHealthy: v => { dbHealthy = v; }, getState: () => state, getRevision: () => revision };
}

async function loginAs(base, username, password) {
  const res = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(res.status, 200, `login failed for ${username}`);
  return res.headers.get('set-cookie').split(';')[0];
}

function todayJalali() {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const p = t => parts.find(x => x.type === t)?.value || '00';
  return `${p('year')}/${p('month')}/${p('day')}`;
}

let server, base, harness, adminCookie, supCookie, engCookie, techCookie, viewerCookie;

before(async () => {
  const adminHash = await hashPass('AdminPass-2026-Strong!');
  harness = makeHarness([
    { id: ids.admin, username: 'admin', name: 'مدیر ارشد', role: 'admin', active: true, groupIds: 'all', passwordHash: adminHash },
  ]);
  const dummyHash = await hashPass('Dummy-Not-Used-Password-99');
  const app = createApp({
    store: harness.store,
    verifyPassword: argon2.verify,
    hashPassword: hashPass,
    dummyHash,
    publicOrigin: origin,
    staticRoot: distRoot,
  });
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  adminCookie = await loginAs(base, 'admin', 'AdminPass-2026-Strong!');
});

after(async () => {
  await new Promise(r => server.close(r));
});

test('production build static serving, CSP headers, and health check', async () => {
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /<div id="root">/);
  assert.equal(home.headers.get('x-powered-by'), null);
  assert.match(home.headers.get('content-security-policy') || '', /default-src 'self'/);

  const healthOk = await fetch(base + '/api/health');
  assert.equal(healthOk.status, 200);
  assert.deepEqual(await healthOk.json(), { ok: true, database: 'connected' });

  harness.setDbHealthy(false);
  const healthDown = await fetch(base + '/api/health');
  assert.equal(healthDown.status, 503);
  harness.setDbHealthy(true);
});

test('admin initializes state with groups, equipment, checklists, and all 5 roles using real Argon2id', async () => {
  const initState = {
    v: 8,
    groups: [
      { id: 'grp-comp', code: 'COMP', name: 'کمپرسورها', icon: 'compressor', description: 'کمپرسور هوا', displayOrder: 1, isActive: true, trackHours: true },
      { id: 'grp-press', code: 'PRS', name: 'پرس‌ها', icon: 'press', description: 'پرس هیدرولیک', displayOrder: 2, isActive: true, trackHours: false },
    ],
    equipments: [
      { id: 'eq-comp-1', code: 'CMP-01', name: 'کمپرسور ۱', groupId: 'grp-comp', brand: 'Atlas', model: 'GA55', serial: 'SN-100', capacity: '55kW', hall: 'سوله ۱', line: 'خط ۱', area: 'ناحیه الف', status: 'active', commissionDate: '1403/01/01' },
      { id: 'eq-press-1', code: 'PRS-01', name: 'پرس ۱', groupId: 'grp-press', brand: 'Schuler', model: 'H1000', serial: 'SN-200', capacity: '1000T', hall: 'سوله ۲', line: 'خط ۲', area: 'ناحیه ب', status: 'active', commissionDate: '1403/01/01' },
    ],
    checklists: [
      { id: 'cl-comp', name: 'چک‌لیست کمپرسور', groupId: 'grp-comp' },
      { id: 'cl-press', name: 'چک‌لیست پرس', groupId: 'grp-press' },
    ],
    sections: [
      { id: 'sec-comp-1', checklistId: 'cl-comp', title: 'بررسی عمومی', order: 1 },
      { id: 'sec-press-1', checklistId: 'cl-press', title: 'ایمنی پرس', order: 1 },
    ],
    items: [
      { id: 'it-oil', sectionId: 'sec-comp-1', title: 'سطح روغن', type: 'oknok' },
      { id: 'it-temp', sectionId: 'sec-comp-1', title: 'دمای هوا', type: 'numeric', unit: 'C', min: 40, max: 90, precision: 1 },
      { id: 'it-guard', sectionId: 'sec-press-1', title: 'گارد ایمنی', type: 'oknok' },
    ],
    controls: [], drafts: [], opHours: [],
    failLocs: [{ id: 'fl-mechanical', name: 'مکانیکی' }, { id: 'fl-electrical', name: 'برقی' }],
    shifts: [
      { id: 'shift-1', name: 'شیفت ۱', from: '06:00', to: '14:00' },
      { id: 'shift-2', name: 'شیفت ۲', from: '14:00', to: '22:00' },
      { id: 'shift-3', name: 'شیفت ۳', from: '22:00', to: '06:00' },
    ],
    users: [
      { id: ids.admin, username: 'admin', name: 'مدیر ارشد', role: 'admin', active: true, groupIds: 'all' },
      { id: ids.supervisor, username: 'sup01', name: 'سرپرست نت', role: 'supervisor', active: true, groupIds: 'all', pass: 'Supervisor-Pass-2026' },
      { id: ids.engineer, username: 'eng01', name: 'مهندس نت', role: 'engineer', active: true, groupIds: ['grp-comp'], pass: 'Engineer-Pass-2026' },
      { id: ids.tech, username: 'tech01', name: 'تکنسین ۱', role: 'technician', active: true, groupIds: ['grp-comp'], pass: 'Technician-Pass-2026' },
      { id: ids.viewer, username: 'view01', name: 'ممیز ۱', role: 'viewer', active: true, groupIds: ['grp-comp'], pass: 'Viewer-Pass-2026' },
    ],
    logs: [{ id: 'log-init', userId: ids.admin, userName: 'مدیر ارشد', action: 'INSERT', entity: 'Setup', detail: 'مقداردهی اولیه', dateKey: todayJalali(), time: '08:00', ip: 'ثبت‌شده در سرور' }],
    sync: [],
    branding: { logoText: 'NIPCO', title: 'سامانه کنترل روزانه', subtitle: 'NIPCO', welcome: 'خوش آمدید', footer: 'NIPCO', version: '2.4.1', primary: '#f5a623', radius: 10 },
    layouts: {}, savedFilters: [], perms: defaultPerms(), yearAccess: { '1405': 'full' }, archivedYears: [], theme: 'industrial',
  };

  const res = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: 0, state: initState }),
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.revision, 1);
  assert.equal(body.stampedLogs.length, 1);
  assert.notEqual(body.stampedLogs[0].ip, 'ثبت‌شده در سرور');

  // Verify sequential second save works when client patches stampedLogs from save #1!
  const secondState = {
    ...initState,
    users: body.users,
    logs: [...body.stampedLogs, { id: 'log-second', userId: ids.admin, userName: 'مدیر ارشد', action: 'UPDATE', entity: 'Branding', detail: 'تست ذخیره دوم متوالی', dateKey: todayJalali(), time: '08:01', ip: 'ثبت‌شده در سرور' }],
  };
  const res2 = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: body.revision, state: secondState }),
  });
  assert.equal(res2.status, 200, 'second sequential save must succeed with synced stampedLogs');

  // Log in all other roles with their real Argon2id passwords
  supCookie = await loginAs(base, 'sup01', 'Supervisor-Pass-2026');
  engCookie = await loginAs(base, 'eng01', 'Engineer-Pass-2026');
  techCookie = await loginAs(base, 'tech01', 'Technician-Pass-2026');
  viewerCookie = await loginAs(base, 'view01', 'Viewer-Pass-2026');
});

test('technician submits draft, daily control (OK+NOK+hours), second sequential save, and rejects bad data', async () => {
  const today = todayJalali();
  const initial = await (await fetch(base + '/api/state', { headers: { Cookie: techCookie } })).json();
  assert.deepEqual(initial.state.groups.map(g => g.id), ['grp-comp']);
  assert.deepEqual(initial.state.equipments.map(e => e.id), ['eq-comp-1']);

  // 1) Save draft with shift-1
  const draftState = {
    ...initial.state,
    users: initial.users,
    drafts: [{ id: `dr-${ids.tech}-eq-comp-1-${today}`, equipmentId: 'eq-comp-1', dateKey: today, shiftId: 'shift-1', techId: ids.tech, items: { 'it-oil': { itemId: 'it-oil', result: 'ok', failLocId: null, desc: '' } }, opHours: 1200, updatedAt: `${today} - 09:00`, startedAt: `${today} - 08:55` }],
  };
  const draftRes = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: initial.revision, state: draftState }),
  });
  assert.equal(draftRes.status, 200);
  const draftBody = await draftRes.json();

  // 2) Submit control including UI's failLocId:null/desc:'' on OK item + out-of-range numeric NOK + opHours
  const controlId = 'dc-' + randomUUID();
  const control = {
    id: controlId,
    equipmentId: 'eq-comp-1',
    dateKey: today,
    shiftId: 'shift-1',
    techId: ids.tech,
    status: 'nok',
    items: {
      'it-oil': { itemId: 'it-oil', result: 'ok', failLocId: null, desc: '' },
      'it-temp': { itemId: 'it-temp', value: 98.5, result: 'nok', failLocId: 'fl-mechanical', desc: 'دمای غیرمجاز خروجی' },
    },
    opHours: 1200,
    opSource: 'MANUAL',
    createdAt: `${today} - 09:05`,
    submittedAt: `${today} - 09:05`,
    startedAt: `${today} - 08:55`,
  };
  const submitState = {
    ...draftState,
    drafts: [],
    controls: [control],
    opHours: [{ id: 'id-' + randomUUID(), equipmentId: 'eq-comp-1', hours: 1200, diff: null, source: 'MANUAL', techId: ids.tech, dateKey: today, time: '09:05', note: 'ثبت دستی' }],
    logs: [...draftState.logs, { id: 'log-tech-1', userId: ids.tech, userName: 'تکنسین ۱', action: 'INSERT', entity: 'DailyControls', detail: 'ثبت نهایی فرم با انحراف', dateKey: today, time: '09:05', ip: 'ثبت‌شده در سرور' }],
  };
  const subRes = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: draftBody.revision, state: submitState }),
  });
  assert.equal(subRes.status, 200, 'technician daily control submit must succeed');
  const subBody = await subRes.json();
  assert.equal(subBody.stampedLogs.length, 1);

  // 3) Second sequential save by technician (layout + audit export log) using stampedLogs
  const save2State = {
    ...submitState,
    layouts: { [ids.tech]: [{ key: 'kpis', span: 12 }] },
    logs: [...subBody.stampedLogs, { id: 'log-tech-2', userId: ids.tech, userName: 'تکنسین ۱', action: 'EXPORT', entity: 'Reports', detail: 'خروجی گزارش', dateKey: today, time: '09:06', ip: 'ثبت‌شده در سرور' }],
  };
  const save2Res = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: subBody.revision, state: save2State }),
  });
  assert.equal(save2Res.status, 200, 'technician second sequential save must succeed');

  // 4) Duplicate control on same date must be rejected (403)
  const dupRes = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: (await save2Res.json()).revision,
      state: { ...save2State, controls: [...save2State.controls, { ...control, id: 'dc-' + randomUUID() }] },
    }),
  });
  assert.equal(dupRes.status, 403);

  // 5) Technician cannot edit equipment or access backups
  const cur = await (await fetch(base + '/api/state', { headers: { Cookie: techCookie } })).json();
  const eqEditDenied = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: cur.revision,
      state: { ...cur.state, users: cur.users, equipments: [...cur.state.equipments, { ...cur.state.equipments[0], id: 'eq-unauth', code: 'UNAUTH' }] },
    }),
  });
  assert.equal(eqEditDenied.status, 403);
  assert.equal((await fetch(base + '/api/backups', { headers: { Cookie: techCookie } })).status, 403);
});

test('permission matrix: viewer read-only, engineer equipment edit, supervisor cancel + technician resubmit with new hours', async () => {
  const today = todayJalali();
  // Viewer cannot submit control
  const vState = await (await fetch(base + '/api/state', { headers: { Cookie: viewerCookie } })).json();
  const vSubmit = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: viewerCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: vState.revision,
      state: {
        ...vState.state,
        users: vState.users,
        controls: [...vState.state.controls, { id: 'dc-' + randomUUID(), equipmentId: 'eq-comp-1', dateKey: '1405/08/01', shiftId: 'shift-1', techId: ids.viewer, status: 'completed', items: { 'it-oil': { itemId: 'it-oil', result: 'ok' }, 'it-temp': { itemId: 'it-temp', value: 60, result: 'ok' } }, opHours: 1000, createdAt: '1405/08/01 - 08:00', submittedAt: '1405/08/01 - 08:00', startedAt: '1405/08/01 - 07:50' }],
      },
    }),
  });
  assert.equal(vSubmit.status, 403);

  // Engineer can add equipment in allowed group, but cannot delete equipment or edit groups
  const eState = await (await fetch(base + '/api/state', { headers: { Cookie: engCookie } })).json();
  const newEq = { id: 'eq-comp-2', code: 'CMP-02', name: 'کمپرسور ۲', groupId: 'grp-comp', brand: 'Atlas', model: 'GA75', serial: 'SN-102', capacity: '75kW', hall: 'سوله ۱', line: 'خط ۱', area: 'ناحیه الف', status: 'active', commissionDate: '1404/01/01' };
  const eAdd = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: engCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: eState.revision, state: { ...eState.state, users: eState.users, equipments: [...eState.state.equipments, newEq] } }),
  });
  assert.equal(eAdd.status, 200);
  const eAfterAdd = await eAdd.json();

  const eDelDenied = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: engCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: eAfterAdd.revision, state: { ...eState.state, users: eState.users } }),
  });
  assert.equal(eDelDenied.status, 403);

  // Supervisor cancels technician's control (with reason); blank reason is rejected
  const sState = await (await fetch(base + '/api/state', { headers: { Cookie: supCookie } })).json();
  const target = sState.state.controls[0];
  assert.ok(target);
  const cancelNoReason = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: supCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: sState.revision,
      state: { ...sState.state, users: sState.users, controls: sState.state.controls.map(c => c.id === target.id ? { ...c, status: 'cancelled', cancelReason: '   ' } : c) },
    }),
  });
  assert.equal(cancelNoReason.status, 403);

  const cancelOk = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: supCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: sState.revision,
      state: { ...sState.state, users: sState.users, controls: sState.state.controls.map(c => c.id === target.id ? { ...c, status: 'cancelled', cancelReason: 'خطای قرائت سنسور' } : c) },
    }),
  });
  assert.equal(cancelOk.status, 200);

  // After cancellation, technician can re-submit a fresh control with higher opHours on the same day!
  const tReload = await (await fetch(base + '/api/state', { headers: { Cookie: techCookie } })).json();
  const resubmitControl = {
    id: 'dc-' + randomUUID(),
    equipmentId: 'eq-comp-1',
    dateKey: today,
    shiftId: 'shift-1',
    techId: ids.tech,
    status: 'completed',
    items: {
      'it-oil': { itemId: 'it-oil', result: 'ok' },
      'it-temp': { itemId: 'it-temp', value: 72.5, result: 'ok' },
    },
    opHours: 1205,
    opSource: 'MANUAL',
    createdAt: `${today} - 09:30`,
    submittedAt: `${today} - 09:30`,
    startedAt: `${today} - 09:20`,
  };
  const resubmit = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: techCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      revision: tReload.revision,
      state: {
        ...tReload.state,
        users: tReload.users,
        controls: [...tReload.state.controls, resubmitControl],
        opHours: [...tReload.state.opHours, { id: 'id-' + randomUUID(), equipmentId: 'eq-comp-1', hours: 1205, diff: 5, source: 'MANUAL', techId: ids.tech, dateKey: today, time: '09:30', note: 'ثبت مجدد' }],
      },
    }),
  });
  assert.equal(resubmit.status, 200, 'technician must be able to resubmit control+hours after prior cancellation');
});

test('multi-user concurrency: stale revision returns HTTP 409 and shared central state stays consistent', async () => {
  const [aRead, sRead] = await Promise.all([
    fetch(base + '/api/state', { headers: { Cookie: adminCookie } }).then(r => r.json()),
    fetch(base + '/api/state', { headers: { Cookie: supCookie } }).then(r => r.json()),
  ]);
  assert.equal(aRead.revision, sRead.revision);

  const aWrite = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: aRead.revision, state: { ...aRead.state, users: aRead.users, branding: { ...aRead.state.branding, footer: 'NIPCO-SHARED-TEST' } } }),
  });
  assert.equal(aWrite.status, 200);
  const newRev = (await aWrite.json()).revision;

  // Supervisor submits stale revision -> HTTP 409
  const stale = await fetch(base + '/api/state', {
    method: 'PUT',
    headers: { Origin: origin, Cookie: supCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: sRead.revision, state: { ...sRead.state, users: sRead.users } }),
  });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).revision, newRev);

  // Supervisor polls revision and reads admin's update
  const revPoll = await (await fetch(base + '/api/state/revision', { headers: { Cookie: supCookie } })).json();
  assert.equal(revPoll.revision, newRev);
  const fresh = await (await fetch(base + '/api/state', { headers: { Cookie: supCookie } })).json();
  assert.equal(fresh.state.branding.footer, 'NIPCO-SHARED-TEST');
});

test('admin backup endpoints and legacy import guard on non-empty DB', async () => {
  const bCreate = await fetch(base + '/api/backups', { method: 'POST', headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(bCreate.status, 201);
  const bList = await (await fetch(base + '/api/backups', { headers: { Cookie: adminCookie } })).json();
  assert.equal(bList.backups.length, 1);
  assert.equal(bList.backups[0].verified, false);

  // Legacy import on non-empty DB must be rejected with 409
  const impConflict = await fetch(base + '/api/admin/import-legacy', {
    method: 'POST',
    headers: { Origin: origin, Cookie: adminCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ legacy: { v: 8 } }),
  });
  assert.equal(impConflict.status, 409);
});

test('legacy import succeeds on empty DB and login rate limiting returns HTTP 429', async () => {
  const freshAdminHash = await hashPass('Fresh-Admin-Pass-2026!');
  const fresh = makeHarness([
    { id: ids.admin, username: 'admin', name: 'مدیر تازه', role: 'admin', active: true, groupIds: 'all', passwordHash: freshAdminHash },
  ]);
  const freshApp = createApp({
    store: fresh.store,
    verifyPassword: argon2.verify,
    hashPassword: hashPass,
    dummyHash: await hashPass('Dummy-Fresh-Pass-99'),
    publicOrigin: origin,
  });
  const srv = freshApp.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    const cookie = await loginAs(url, 'admin', 'Fresh-Admin-Pass-2026!');
    const legacy = {
      v: 8,
      groups: [{ id: 'g-old', code: 'OLD', name: 'گروه قدیم', icon: 'box', description: '', displayOrder: 1, isActive: true, trackHours: false }],
      equipments: [{ id: 'e-old', code: 'E-OLD', name: 'تجهیز قدیم', groupId: 'g-old', brand: '', model: '', serial: '', capacity: '', hall: '', line: '', area: '', status: 'active', commissionDate: '1402/01/01' }],
      checklists: [], sections: [], items: [], controls: [], drafts: [], opHours: [],
      failLocs: [{ id: 'fl-1', name: 'مکانیکی' }], shifts: [{ id: 'shift-1', name: 'شیفت ۱', from: '06:00', to: '14:00' }],
      users: [{ id: 'u-old', username: 'oldtech', name: 'کاربر قدیم', pass: 'plain123', role: 'technician', active: true, groupIds: ['g-old'] }],
      logs: [], sync: [{ id: 's1', status: 'pending' }],
      branding: { logoText: 'NIPCO', title: 'سامانه', subtitle: 'sys', welcome: 'w', footer: 'f', version: '1.0', primary: '#f5a623', radius: 10 },
      layouts: {}, savedFilters: [], perms: defaultPerms(), yearAccess: { '1405': 'full' }, archivedYears: [], theme: 'industrial',
    };
    const imp = await fetch(url + '/api/admin/import-legacy', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacy }),
    });
    assert.equal(imp.status, 201);
    const impBody = await imp.json();
    assert.equal(impBody.imported.equipments, 1);
    assert.equal(impBody.imported.importedLegacyAccountsDisabled, 1);
    assert.equal(impBody.users.find(u => u.username.startsWith('legacy_')).active, false);

    // Trigger rate limit (1 login succeeded above + 9 failed = 10; 11th must be 429)
    for (let i = 0; i < 9; i++) {
      const r = await fetch(url + '/api/auth/login', {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      });
      assert.equal(r.status, 401);
    }
    const throttled = await fetch(url + '/api/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
    });
    assert.equal(throttled.status, 429);
  } finally {
    await new Promise(r => srv.close(r));
  }
});
