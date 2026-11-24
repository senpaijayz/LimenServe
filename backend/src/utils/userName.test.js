import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserNameFields, splitUserName } from './userName.js';

test('legacy four-part names preserve two-word given and family names', () => {
  assert.deepEqual(splitUserName('Jay Iverson Dela Cruz'), {
    firstName: 'Jay Iverson',
    lastName: 'Dela Cruz',
  });
});

test('saved first and last name metadata takes precedence over legacy parsing', () => {
  assert.deepEqual(getUserNameFields({
    user_metadata: {
      full_name: 'Jay Iverson Dela Cruz',
      first_name: 'Jay Iverson',
      last_name: 'Dela Cruz',
    },
  }), {
    firstName: 'Jay Iverson',
    lastName: 'Dela Cruz',
    fullName: 'Jay Iverson Dela Cruz',
  });
});

test('legacy names without saved fields use the compatibility split', () => {
  assert.deepEqual(getUserNameFields({ user_metadata: { full_name: 'Jay Iverson Dela Cruz' } }), {
    firstName: 'Jay Iverson',
    lastName: 'Dela Cruz',
    fullName: 'Jay Iverson Dela Cruz',
  });
});
