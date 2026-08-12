const LOCAL_API_BASE_URL = 'http://localhost:3001/api';
const HOSTED_APP_ENVIRONMENTS = new Set(['preview', 'staging', 'production']);
const VERCEL_ENVIRONMENTS = new Set(['preview', 'production']);

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeApiBaseUrl(value) {
  return clean(value).replace(/\/+$/, '');
}

export function resolveDeploymentEnvironment(env = {}) {
  return clean(env.VITE_APP_ENV)
    || clean(env.VITE_VERCEL_TARGET_ENV)
    || clean(env.VITE_VERCEL_ENV)
    || (env.DEV ? 'development' : 'local-build');
}

export function resolveApiBaseUrl(env = {}) {
  const configuredApiUrl = normalizeApiBaseUrl(env.VITE_API_URL);

  if (configuredApiUrl) {
    return configuredApiUrl;
  }

  const deploymentEnvironment = resolveDeploymentEnvironment(env);
  const vercelEnvironment = clean(env.VITE_VERCEL_ENV);

  if (
    HOSTED_APP_ENVIRONMENTS.has(deploymentEnvironment)
    || VERCEL_ENVIRONMENTS.has(vercelEnvironment)
  ) {
    throw new Error(
      `VITE_API_URL is required for the ${deploymentEnvironment} deployment.`,
    );
  }

  return LOCAL_API_BASE_URL;
}

export { LOCAL_API_BASE_URL };
