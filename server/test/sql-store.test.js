import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSqlStore } from '../src/sql-store.js';

function createMockDriverAndPool() {
  const state = {
    users: new Map(),
    sessions: new Map(),
    appState: null,
    backups: [],
    executedSql: [],
    lastIsolation: null,
    commits: 0,
    rollbacks: 0,
  };

  class MockRequest {
    constructor(parent) {
      this.parent = parent;
      this.params = {};
    }
    input(name, _type, value) {
      this.params[name] = value;
      return this;
    }
    async query(sqlText) {
      const q = sqlText.trim();
      state.executedSql.push(q);

      if (q.startsWith('SELECT id, username, role, active, group_ids AS groupIds FROM control.Users')) {
        return { recordset: [...state.users.values()].map(u => ({ ...u })) };
      }
      if (q.startsWith('SELECT id, username, display_name AS name, role, active, group_ids AS groupIds FROM control.Users')) {
        return { recordset: [...state.users.values()].map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active, groupIds: u.groupIds })) };
      }
      if (q.startsWith('INSERT INTO control.Users')) {
        state.users.set(this.params.id.toLowerCase(), {
          id: this.params.id, username: this.params.username, name: this.params.name,
          role: this.params.role, active: !!this.params.active, groupIds: this.params.groups, passwordHash: this.params.hash,
        });
        return { recordset: [] };
      }
      if (q.startsWith('UPDATE control.Users SET active=0')) {
        const u = state.users.get(this.params.id.toLowerCase());
        if (u) u.active = false;
        for (const [k, s] of state.sessions) if (s.userId.toLowerCase() === this.params.id.toLowerCase()) state.sessions.delete(k);
        return { recordset: [] };
      }
      if (q.startsWith('UPDATE control.Users SET')) {
        const u = state.users.get(this.params.id.toLowerCase());
        u.username = this.params.username;
        u.name = this.params.name;
        u.role = this.params.role;
        u.active = !!this.params.active;
        u.groupIds = this.params.groups;
        if (this.params.hash) u.passwordHash = this.params.hash;
        return { recordset: [] };
      }
      if (q.startsWith('DELETE FROM control.Sessions WHERE user_id=@id')) {
        for (const [k, s] of state.sessions) if (s.userId.toLowerCase() === this.params.id.toLowerCase()) state.sessions.delete(k);
        return { recordset: [] };
      }
      if (q.startsWith('SELECT revision FROM control.AppState WITH (UPDLOCK,HOLDLOCK)')) {
        return { recordset: state.appState ? [{ revision: state.appState.revision }] : [] };
      }
      if (q.startsWith('SELECT revision, payload FROM control.AppState')) {
        return { recordset: state.appState ? [{ revision: state.appState.revision, payload: state.appState.payload }] : [] };
      }
      if (q.startsWith('INSERT INTO control.AppState')) {
        state.appState = { revision: 1, payload: this.params.payload, updatedBy: this.params.user };
        return { recordset: [] };
      }
      if (q.startsWith('UPDATE control.AppState')) {
        state.appState = { revision: state.appState.revision + 1, payload: this.params.payload, updatedBy: this.params.user };
        return { recordset: [] };
      }
      if (q.startsWith('SELECT DB_NAME()')) {
        return { recordset: [{ databaseName: 'NIPCO_Control' }] };
      }
      if (q.startsWith('BACKUP DATABASE')) {
        const m = q.match(/TO DISK = N'([^']+)'/);
        assert.ok(m, 'BACKUP DATABASE must contain TO DISK path');
        assert.match(q, /WITH INIT, CHECKSUM;/);
        fs.writeFileSync(m[1], 'mock-sql-backup-bytes');
        return { recordset: [] };
      }
      if (q.startsWith('INSERT INTO control.BackupHistory')) {
        state.backups.unshift({ fileName: this.params.file, size: this.params.size, backupType: 'FULL', createdAt: new Date().toISOString(), verified: 0 });
        return { recordset: [] };
      }
      if (q.startsWith('SELECT TOP 100 file_name')) {
        return { recordset: state.backups.map(b => ({ ...b })) };
      }
      throw new Error('Unexpected mock SQL query: ' + q);
    }
  }

  class MockTransaction {
    async begin(isolation) { state.lastIsolation = isolation; }
    async commit() { state.commits += 1; }
    async rollback() { state.rollbacks += 1; }
  }

  const driver = {
    ISOLATION_LEVEL: { SERIALIZABLE: 'SERIALIZABLE' },
    Transaction: MockTransaction,
    Request: MockRequest,
    UniqueIdentifier: 'UniqueIdentifier',
    NVarChar: () => 'NVarChar',
    VarChar: () => 'VarChar',
    Bit: 'Bit',
    Char: () => 'Char',
    DateTime2: 'DateTime2',
    BigInt: 'BigInt',
    MAX: 'MAX',
  };
  const pool = { request: () => new MockRequest(null) };
  return { state, driver, pool };
}

