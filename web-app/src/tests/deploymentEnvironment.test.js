import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_API_BASE_URL,
  resolveApiBaseUrl,
  resolveDeploymentEnvironment,
} from '../config/runtimeEnvironment';
import { validateDeploymentEnvironment } from '../../scripts/verify-deployment-env.mjs';

const webAppRoot = process.cwd();
const repoRoot = path.resolve(webAppRoot, '..');

function hostedEnvironment(overrides = {}) {
  return {
    VERCEL: '1',
    VERCEL_ENV: 'preview',
    VITE_APP_ENV: 'preview',
    VITE_API_URL: 'https://limen-backend-staging.onrender.com/api',
    VITE_SUPABASE_URL: 'https://staging-project.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'public-anon-key',
    ...overrides,
  };
}

describe('deployment environment routing', () => {
  it('uses localhost only for an unconfigured local build', () => {
    expect(resolveApiBaseUrl({ DEV: true })).toBe(LOCAL_API_BASE_URL);
    expect(resolveDeploymentEnvironment({ DEV: true })).toBe('development');
  });

  it('uses and normalizes the environment-scoped API URL', () => {
    expect(resolveApiBaseUrl({
      VITE_APP_ENV: 'preview',
      VITE_API_URL: 'https://preview-api.example.com/api///',
    })).toBe('https://preview-api.example.com/api');
  });

  it('fails closed when a hosted runtime has no API URL', () => {
    expect(() => resolveApiBaseUrl({
      VITE_APP_ENV: 'preview',
      VITE_VERCEL_ENV: 'preview',
    })).toThrow(/VITE_API_URL is required/);
  });

  it('rejects missing, local, or production services in preview builds', () => {
    expect(() => validateDeploymentEnvironment(hostedEnvironment({
      VITE_API_URL: '',
    }))).toThrow(/VITE_API_URL is required/);

    expect(() => validateDeploymentEnvironment(hostedEnvironment({
      VITE_API_URL: 'http://localhost:3001/api',
    }))).toThrow(/HTTPS|localhost/);

    expect(() => validateDeploymentEnvironment(hostedEnvironment({
      VITE_API_URL: 'https://limen-backend.onrender.com/api',
    }))).toThrow(/must not target the production API host/);

    expect(() => validateDeploymentEnvironment(hostedEnvironment({
      VITE_SUPABASE_ANON_KEY: 'sb_secret_not-for-the-browser',
    }))).toThrow(/must never contain a Supabase secret/);
  });

  it('requires the production environment label for production deployments', () => {
    expect(() => validateDeploymentEnvironment(hostedEnvironment({
      VERCEL_ENV: 'production',
      VITE_APP_ENV: 'preview',
      VITE_API_URL: 'https://limen-backend.onrender.com/api',
    }))).toThrow(/Vercel Production/);

    expect(validateDeploymentEnvironment(hostedEnvironment({
      VERCEL_ENV: 'production',
      VITE_APP_ENV: 'production',
      VITE_API_URL: 'https://limen-backend.onrender.com/api',
    }))).toEqual({ environment: 'production', hosted: true });
  });

  it('has no Vercel rewrite that sends preview API traffic to production', () => {
    const vercelConfig = JSON.parse(
      fs.readFileSync(path.join(webAppRoot, 'vercel.json'), 'utf8'),
    );

    expect(vercelConfig.rewrites).toEqual([
      { source: '/(.*)', destination: '/index.html' },
    ]);
    expect(JSON.stringify(vercelConfig)).not.toContain('limen-backend.onrender.com');
  });

  it('keeps the production Render blueprint exact and server-secret-only', () => {
    const renderConfig = fs.readFileSync(path.join(repoRoot, 'render.yaml'), 'utf8');
    const frontendExample = fs.readFileSync(path.join(webAppRoot, '.env.example'), 'utf8');

    expect(renderConfig).toContain('value: https://limen-serve.vercel.app');
    expect(renderConfig).toContain('key: PUBLIC_RATE_LIMIT_STORE');
    expect(renderConfig).not.toContain('limen-serve*.vercel.app');
    expect(renderConfig).not.toContain('http://localhost:5173');
    expect(renderConfig).toContain('SUPABASE_SERVICE_ROLE_KEY');

    expect(frontendExample).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(frontendExample).not.toContain('VITE_USE_DIRECT_API_URL');
  });
});
