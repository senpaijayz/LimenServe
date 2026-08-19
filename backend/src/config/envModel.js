const DEPLOYED_ENVIRONMENTS = new Set(['production', 'staging', 'preview']);
const KNOWN_ENVIRONMENTS = new Set(['development', 'test', ...DEPLOYED_ENVIRONMENTS]);
const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function requireValue(source, name) {
  const value = String(source[name] || '').trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readInteger(source, name, fallback, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  const rawValue = String(source[name] ?? '').trim();
  const value = rawValue ? Number(rawValue) : fallback;

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }

  return value;
}

function readBoolean(source, name, fallback) {
  const rawValue = String(source[name] ?? '').trim().toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (rawValue === 'true') {
    return true;
  }

  if (rawValue === 'false') {
    return false;
  }

  throw new Error(`${name} must be either true or false.`);
}

function normalizeApplicationEnvironment(source) {
  const value = String(source.APP_ENV || source.NODE_ENV || 'development').trim().toLowerCase();

  if (!KNOWN_ENVIRONMENTS.has(value)) {
    throw new Error(`APP_ENV must be one of: ${[...KNOWN_ENVIRONMENTS].join(', ')}.`);
  }

  return value;
}

function normalizeAllowedOrigin(value, applicationEnvironment) {
  const candidate = String(value || '').trim().replace(/\/$/, '');

  if (!candidate) {
    return null;
  }

  if (candidate.includes('*')) {
    throw new Error('FRONTEND_URLS must contain exact origins; wildcard origins are not allowed.');
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch (_error) {
    throw new Error(`FRONTEND_URLS contains an invalid origin: ${candidate}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username
    || parsed.password
    || parsed.pathname !== '/'
    || parsed.search
    || parsed.hash) {
    throw new Error(`FRONTEND_URLS must contain URL origins only: ${candidate}`);
  }

  if (DEPLOYED_ENVIRONMENTS.has(applicationEnvironment)
    && (parsed.protocol !== 'https:' || LOOPBACK_HOSTNAMES.has(parsed.hostname))) {
    throw new Error(`FRONTEND_URLS must contain public HTTPS origins in ${applicationEnvironment}.`);
  }

  return parsed.origin;
}

function parseFrontendUrls(source, applicationEnvironment) {
  const rawValue = String(source.FRONTEND_URLS || source.FRONTEND_URL || '').trim();

  if (!rawValue && DEPLOYED_ENVIRONMENTS.has(applicationEnvironment)) {
    throw new Error(`FRONTEND_URLS is required when APP_ENV=${applicationEnvironment}.`);
  }

  const configuredValues = rawValue
    ? rawValue.split(',')
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];

  const origins = configuredValues
    .map((value) => normalizeAllowedOrigin(value, applicationEnvironment))
    .filter(Boolean);

  if (origins.length === 0) {
    throw new Error('FRONTEND_URLS must contain at least one allowed origin.');
  }

  return [...new Set(origins)];
}

function validateServerOnlyCredentials(source, anonKey, serviceRoleKey) {
  if (anonKey === serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must not be the public Supabase key.');
  }

  const exposedVariable = Object.keys(source).find((name) => (
    /^(?:VITE_|NEXT_PUBLIC_|PUBLIC_)/i.test(name) && /SERVICE[_-]?ROLE/i.test(name)
  ));

  if (exposedVariable) {
    throw new Error(`${exposedVariable} would expose a service-role credential to client code.`);
  }
}

function parsePublicRateLimitStore(source, applicationEnvironment) {
  const configuredValue = String(source.PUBLIC_RATE_LIMIT_STORE || '').trim().toLowerCase();
  const value = configuredValue || (DEPLOYED_ENVIRONMENTS.has(applicationEnvironment) ? null : 'memory');

  if (!value) {
    throw new Error(`PUBLIC_RATE_LIMIT_STORE=supabase is required when APP_ENV=${applicationEnvironment}.`);
  }

  if (!['memory', 'supabase'].includes(value)) {
    throw new Error('PUBLIC_RATE_LIMIT_STORE must be either memory or supabase.');
  }

  if (DEPLOYED_ENVIRONMENTS.has(applicationEnvironment) && value !== 'supabase') {
    throw new Error(`PUBLIC_RATE_LIMIT_STORE must be supabase when APP_ENV=${applicationEnvironment}.`);
  }

  return value;
}

export function buildEnv(source = process.env) {
  const applicationEnvironment = normalizeApplicationEnvironment(source);
  const frontendUrls = parseFrontendUrls(source, applicationEnvironment);
  const supabaseAnonKey = requireValue(source, 'SUPABASE_ANON_KEY');
  const supabaseServiceRoleKey = requireValue(source, 'SUPABASE_SERVICE_ROLE_KEY');

  validateServerOnlyCredentials(source, supabaseAnonKey, supabaseServiceRoleKey);

  const defaultProxyHops = DEPLOYED_ENVIRONMENTS.has(applicationEnvironment) ? null : 0;
  if (defaultProxyHops === null && !String(source.TRUST_PROXY_HOPS ?? '').trim()) {
    throw new Error(`TRUST_PROXY_HOPS is required when APP_ENV=${applicationEnvironment}.`);
  }
  const proxyHops = readInteger(source, 'TRUST_PROXY_HOPS', defaultProxyHops, {
    minimum: 0,
    maximum: 10,
  });

  return Object.freeze({
    applicationEnvironment,
    isDeployed: DEPLOYED_ENVIRONMENTS.has(applicationEnvironment),
    port: readInteger(source, 'PORT', 3001, { minimum: 1, maximum: 65_535 }),
    frontendUrl: frontendUrls[0],
    frontendUrls: Object.freeze(frontendUrls),
    proxyHops,
    requestTimeoutMs: readInteger(source, 'REQUEST_TIMEOUT_MS', 25_000, {
      minimum: 1_000,
      maximum: 120_000,
    }),
    shutdownGraceMs: readInteger(source, 'SHUTDOWN_GRACE_MS', 10_000, {
      minimum: 1_000,
      maximum: 60_000,
    }),
    readinessTimeoutMs: readInteger(source, 'READINESS_TIMEOUT_MS', 2_000, {
      minimum: 250,
      maximum: 10_000,
    }),
    readinessCacheMs: readInteger(source, 'READINESS_CACHE_MS', 5_000, {
      minimum: 0,
      maximum: 60_000,
    }),
    globalRateLimitWindowMs: readInteger(source, 'GLOBAL_RATE_LIMIT_WINDOW_MS', 60_000, {
      minimum: 1_000,
      maximum: 3_600_000,
    }),
    globalRateLimitMax: readInteger(source, 'GLOBAL_RATE_LIMIT_MAX', 300, {
      minimum: 1,
      maximum: 100_000,
    }),
    globalRateLimitMaxEntries: readInteger(source, 'GLOBAL_RATE_LIMIT_MAX_ENTRIES', 10_000, {
      minimum: 100,
      maximum: 1_000_000,
    }),
    publicRateLimitStore: parsePublicRateLimitStore(source, applicationEnvironment),
    externalOcrFallbackEnabled: readBoolean(source, 'OCR_EXTERNAL_FALLBACK_ENABLED', false),
    supabaseUrl: requireValue(source, 'SUPABASE_URL'),
    supabaseAnonKey,
    supabaseServiceRoleKey,
  });
}

export const deployedEnvironments = Object.freeze([...DEPLOYED_ENVIRONMENTS]);
