import test from 'node:test';
import assert from 'node:assert/strict';
import { getPricelistImportJob, startPricelistImportJob } from './pricelistImportJobs.js';

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
      uploadId: 'successful-upload', argumentsList: ['id', '[]'],
      makeResult: (result) => result,
      createClient: (options) => { clientOptions = options; return client; },
    });
    assert.equal(getPricelistImportJob('successful-upload').state, 'running');
    await job.done;
    assert.equal(job.state, 'completed');
    assert.equal(job.result.versionId, 'published-version');
    assert.equal(clientOptions.ssl.rejectUnauthorized, true);
    assert.match(clientOptions.ssl.ca, /BEGIN CERTIFICATE/);
    assert.equal(calls[1][0], "set statement_timeout = '10min'");
    assert.match(calls[2][0], /import_and_activate_pricelist_upload/);
    assert.deepEqual(calls[2][1], ['id', '[]']);
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
    assert.notEqual(startPricelistImportJob(options), first);
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_DB_URL;
    else process.env.SUPABASE_DB_URL = previous;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousCa === undefined) delete process.env.SUPABASE_DB_CA;
    else process.env.SUPABASE_DB_CA = previousCa;
  }
});
