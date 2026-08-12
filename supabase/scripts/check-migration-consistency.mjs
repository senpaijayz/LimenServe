import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const supabaseDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = path.join(supabaseDirectory, 'migrations');
const testsDirectory = path.join(supabaseDirectory, 'tests');
const policyPath = path.join(supabaseDirectory, 'migration-history-policy.json');
const suitePath = path.join(supabaseDirectory, 'database-test-suite.json');

function parseArguments(argv) {
  const options = {
    githubOutput: false,
    remoteLedgerPath: '',
    requireCleanReplay: false,
    requireRemoteMatch: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === '--github-output') {
      options.githubOutput = true;
    } else if (argument === '--require-clean-replay') {
      options.requireCleanReplay = true;
    } else if (argument === '--require-remote-match') {
      options.requireRemoteMatch = true;
    } else if (argument === '--remote-ledger') {
      options.remoteLedgerPath = argv[index + 1] || '';
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseMigrationFile(fileName) {
  const match = /^(\d+)_([a-z0-9][a-z0-9_]*)\.sql$/.exec(fileName);
  return match ? { fileName, name: match[2], version: match[1] } : null;
}

function hashFrozenHistory(fileNames) {
  const hash = crypto.createHash('sha256');

  fileNames.forEach((fileName) => {
    hash.update(fileName);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(migrationsDirectory, fileName)));
    hash.update('\0');
  });

  return hash.digest('hex');
}

function normalizeLedgerEntry(entry) {
  const version = String(entry.version ?? '').trim();
  const name = String(entry.name ?? entry.migration_name ?? '').trim().replace(/\.sql$/i, '');
  return version && name ? `${version}:${name}` : '';
}

function compareRemoteLedger(remoteLedgerPath, localMigrations) {
  const payload = readJson(path.resolve(remoteLedgerPath));
  const entries = Array.isArray(payload) ? payload : payload.migrations;

  if (!Array.isArray(entries)) {
    throw new Error('Remote ledger JSON must be an array or contain a migrations array.');
  }

  const localKeys = new Set(localMigrations.map(({ name, version }) => `${version}:${name}`));
  const remoteKeys = new Set(entries.map(normalizeLedgerEntry).filter(Boolean));

  return {
    exactMatches: [...localKeys].filter((key) => remoteKeys.has(key)).length,
    onlyLocal: [...localKeys].filter((key) => !remoteKeys.has(key)).sort(),
    onlyRemote: [...remoteKeys].filter((key) => !localKeys.has(key)).sort(),
    remoteCount: remoteKeys.size,
  };
}

