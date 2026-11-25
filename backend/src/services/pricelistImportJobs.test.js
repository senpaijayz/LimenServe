import test from 'node:test';
import assert from 'node:assert/strict';
import { getPricelistImportJob, publishPricelistInBatches, startPricelistImportJob } from './pricelistImportJobs.js';

test('staging yields between batches and commits only after activation', async () => {
  const steps = [];
  const args = ['upload', 2026, '2026-11-26', 'Sheet1', 'retail', 'hash', null, null];
  const client = { query: async (sql, values) => {
    if (sql.startsWith('insert')) steps.push(JSON.parse(values[1]).map(({ id }) => id));
    else if (sql.includes('import_and_activate')) {
      assert.deepEqual(values, args);
      steps.push('activate');
    } else steps.push(sql);
    return { rows: [{ result: true }] };
  } };
  const items = Array.from({ length: 1001 }, (_, id) => ({ id }));
  assert.equal(await publishPricelistInBatches(client, items, args, async (ms) => steps.push(ms)), true);
  assert.deepEqual(steps.slice(3), [
    items.slice(0, 500).map(({ id }) => id), 400,
    items.slice(500, 1000).map(({ id }) => id), 400, [1000], 'activate', 'commit',
  ]);
});

test('a staging failure rolls back before activation', async () => {
  const steps = [];
  await assert.rejects(publishPricelistInBatches({ query: async (sql) => {
    steps.push(sql);
    if (sql.startsWith('insert')) throw new Error('staging failed');
  } }, [{ sku: 'TEST' }], []), /staging failed/);
  assert.equal(steps.at(-1), 'rollback');
  assert.ok(!steps.some((sql) => /import_and_activate|commit$/.test(sql)));
});

test('large import completes through one atomic direct database call', async () => {
  const previous = process.env.SUPABASE_DB_URL;
  const previousUrl = process.env.SUPABASE_URL;
  const previousCa = process.env.SUPABASE_DB_CA;
  process.env.SUPABASE_DB_URL = 'postgresql://test:secret@localhost:5432/postgres';
  process.env.SUPABASE_URL = 'https://localhost.supabase.co';
  process.env.SUPABASE_DB_CA = '-----BEGIN CERTIFICATE-----\\ntest\\n-----END CERTIFICATE-----';
  const calls = [];
  let clientOptions;
  const client = {
    connect: async () => calls.push('connect'),
    query: async (sql, values) => {
      calls.push([sql, values]);
      return { rows: [{ result: { versionId: 'published-version' } }] };
    },
    end: async () => calls.push('end'),
  };
  try {
    const job = startPricelistImportJob({
      uploadId: 'successful-upload', items: [{ sku: 'TEST' }], argumentsList: ['id'],
      makeResult: (result) => result,
      createClient: (options) => { clientOptions = options; return client; },
    });
    assert.equal(getPricelistImportJob('successful-upload').state, 'running');
    await job.done;
    assert.equal(job.state, 'completed');
    assert.equal(job.result.versionId, 'published-version');
    assert.equal(clientOptions.ssl.rejectUnauthorized, true);
    assert.match(clientOptions.ssl.ca, /BEGIN CERTIFICATE/);
    assert.equal(calls[2][0], "set local statement_timeout = '10min'");
    assert.match(calls[5][0], /import_and_activate_pricelist_upload/);
    assert.deepEqual(calls[5][1], ['id']);
    assert.equal(calls.at(-1), 'end');
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = previous;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousCa === undefined) delete process.env.SUPABASE_DB_CA;
    else process.env.SUPABASE_DB_CA = previousCa;
  }
});

test('failed import reports a safe error and allows retry', async () => {
  const previous = process.env.SUPABASE_DB_URL;
  const previousUrl = process.env.SUPABASE_URL;
  const previousCa = process.env.SUPABASE_DB_CA;
  process.env.SUPABASE_DB_URL = 'postgresql://test:secret@localhost:5432/postgres';
  process.env.SUPABASE_URL = 'https://localhost.supabase.co';
  process.env.SUPABASE_DB_CA = '-----BEGIN CERTIFICATE-----\\ntest\\n-----END CERTIFICATE-----';
  const error = Object.assign(new Error('private database detail'), { code: '57014' });
  let ended = false;
  const options = {
    uploadId: 'failed-upload', argumentsList: [], makeResult: (value) => value,
    onError: (failure) => { failure.publicMessage = 'The import timed out safely.'; },
    createClient: () => ({ connect: async () => {}, query: async () => { throw error; }, end: async () => { ended = true; } }),
  };
  try {
    const first = startPricelistImportJob(options);
    await first.done;
    assert.equal(first.state, 'failed');
    assert.equal(first.message, 'The import timed out safely.');
    assert.equal(ended, true);
    const retry = startPricelistImportJob(options);
    assert.notEqual(retry, first);
    await retry.done;
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = previous;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousCa === undefined) delete process.env.SUPABASE_DB_CA;
    else process.env.SUPABASE_DB_CA = previousCa;
  }
});
