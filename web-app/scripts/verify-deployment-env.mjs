import process from 'node:process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_APP_ENVIRONMENTS = new Set([
  'development',
  'preview',
  'staging',
  'production',
]);

const KNOWN_PRODUCTION_API_HOSTS = new Set([
  'limen-backend.onrender.com',
]);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseHttpsUrl(value, variableName, errors) {
  const rawValue = clean(value);

  if (!rawValue) {
    errors.push(`${variableName} is required.`);
    return null;
  }

  try {
    const parsed = new URL(rawValue);

    if (parsed.protocol !== 'https:') {
      errors.push(`${variableName} must use HTTPS for a hosted deployment.`);
    }

    if (parsed.username || parsed.password) {
      errors.push(`${variableName} must not contain URL credentials.`);
    }

    if (['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)) {
      errors.push(`${variableName} must not target localhost for a hosted deployment.`);
    }

    return parsed;
  } catch {
    errors.push(`${variableName} must be an absolute URL.`);
    return null;
  }
}

function validatePublicSupabaseKey(value, errors) {
  const key = clean(value);

  if (!key) {
    errors.push('VITE_SUPABASE_ANON_KEY is required.');
    return;
  }

  if (key.startsWith('sb_secret_') || /service[_-]?role/i.test(key)) {
    errors.push('VITE_SUPABASE_ANON_KEY must never contain a Supabase secret or service-role key.');
    return;
  }

  const parts = key.split('.');
  if (parts.length !== 3) {
    return;
  }

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (payload.role === 'service_role') {
      errors.push('VITE_SUPABASE_ANON_KEY must never contain a service-role JWT.');
    }
  } catch {
    // Supabase also supports non-JWT publishable keys. Format validation belongs
    // to the provider; this guard only blocks recognizable server credentials.
  }
}

export function validateDeploymentEnvironment(env = process.env) {
  const vercelEnvironment = clean(env.VERCEL_TARGET_ENV) || clean(env.VERCEL_ENV);
  const isHostedBuild = Boolean(clean(env.VERCEL))
    || ['preview', 'production'].includes(vercelEnvironment)
    || clean(env.REQUIRE_DEPLOYMENT_ENV) === 'true';

  if (!isHostedBuild) {
    return {
      environment: clean(env.VITE_APP_ENV) || 'local-build',
      hosted: false,
    };
  }

  const errors = [];
  const appEnvironment = clean(env.VITE_APP_ENV);

  if (!ALLOWED_APP_ENVIRONMENTS.has(appEnvironment)) {
    errors.push(
      'VITE_APP_ENV must be one of development, preview, staging, or production.',
    );
  }

  if (vercelEnvironment === 'production' && appEnvironment !== 'production') {
    errors.push('Vercel Production must set VITE_APP_ENV=production.');
  }

  if (
    vercelEnvironment === 'preview'
    && !['preview', 'staging'].includes(appEnvironment)
  ) {
    errors.push('Vercel Preview must set VITE_APP_ENV=preview or staging.');
  }

  const apiUrl = parseHttpsUrl(
    env.VITE_API_URL,
    'VITE_API_URL',
    errors,
  );
  parseHttpsUrl(
    env.VITE_SUPABASE_URL,
    'VITE_SUPABASE_URL',
    errors,
  );

  if (apiUrl && apiUrl.pathname.replace(/\/+$/, '') !== '/api') {
    errors.push('VITE_API_URL must end with /api.');
  }

  validatePublicSupabaseKey(
    env.VITE_SUPABASE_ANON_KEY,
    errors,
  );

  if (
    appEnvironment !== 'production'
    && apiUrl
    && KNOWN_PRODUCTION_API_HOSTS.has(apiUrl.hostname)
  ) {
    errors.push('A preview or staging build must not target the production API host.');
  }

  if (errors.length > 0) {
    throw new Error(`Deployment environment validation failed:\n- ${errors.join('\n- ')}`);
  }

  return {
    environment: appEnvironment,
    hosted: true,
  };
}

function isMainModule() {
  return process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isMainModule()) {
  try {
    const result = validateDeploymentEnvironment();
    process.stdout.write(
      result.hosted
        ? `Validated ${result.environment} deployment environment.\n`
        : 'No hosted deployment detected; using local build defaults.\n',
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
