import { describe, expect, it } from 'vitest';
import {
  normalizeMechanicSaveResult,
  removeMechanicRow,
  upsertMechanicRow,
} from '../modules/users/utils/mechanicVisibilityModel';

describe('mechanic visibility model', () => {
  it('builds a saved mechanic row from the API response and submitted form', () => {
    expect(normalizeMechanicSaveResult(
      { mechanicId: 'mechanic-1', mechanic: { full_name: 'Jay Tech' } },
      { specialization: 'Mitsubishi', contact_number: '0917 123 4567', shift_type: 'morning' },
    )).toMatchObject({
      id: 'mechanic-1',
      full_name: 'Jay Tech',
      specialization: 'Mitsubishi',
      contact_number: '0917 123 4567',
      shift_type: 'morning',
      is_public: true,
    });
  });

  it('upserts and removes mechanics without waiting for a full reload', () => {
    const rows = [
      { id: 'b', full_name: 'Beta' },
      { id: 'a', full_name: 'Alpha' },
    ];

    expect(upsertMechanicRow(rows, { id: 'b', full_name: 'Bravo' })).toEqual([
      { id: 'a', full_name: 'Alpha' },
      { id: 'b', full_name: 'Bravo' },
    ]);

    expect(removeMechanicRow(rows, 'a')).toEqual([
      { id: 'b', full_name: 'Beta' },
    ]);
  });
});
