import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripUsersFromState } from '../src/state-security.js';

test('credentials and user collection are excluded from persisted and projected state', () => {
  const original = { v: 8, groups: [], users: [{ username: 'operator', pass: 'Temporary-Password-9274' }] };
  const safe = stripUsersFromState(original);
  assert.equal(Object.hasOwn(safe, 'users'), false);
  assert.equal(JSON.stringify(safe).includes('Temporary-Password-9274'), false);
  assert.equal(original.users[0].pass, 'Temporary-Password-9274');
  assert.notEqual(safe, original);
});

test('state sanitizer preserves null and non-object inputs without throwing', () => {
  assert.equal(stripUsersFromState(null), null);
  assert.equal(stripUsersFromState(undefined), undefined);
  assert.equal(stripUsersFromState('invalid'), 'invalid');
});
