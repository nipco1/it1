import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareLegacyImport } from '../src/legacy-import.js';

const admin = {
  id: 'd0f8825b-77a5-4c84-9a0a-e2da82b2bb0b', username: 'admin', name: 'مدیر فعلی',
  role: 'admin', active: true, groupIds: 'all',
};
function legacyFixture() {
  return {
    v: 8,
    groups: [{ id: 'g-1', code: 'G1', name: 'گروه یک' }],
    equipments: [{ id: 'eq-1', groupId: 'g-1', code: 'E1', name: 'پرس' }],
    checklists: [{ id: 'cl-1', groupId: 'g-1', name: 'روزانه' }],
    sections: [{ id: 'sec-1', checklistId: 'cl-1', title: 'مکانیک', order: 1 }],
    items: [{ id: 'it-1', sectionId: 'sec-1', title: 'روغن', type: 'oknok' }],
    controls: [{ id: 'c-1', equipmentId: 'eq-1', dateKey: '1405/08/01', techId: 'old-tech', status: 'completed', items: {}, opSource: 'AUTO', opHours: 123 }],
    drafts: [{ id: 'd-1', equipmentId: 'eq-1', dateKey: '1405/08/02', shiftId: 'sh-1', techId: 'old-tech', items: {}, updatedAt: 'x', startedAt: 'x' }],
    opHours: [{ id: 'h-1', equipmentId: 'eq-1', hours: 123, diff: 4, source: 'MANUAL', techId: 'old-tech', dateKey: '1405/08/01', time: '09:00' }, { id: 'h-auto', equipmentId: 'eq-1', hours: 125, diff: 2, source: 'AUTO', techId: 'old-tech', dateKey: '1405/08/02', time: '09:00' }],
    failLocs: [{ id: 'fl-1', name: 'مکانیکی' }], shifts: [{ id: 'sh-1', name: 'صبح', from: '06:00', to: '14:00' }],
    users: [
      { id: 'old-admin', username: 'admin', name: 'مدیر قبلی', pass: 'legacy-cleartext', role: 'admin', active: true, groupIds: 'all' },
      { id: 'old-tech', username: 'tech1', name: 'تکنسین قدیمی', pass: 'weak', role: 'technician', active: true, groupIds: ['g-1'] },
    ],
    logs: [{ id: 'log-1', userId: 'old-tech', userName: 'تکنسین قدیمی', action: 'INSERT', entity: 'Controls', detail: 'ثبت قدیمی', dateKey: '1405/08/01', time: '09:00', ip: 'old' }],
    sync: [{ id: 'sync-1', status: 'pending' }],
    branding: { logoText: 'NIPCO', title: 'سامانه', subtitle: 'system', welcome: 'ورود', footer: 'footer', version: '1', primary: '#f5a623', radius: 10 },
    layouts: { 'old-tech': [{ key: 'kpi', span: 1 }] }, savedFilters: [{ id: 'f-1', userId: 'old-tech', tab: 'reports', name: 'فیلتر', filters: {} }],
    perms: { admin: { '*': true }, supervisor: {}, engineer: {}, technician: {}, viewer: {} },
    yearAccess: { '1405': 'full', 'old-tech': 'readonly' }, archivedYears: [], theme: 'industrial',
  };
}

test('legacy migration removes plain-text credentials and maps historic user references to disabled identities', () => {
  const prepared = prepareLegacyImport(legacyFixture(), [admin], { dateKey: '1405/08/02', time: '11:30' });
  assert.equal(prepared.state.controls[0].techId, prepared.users[1].id);
  assert.equal(prepared.state.drafts[0].techId, prepared.users[1].id);
  assert.equal(prepared.state.opHours.length, 1);
  assert.equal(prepared.state.controls[0].opHours, undefined);
  assert.deepEqual(prepared.state.sync, []);
  assert.equal(prepared.state.users, undefined);
  assert.equal(prepared.users.length, 2);
  assert.equal(prepared.users[1].active, false);
  assert.equal(prepared.users[1].role, 'viewer');
  assert.notEqual(prepared.users[1].pass, 'weak');
  assert.ok(prepared.users[1].pass.length >= 14);
  assert.equal(prepared.state.logs.at(-1).userId, admin.id);
  assert.equal(prepared.state.logs.at(-1).dateKey, '1405/08/02');
  assert.equal(prepared.state.savedFilters[0].userId, prepared.users[1].id);
  assert.equal(prepared.state.yearAccess[prepared.users[1].id], 'readonly');
});

test('legacy migration refuses malformed source data and requires an active administrator', () => {
  assert.throws(() => prepareLegacyImport({ equipments: [] }, [admin]), /groups/);
  assert.throws(() => prepareLegacyImport(legacyFixture(), []), /مدیر فعال/);
});
