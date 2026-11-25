import pg from 'pg';
import { setTimeout as pause } from 'node:timers/promises';

const { Client } = pg;
const jobs = new Map();
const MAX_JOB_AGE_MS = 30 * 60 * 1000;
const BATCH_SIZE = 500;
const BATCH_PAUSE_MS = 400;

export async function publishPricelistInBatches(client, items, args, wait = pause) {
  await client.query('begin');
  try {
    await client.query("set local statement_timeout = '10min'");
    await client.query('create temporary table limen_pricelist_batches (batch_number integer primary key, items jsonb not null) on commit drop');
    for (let offset = 0; offset < items.length; offset += BATCH_SIZE) {
      if (offset > 0) await wait(BATCH_PAUSE_MS);
      await client.query('insert into pg_temp.limen_pricelist_batches values ($1, $2::jsonb)',
        [offset / BATCH_SIZE, JSON.stringify(items.slice(offset, offset + BATCH_SIZE))]);
    }
    // Activate only after staging is complete. The existing function still
    // checks the reviewed revision and takes its publication lock atomically.
    const { rows } = await client.query(`
      select public.import_and_activate_pricelist_upload($1, (
        select jsonb_agg(item.value order by batch.batch_number, item.ordinality)
        from pg_temp.limen_pricelist_batches batch
        cross join lateral jsonb_array_elements(batch.items) with ordinality item
      ), $2,$3,$4,$5,$6,$7,$8) as result`, args);
    await client.query('commit');
    return rows[0]?.result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

function databaseConnection() {
  const connectionString = String(process.env.SUPABASE_DB_URL || '').trim();
  if (!connectionString) {
    const error = new Error('The secure database connection for large pricelist imports is not configured. The current pricelist was not changed.');
    error.statusCode = 503;
    throw error;
  }
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('SUPABASE_DB_URL must be a PostgreSQL connection URL.');
  }
  const projectRef = new URL(process.env.SUPABASE_URL || 'https://invalid.example').hostname.split('.')[0];
  if (!projectRef || (!url.hostname.includes(projectRef) && !url.username.includes(projectRef))) {
    const error = new Error('The database connection does not match the configured Supabase project. The current pricelist was not changed.');
    error.statusCode = 503;
    throw error;
  }
  if (!url.password || /YOUR.PASSWORD/i.test(url.password)) {
    const error = new Error('The secure database connection is missing its password. The current pricelist was not changed.');
    error.statusCode = 503;
    throw error;
  }
  return connectionString;
}

function databaseCertificate() {
  const ca = String(process.env.SUPABASE_DB_CA || '').replace(/\\n/g, '\n').trim();
  if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    const error = new Error('The Supabase database certificate is not configured. Add SUPABASE_DB_CA in Render before updating the pricelist. The current prices were not changed.');
    error.statusCode = 503;
    throw error;
  }
  return ca;
}

export function getPricelistImportJob(uploadId) {
  const job = jobs.get(uploadId);
  if (job && job.state !== 'running' && Date.now() - job.finishedAt > MAX_JOB_AGE_MS) {
    jobs.delete(uploadId);
    return null;
  }
  return job || null;
}

export function startPricelistImportJob({ uploadId, items, argumentsList, makeResult, onPublished, onError, createClient = (options) => new Client(options) }) {
  const existing = getPricelistImportJob(uploadId);
  if (existing?.state === 'running') return existing;
  if ([...jobs.entries()].some(([otherId, job]) => otherId !== uploadId && job.state === 'running')) {
    const error = new Error('Another pricelist update is processing. Wait for it to finish before starting a new one.');
    error.statusCode = 409;
    throw error;
  }
  const connectionString = databaseConnection();
  const ca = databaseCertificate();
  const job = { state: 'running', startedAt: Date.now() };
  jobs.set(uploadId, job);

  job.done = (async () => {
    let client;
    try {
      client = createClient({ connectionString, ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15_000, application_name: 'limen-pricelist-import' });
      await client.connect();
      job.result = makeResult(await publishPricelistInBatches(client, items, argumentsList));
      onPublished?.();
      job.state = 'completed';
    } catch (error) {
      onError?.(error);
      console.error('pricelist.import.failed', { code: error.code || 'UNKNOWN', message: error.message });
      job.state = 'failed';
      job.message = error.code === '40001'
        ? 'The active pricelist changed during this update. Refresh the comparison before retrying; your current prices were not changed.'
        : ['28P01', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code)
          ? 'The secure database connection failed. Check SUPABASE_DB_URL in Render; the current pricelist was not changed.'
        : error.publicMessage || 'The pricelist could not be updated. The active prices were not changed. Review the saved lists before retrying.';
    } finally {
      job.finishedAt = Date.now();
      await client?.end().catch(() => {});
      setTimeout(() => {
        if (jobs.get(uploadId) === job) jobs.delete(uploadId);
      }, MAX_JOB_AGE_MS).unref();
    }
  })();

  return job;
}