test('sql-store enforces SERIALIZABLE transactions, UUID validation, group normalization, and safe user lifecycle', async () => {
  const { state, driver, pool } = createMockDriverAndPool();
  const adminId = 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b';
  const techId = 'a2f8825b-77a5-4c84-9a0a-e2da82b2bb22';
  // Seed admin with legacy unquoted 'all' to verify normalization does NOT revoke admin's session
  state.users.set(adminId, { id: adminId, username: 'admin', name: 'مدیر', role: 'admin', active: true, groupIds: 'all', passwordHash: 'h0' });
  state.sessions.set('admin-sess', { userId: adminId });

  const tmpBackup = fs.mkdtempSync(path.join(os.tmpdir(), 'nipco-bak-'));
  try {
    const store = createSqlStore(pool, driver, tmpBackup);

    // 1) Initial save commits in SERIALIZABLE and preserves admin session despite 'all' vs '"all"'
    const saved1 = await store.saveAppState(0, { v: 8 }, adminId, [
      { id: adminId, username: 'admin', name: 'مدیر', role: 'admin', active: true, groupIds: 'all' },
      { id: techId, username: 'tech01', name: 'تکنسین', role: 'technician', active: true, groupIds: ['g1'], pass: 'StrongPass12345' },
    ], async p => `argon2:${p}`);
    assert.equal(saved1.kind, 'saved');
    assert.equal(saved1.revision, 1);
    assert.equal(state.lastIsolation, 'SERIALIZABLE');
    assert.equal(state.sessions.has('admin-sess'), true, 'admin session must NOT be revoked when groupIds is semantically unchanged');
    assert.equal(state.users.get(techId).passwordHash, 'argon2:StrongPass12345');

    // 2) Revision conflict rolls back cleanly
    const conflict = await store.saveAppState(0, { v: 8 }, adminId, null, null);
    assert.equal(conflict.kind, 'conflict');
    assert.equal(conflict.revision, 1);
    assert.equal(state.rollbacks, 1);

    // 3) Invalid prefixed user ID ("id-<uuid>") is rejected
    await assert.rejects(
      () => store.saveAppState(1, { v: 8 }, adminId, [
        { id: adminId, username: 'admin', name: 'مدیر', role: 'admin', active: true, groupIds: 'all' },
        { id: 'id-' + techId, username: 'badid', name: 'خطا', role: 'technician', active: true, groupIds: [], pass: 'StrongPass12345' },
      ], async p => p),
      /Invalid user record/,
    );

    // 4) Removing a user from list deactivates instead of deleting, and revokes their sessions
    state.sessions.set('tech-sess', { userId: techId });
    const saved2 = await store.saveAppState(1, { v: 8 }, adminId, [
      { id: adminId, username: 'admin', name: 'مدیر', role: 'admin', active: true, groupIds: 'all' },
    ], async p => p);
    assert.equal(saved2.kind, 'saved');
    assert.equal(state.users.get(techId).active, false);
    assert.equal(state.sessions.has('tech-sess'), false);

    // 5) Reactivating disabled user without fresh password is rejected
    await assert.rejects(
      () => store.saveAppState(2, { v: 8 }, adminId, [
        { id: adminId, username: 'admin', name: 'مدیر', role: 'admin', active: true, groupIds: 'all' },
        { id: techId, username: 'tech01', name: 'تکنسین', role: 'technician', active: true, groupIds: ['g1'] },
      ], async p => p),
      /برای فعال‌سازی حساب غیرفعال/,
    );

    // 6) SQL backup creates file with CHECKSUM and records unverified=false in BackupHistory
    const bak = await store.createBackup(adminId);
    assert.match(bak.fileName, /^NIPCO_Control_.*\.bak$/);
    assert.equal(bak.verified, false);
    assert.ok(fs.existsSync(path.join(tmpBackup, bak.fileName)));
    const list = await store.listBackups();
    assert.equal(list.length, 1);
    assert.equal(list[0].verified, false);
  } finally {
    fs.rmSync(tmpBackup, { recursive: true, force: true });
  }
});
