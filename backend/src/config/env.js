import 'dotenv/config';

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

const defaultFrontendUrls = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://limen-serve.vercel.app',
  'https://limen-serve*.vercel.app',
];

function parseFrontendUrls() {
  const configuredUrls = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set([...defaultFrontendUrls, ...configuredUrls])];
}

export const env = {
  port: Number(process.env.PORT || 3001),
  frontendUrl: process.env.FRONTEND_URL || defaultFrontendUrls[0],
  frontendUrls: parseFrontendUrls(),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseAnonKey: requireEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
};
