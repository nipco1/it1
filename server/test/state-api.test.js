import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const origin = 'https://nipco.test';
const admin = { id: 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b', username: 'admin', name: 'مدیر سامانه', role: 'admin', active: true, groupIds: 'all', passwordHash: 'hash' };
const secondAdmin = { id: 'a1f8825b-77a5-4c84-9a0a-e2da82b2bb1', username: 'admin2', name: 'مدیر دوم', role: 'admin', active: true, groupIds: 'all', passwordHash: 'hash' };
const technician = { id: 'b1f8825b-77a5-4c84-9a0a-e2da82b2bb2', username: 'tech01', name: 'تکنسین گروه یک', role: 'technician', active: true, groupIds: ['group-1'], passwordHash: 'hash' };
const users = [admin];
const sessions = new Map();
let revision = 0;
let state = null;
const store = {
  async findUser(username) { return users.find(user => user.username === username) || null; },
  async listUsers() { return users.map(({ passwordHash, ...user }) => ({ ...user })); },
  async createSession(hash, userId, expiresAt) { sessions.set(hash, { userId, expiresAt }); },
  async findSession(hash) { const session = sessions.get(hash); return session && session.expiresAt > new Date() ? users.find(user => user.id === session.userId && user.active) || null : null; },
  async deleteSession(hash) { sessions.delete(hash); },
  async loadAppState() { return { revision, state }; },
  async loadRevision() { return revision; },
  async saveAppState(expectedRevision, payload, userId, userChanges) {
    if (expectedRevision !== revision) return { kind: 'conflict', revision };
    if (userChanges) users.splice(0, users.length, ...userChanges.map(({ pass, ...u }) => ({ ...u, passwordHash: 'hash' })));
    state = payload; revision += 1;
    return { kind: 'saved', revision, users: await this.listUsers() };
  },
};
const app = createApp({ store, dummyHash: 'dummy', publicOrigin: origin, verifyPassword: async (hash, pass) => hash === 'hash' && pass === 'correct-password', hashPassword: async pass => `hashed:${pass}` });
let server, base, cookie;
before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'ADMIN', password: 'correct-password' }) });
  assert.equal(response.status, 200);
  cookie = response.headers.get('set-cookie').split(';')[0];
});
after(async () => { await new Promise(resolve => server.close(resolve)); });

const publicUsers = () => users.map(({ passwordHash, ...u }) => ({ ...u }));

const emptyState = () => ({
  v: 8, groups: [{id:'group-1',code:'G1',name:'گروه یک'},{id:'group-2',code:'G2',name:'گروه دو'}], equipments: [{id:'eq-1',groupId:'group-1'},{id:'eq-2',groupId:'group-2'}], checklists: [], sections: [], items: [], controls: [], drafts: [], opHours: [],
  failLocs: [{ id: 'fl-mechanical', name: 'مکانیکی' }], shifts: [{ id: 'shift-1', name: 'شیفت ۱', from: '06:00', to: '14:00' }],
  users: [admin, secondAdmin, technician].map(({passwordHash, ...u})=>u),
  logs: [], sync: [], branding: { logoText: 'NIPCO', title: 'سامانه', subtitle: 'System', welcome: 'ورود', footer: 'NIPCO', version: '1.0.0', primary: '#f5a623', radius: 10 },
  layouts: {}, savedFilters: [], perms: { admin: { '*': true } }, yearAccess: { '1405': 'full' }, archivedYears: [], theme: 'industrial',
});

test('first administrator initializes the central SQL-backed application state', async () => {
  const response = await fetch(base + '/api/state', { method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 0, state: emptyState() }) });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, 1);
  assert.ok(state);
  assert.equal(state.groups.length,2);
});

test('audit log is append-only and actor/time/IP are assigned by the server', async () => {
  const next = { ...state, users: publicUsers(), logs: [{ id: 'log-test', action: 'INSERT', entity: 'DailyControls', detail: 'ثبت آزمون کنترل', userId: 'forged', userName: 'جعل‌شده', dateKey: '1400/01/01', time: '00:00', ip: 'fake' }] };
  const response = await fetch(base + '/api/state', { method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 1, state: next }) });
  assert.equal(response.status, 200);
  assert.equal(state.logs[0].userId, admin.id);
  assert.equal(state.logs[0].userName, admin.name);
  assert.notEqual(state.logs[0].ip, 'fake');
  assert.match(state.logs[0].dateKey, /^\d{4}\/\d{2}\/\d{2}$/);
  const second = { ...state, users: publicUsers(), logs: [...state.logs, { id: 'log-test-2', action: 'UPDATE', entity: 'Equipment', detail: 'رویداد دوم', userId: 'forged', userName: 'x', dateKey: '1400/01/01', time: '00:00', ip: 'fake' }] };
  const append = await fetch(base + '/api/state', { method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 2, state: second }) });
  assert.equal(append.status, 200);
  assert.deepEqual(state.logs.map(x=>x.id), ['log-test','log-test-2']);
  assert.equal(state.logs[1].userId, admin.id);
});

test('old application revision is rejected instead of overwriting another session', async () => {
  const response = await fetch(base + '/api/state', { method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: 2, state: { ...state, users: publicUsers() } }) });
  assert.equal(response.status, 409);
});

test('read state requires a valid session and returns current central revision', async () => {
  const denied = await fetch(base + '/api/state');
  assert.equal(denied.status, 401);
  const allowed = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
  assert.equal(allowed.status, 200);
  const body = await allowed.json();
  assert.equal(body.revision, revision);
  assert.equal(body.state.logs.length, 2);
});

test('non-admin state projection restricts equipment groups and never reveals administrator accounts', async () => {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'tech01', password: 'correct-password' }) });
  assert.equal(response.status, 200);
  const techCookie = response.headers.get('set-cookie').split(';')[0];
  const result = await fetch(base + '/api/state', { headers: { Cookie: techCookie } });
  assert.equal(result.status, 200);
  const body = await result.json();
  assert.deepEqual(body.state.groups.map(x=>x.id), ['group-1']);
  assert.deepEqual(body.state.equipments.map(x=>x.id), ['eq-1']);
  assert.deepEqual(body.users.map(x=>x.id), [technician.id]);
});

test('authenticated clients can check the central state revision without downloading the full document', async () => {
  const response = await fetch(base + '/api/state/revision', { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).revision, revision);
  const denied = await fetch(base + '/api/state/revision');
  assert.equal(denied.status, 401);
});


test('admin password input is hashed in Users and never stored or returned in AppState JSON', async () => {
  const secret = 'Temporary-Secure-Pass-9274';
  const added = {
    id: 'c3f8825b-77a5-4c84-9a0a-e2da82b2bb33', username: 'new.operator', name: 'کاربر جدید',
    role: 'technician', active: true, groupIds: ['group-1'], pass: secret,
  };
  const next = { ...state, users: [...publicUsers(), added] };
  const saved = await fetch(base + '/api/state', {
    method: 'PUT', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, state: next }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(state.users, undefined);
  assert.equal(JSON.stringify(state).includes(secret), false);
  assert.equal(JSON.stringify(savedBody).includes(secret), false);
  const read = await fetch(base + '/api/state', { headers: { Cookie: cookie } });
  assert.equal(read.status, 200);
  const body = await read.json();
  assert.equal(body.state.users, undefined);
  assert.equal(body.users.some(u => Object.hasOwn(u, 'pass') || Object.hasOwn(u, 'passwordHash')), false);
  assert.equal(body.users.some(u => u.username === 'new.operator'), true);
});
