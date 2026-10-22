import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

export function getRecoveryOrigin() {
  return String(env.recoveryLinkOrigin || env.frontendUrl).replace(/\/$/, '');
}

export function createRecoveryUrl(path, token) {
  const url = new URL(path, `${getRecoveryOrigin()}/`);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

export function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

export async function sendSecurityEmail({ to, subject, text, html }) {
  if (!env.recoveryEmailConfigured) return false;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.recoveryEmailFrom,
        to: [to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    return response.ok;
  } catch {
    // Do not include addresses, tokens, or provider response bodies in logs.
    return false;
  }
}

export function createEphemeralAuthClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