function writeGithubOutputs(values) {
  const outputPath = process.env.GITHUB_OUTPUT;

  if (!outputPath) {
    throw new Error('--github-output requires GITHUB_OUTPUT.');
  }

  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  fs.appendFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const policy = readJson(policyPath);
  const suite = readJson(suitePath);
  const errors = [];
  const warnings = [];
  const fileNames = fs.readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  const parsedMigrations = [];

  fileNames.forEach((fileName) => {
    const parsed = parseMigrationFile(fileName);
    const contents = fs.readFileSync(path.join(migrationsDirectory, fileName), 'utf8');

    if (!parsed) {
      errors.push(`${fileName} does not use the numeric_version_name.sql format.`);
    } else {
      parsedMigrations.push(parsed);
    }

    if (!contents.trim()) {
      errors.push(`${fileName} is empty.`);
    }

    if (/^(<{7}|={7}|>{7})/m.test(contents)) {
      errors.push(`${fileName} contains an unresolved merge marker.`);
    }
  });

  const frozenFiles = policy.frozenFiles;
  const missingFrozenFiles = frozenFiles.filter((fileName) => !fileNames.includes(fileName));
  if (missingFrozenFiles.length > 0) {
    errors.push(`Frozen migrations are missing: ${missingFrozenFiles.join(', ')}`);
  } else {
    const digest = hashFrozenHistory(frozenFiles);
    if (digest !== policy.frozenHistorySha256) {
      errors.push('A frozen migration changed. Add a new forward migration instead of editing applied history.');
    }
  }

  const frozenSet = new Set(frozenFiles);
  parsedMigrations
    .filter(({ fileName }) => !frozenSet.has(fileName))
    .forEach(({ fileName, version }) => {
      if (version.length !== 14 || version <= policy.frozenThrough) {
        errors.push(`${fileName} must use a unique 14-digit version later than ${policy.frozenThrough}.`);
      }
    });

  const versions = new Map();
  parsedMigrations.forEach(({ fileName, version }) => {
    versions.set(version, [...(versions.get(version) || []), fileName]);
  });

  const actualDuplicates = Object.fromEntries(
    [...versions.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([version, files]) => [version, files.length]),
  );

  if (JSON.stringify(actualDuplicates) !== JSON.stringify(policy.knownDuplicateVersions)) {
    errors.push('Duplicate migration versions differ from the reviewed legacy baseline.');
  }

  const duplicateFiles = new Set();
  versions.forEach((files) => {
    if (files.length > 1) {
      files.forEach((fileName) => duplicateFiles.add(fileName));
    }
  });

  if (duplicateFiles.size > 0) {
    warnings.push(
      `${Object.keys(actualDuplicates).length} legacy version groups collapse ${duplicateFiles.size} files in the Supabase CLI ledger.`,
    );
  }

  const seenTests = new Set();
  suite.tests.forEach((fileName) => {
    const testPath = path.join(testsDirectory, fileName);

    if (seenTests.has(fileName)) {
      errors.push(`Database test suite lists ${fileName} more than once.`);
    }
    seenTests.add(fileName);

    if (!fs.existsSync(testPath)) {
      errors.push(`Database test suite references missing file ${fileName}.`);
    } else {
      const contents = fs.readFileSync(testPath, 'utf8');
      if (!contents.trim()) {
        errors.push(`Database test ${fileName} is empty.`);
      }
      if (/^(<{7}|={7}|>{7})/m.test(contents)) {
        errors.push(`Database test ${fileName} contains an unresolved merge marker.`);
      }
    }
    if (fileName.includes('bootstrap')) {
      errors.push(`Database test suite must not execute bootstrap script ${fileName}.`);
    }
  });

  let remoteComparison = null;
  if (options.remoteLedgerPath) {
    remoteComparison = compareRemoteLedger(options.remoteLedgerPath, parsedMigrations);
    const mismatchCount = remoteComparison.onlyLocal.length + remoteComparison.onlyRemote.length;
    if (mismatchCount > 0) {
      const message = `Remote ledger differs: ${remoteComparison.onlyLocal.length} local-only and ${remoteComparison.onlyRemote.length} remote-only entries.`;
      if (options.requireRemoteMatch) {
        errors.push(message);
      } else {
        warnings.push(message);
      }
    }
  } else if (options.requireRemoteMatch) {
    errors.push('--require-remote-match also requires --remote-ledger <path>.');
  }

  if (!policy.cleanReplayReady || !policy.remoteLedgersReconciled) {
    warnings.push('Clean replay remains gated until production and staging ledgers are reconciled and an isolated replay passes.');
  }

  if (options.requireCleanReplay && !policy.cleanReplayReady) {
    errors.push('migration-history-policy.json does not mark clean replay as ready.');
  }

  if (options.githubOutput) {
    writeGithubOutputs({
      clean_replay_ready: Boolean(policy.cleanReplayReady && policy.remoteLedgersReconciled),
      migration_count: parsedMigrations.length,
    });
  }

  warnings.forEach((warning) => {
    const prefix = process.env.GITHUB_ACTIONS ? '::warning::' : 'WARNING: ';
    process.stderr.write(`${prefix}${warning}\n`);
  });

  if (remoteComparison) {
    process.stdout.write(`${JSON.stringify({ remoteComparison }, null, 2)}\n`);
  }

  if (errors.length > 0) {
    errors.forEach((error) => process.stderr.write(`ERROR: ${error}\n`));
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Migration consistency gate passed for ${parsedMigrations.length} files; clean replay ready: ${Boolean(policy.cleanReplayReady && policy.remoteLedgersReconciled)}.\n`,
  );
}

main();
