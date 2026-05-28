import assert from 'node:assert/strict';
import test from 'node:test';

import { selectByInChunks } from './supabaseBatchSelect.js';

function createFakeClient({ failOnCall = null } = {}) {
  const calls = [];

  return {
    calls,
    client: {
      schema(schemaName) {
        return {
          from(tableName) {
            return {
              select(selectColumns) {
                const state = {
                  schemaName,
                  tableName,
                  selectColumns,
                  filters: [],
                  inValues: [],
                };
                const query = {
                  in(column, values) {
                    state.inColumn = column;
                    state.inValues = values;
                    return query;
                  },
                  eq(column, value) {
                    state.filters.push({ column, value });
                    return query;
                  },
                  then(resolve, reject) {
                    calls.push(state);

                    if (failOnCall === calls.length) {
                      return Promise.resolve({ data: null, error: new Error('chunk failed') }).then(resolve, reject);
                    }

                    return Promise.resolve({
                      data: state.inValues.map((value) => ({ id: value, filters: state.filters })),
                      error: null,
                    }).then(resolve, reject);
                  },
                };

                return query;
              },
            };
          },
        };
      },
    },
  };
}

test('chunks unique values and preserves query modifiers', async () => {
  const fake = createFakeClient();

  const { data, error } = await selectByInChunks({
    client: fake.client,
    schema: 'catalog',
    table: 'product_images',
    select: 'product_id, image_url',
    column: 'product_id',
    values: ['a', 'b', 'c', 'b', '', null],
    chunkSize: 2,
    apply: (query) => query.eq('is_primary', true),
  });

  assert.equal(error, null);
  assert.deepEqual(fake.calls.map((call) => call.inValues), [['a', 'b'], ['c']]);
  assert.deepEqual(fake.calls.map((call) => call.filters), [
    [{ column: 'is_primary', value: true }],
    [{ column: 'is_primary', value: true }],
  ]);
  assert.deepEqual(data.map((row) => row.id), ['a', 'b', 'c']);
});

test('returns the first chunk error without issuing more requests', async () => {
  const fake = createFakeClient({ failOnCall: 2 });

  const { data, error } = await selectByInChunks({
    client: fake.client,
    schema: 'catalog',
    table: 'product_supplier_links',
    select: 'product_id, supplier_id',
    column: 'product_id',
    values: ['a', 'b', 'c', 'd', 'e'],
    chunkSize: 2,
  });

  assert.equal(fake.calls.length, 2);
  assert.deepEqual(data, [{ id: 'a', filters: [] }, { id: 'b', filters: [] }]);
  assert.equal(error.message, 'chunk failed');
});
