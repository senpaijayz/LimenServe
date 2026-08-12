import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const supabaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suite = JSON.parse(
  fs.readFileSync(path.join(supabaseDirectory, 'database-test-suite.json'), 'utf8'),
);
const databaseUrl = process.env.SUPABASE_DB_TEST_URL;

if (!databaseUrl) {
  throw new Error('SUPABASE_DB_TEST_URL is required.');
}

const parsedDatabaseUrl = new URL(databaseUrl);
const allowedHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

if (!allowedHosts.has(parsedDatabaseUrl.hostname)) {
  throw new Error('Database tests refuse non-local database hosts.');
}

for (const fileName of suite.tests) {
  const testPath = path.join(supabaseDirectory, 'tests', fileName);
  process.stdout.write(`Running ${fileName}\n`);

  const result = spawnSync(
    process.env.PSQL_BIN || 'psql',
    ['-X', '-v', 'ON_ERROR_STOP=1', '-f', testPath, databaseUrl],
    { encoding: 'utf8', stdio: 'inherit' },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    break;
  }
}
