import pg from 'pg';

const { Client } = pg;
const jobs = new Map();
const MAX_JOB_AGE_MS = 30 * 60 * 1000;

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

export function getPricelistImportJob(uploadId) {
  const job = jobs.get(uploadId);
  if (job && job.state !== 'running' && Date.now() - job.finishedAt > MAX_JOB_AGE_MS) {
    jobs.delete(uploadId);
    return null;
  }
  return job || null;
}

export function startPricelistImportJob({ uploadId, argumentsList, makeResult, onPublished, onError, createClient = (options) => new Client(options) }) {
  const existing = getPricelistImportJob(uploadId);
  if (existing?.state === 'running') return existing;
  if ([...jobs.entries()].some(([otherId, job]) => otherId !== uploadId && job.state === 'running')) {
    const error = new Error('Another pricelist update is processing. Wait for it to finish before starting a new one.');
    error.statusCode = 409;
    throw error;
  }
  const connectionString = databaseConnection();
  const job = { state: 'running', startedAt: Date.now() };
  jobs.set(uploadId, job);

  job.done = (async () => {
    let client;
    try {
      client = createClient({ connectionString, ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 15_000, application_name: 'limen-pricelist-import' });
      await client.connect();
      // This is one database statement and remains atomic. It is deliberately
      // outside the short-lived browser and Supabase REST request time limits.
      await client.query("set statement_timeout = '10min'");
      const response = await client.query(
        'select public.import_and_activate_pricelist_upload($1,$2::jsonb,$3,$4,$5,$6,$7,$8,$9) as result',
        argumentsList,
      );
      job.result = makeResult(response.rows[0]?.result);
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
    }
  })();

  return job;
}
