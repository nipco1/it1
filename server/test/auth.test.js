import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createHash } from 'node:crypto';
const origin = 'https://control.example.test';
const users = [{ id: 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b', username: 'admin', name: 'مدیر', role: 'admin', active: true, passwordHash: 'hash' }];
const sessions = new Map();
const store = {
  async findUser(username) { return users.find(x => x.username === username) || null; },
  async createSession(hash, userId, expiresAt) { sessions.set(hash, { userId, expiresAt }); },
  async findSession(hash) { const s = sessions.get(hash); return s && s.expiresAt > new Date() ? users.find(u => u.id === s.userId && u.active) : null; },
  async deleteSession(hash) { sessions.delete(hash); },
};
const app = createApp({ store, dummyHash: 'dummy', publicOrigin: origin, verifyPassword: async (hash, pass) => hash === 'hash' && pass === 'correct password' });
let server, base;
before(async () => { server = app.listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(async () => { await new Promise(r => server.close(r)); });
const login = (body, source = origin) => fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: source }, body: JSON.stringify(body) });

test('state-changing requests require the configured HTTPS origin', async () => {
  const response = await login({ username: 'admin', password: 'correct password' }, 'https://attacker.example');
  assert.equal(response.status, 403); assert.equal(sessions.size, 0);
});
test('invalid credentials and disabled users are rejected without exposing differences', async () => {
  const a = await login({ username: 'admin', password: 'wrong' });
  const b = await login({ username: 'unknown', password: 'wrong' });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.deepEqual(await a.json(), await b.json());
  users[0].active = false;
  const c = await login({ username: 'admin', password: 'correct password' });
  assert.equal(c.status, 401); users[0].active = true;
});
test('session token is random, stored as a hash, scoped to HTTPS and revoked on logout', async () => {
  const response = await login({ username: 'admin', password: 'correct password' });
  assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.user.username, 'admin'); assert.equal(body.user.passwordHash, undefined);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /HttpOnly/); assert.match(setCookie, /Secure/); assert.match(setCookie, /SameSite=Strict/i);
  const cookie = setCookie.split(';')[0]; const token = cookie.split('=')[1];
  const hash = createHash('sha256').update(token).digest('hex');
  assert.equal(sessions.has(hash), true); assert.equal(sessions.has(token), false);
  let me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } }); assert.equal(me.status, 200);
  users[0].active = false;
  me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } }); assert.equal(me.status, 401);
  users[0].active = true;
  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie, Origin: origin } });
  assert.equal(logout.status, 204); assert.equal(sessions.has(hash), false);
  me = await fetch(base + '/api/auth/me', { headers: { Cookie: cookie } }); assert.equal(me.status, 401);
});
test('duplicate session cookies are rejected', async () => {
  const response = await fetch(base + '/api/auth/me', { headers: { Cookie: '__Secure-control_session=' + 'a'.repeat(64) + '; __Secure-control_session=' + 'b'.repeat(64) } });
  assert.equal(response.status, 401);
});
test('insecure public origin is rejected', () => assert.throws(() => createApp({ store, dummyHash: 'dummy', publicOrigin: 'http://example.test', verifyPassword: async () => false })));

test('Argon2id hashes verify correct passwords and reject incorrect ones', async () => {
  const argon2 = (await import('argon2')).default;
  const hash = await argon2.hash('strong example passphrase', {type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1});
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(hash, 'strong example passphrase'), true);
  assert.equal(await argon2.verify(hash, 'incorrect password'), false);
});
