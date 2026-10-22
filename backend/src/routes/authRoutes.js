import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { Router } from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin, supabaseAuth } from '../config/supabase.js';
import { clearAuthUserCache, requireAuth } from '../middleware/auth.js';

const router = Router();
const RECOVERY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RECOVERY_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;
const DUMMY_ADMIN_EMAIL = 'admin@limen.com';
const GENERIC_RECOVERY_RESPONSE = 'If a recovery method is available for this account, password reset instructions will be sent.';

class AuthRouteError extends Error {
  constructor(statusCode, message, retryAfterSeconds = null) {
    super(message);
    this.statusCode = statusCode;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function hashRateLimitIdentity(value) {
  return createHmac('sha256', env.supabaseServiceRoleKey)
    .update(String(value || 'unknown'))
    .digest('hex');
}

async function consumeSharedRateLimit(scope, identity, windowSeconds, limit) {
  const { data, error } = await supabaseAdmin.rpc('consume_public_rate_limit', {
    p_scope: scope,
    p_key_hash: hashRateLimitIdentity(identity),
    p_window_seconds: windowSeconds,
    p_limit: limit,
  });

  if (error) {
    throw new AuthRouteError(503, 'Account security is temporarily unavailable. Please try again shortly.');
  }

  const decision = firstRow(data);
  if (!decision?.allowed) {
    const retryAfter = Math.max(1, Number(decision?.reset_seconds) || 60);
    throw new AuthRouteError(429, 'Too many attempts. Please wait a little and try again.', retryAfter);
  }
}

function setNoStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

function getRecoveryOrigin() {
  return String(env.recoveryLinkOrigin || env.frontendUrl).replace(/\/$/, '');
}

function createRecoveryUrl(path, token) {
  const url = new URL(path, `${getRecoveryOrigin()}/`);
  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

async function sendSecurityEmail({ to, subject, text, html }) {
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

function createEphemeralAuthClient() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function isEligibleActiveAccount(account) {
  const bannedUntil = Date.parse(account?.banned_until || '');
  const isBanned = Number.isFinite(bannedUntil) && bannedUntil > Date.now();
  return Boolean(
    account
    && ['admin', 'cashier', 'stock_clerk'].includes(account.auth_role)
    && account.auth_role === account.profile_role
    && account.account_status === 'active'
    && !isBanned,
  );
}

function validateStrongPassword(password) {
  return typeof password === 'string'
    && password.length >= 12
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

function sendRouteError(res, error, fallbackMessage) {
  const statusCode = Number(error?.statusCode);
  if (statusCode === 429 && error?.retryAfterSeconds) {
    res.setHeader('Retry-After', String(error.retryAfterSeconds));
  }

  setNoStore(res);
  res.status(Number.isInteger(statusCode) ? statusCode : 503).json({
    error: Number.isInteger(statusCode) ? error.message : fallbackMessage,
  });
}

async function lookupAccount(email) {
  const { data, error } = await supabaseAdmin.rpc('lookup_limen_account_for_recovery', {
    p_email: email,
  });
  if (error) throw error;
  return firstRow(data);
}

async function getSecurityStatus(accountId) {
  const { data, error } = await supabaseAdmin.rpc('get_limen_account_security', {
    p_account_id: accountId,
  });
  if (error) throw error;
  return firstRow(data);
}

router.get('/me', requireAuth, async (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      fullName: req.user.fullName,
      role: req.user.role,
    },
  });
});

router.get('/security', requireAuth, async (req, res) => {
  setNoStore(res);
  try {
    const security = await getSecurityStatus(req.user.id);
    if (!security || security.profile_role !== req.user.role) {
      res.status(403).json({ error: 'Your account security details could not be confirmed.' });
      return;
    }

    res.json({
      security: {
        loginEmail: security.login_email,
        role: security.profile_role,
        protectedAdmin: Boolean(security.is_protected_admin),
        recoveryEmail: security.verified_email,
        recoveryVerifiedAt: security.verified_at,
        pendingRecoveryEmail: security.pending_email,
        pendingExpiresAt: security.pending_expires_at,
        recoveryEmailDeliveryReady: env.recoveryEmailConfigured,
      },
    });
  } catch {
    res.status(503).json({ error: 'Account security is temporarily unavailable. Please try again shortly.' });
  }
});

router.post('/recovery/request', async (req, res) => {
  setNoStore(res);
  const email = normalizeEmail(req.body?.email);
  if (!RECOVERY_EMAIL_PATTERN.test(email) || email.length > 254) {
    res.status(400).json({ error: 'Enter the email address you use to sign in.' });
    return;
  }

  try {
    await consumeSharedRateLimit('auth.recovery.request.ip', req.ip, 3600, 10);
    await consumeSharedRateLimit('auth.recovery.request.email', email, 3600, 4);

    const account = await lookupAccount(email);
    if (isEligibleActiveAccount(account)) {
      if (account.recovery_email && account.recovery_verified_at && env.recoveryEmailConfigured) {
        const token = randomBytes(32).toString('hex');
        const { error: tokenError } = await supabaseAdmin.rpc('create_limen_password_recovery_token', {
          p_account_id: account.account_id,
          p_token_digest: hashToken(token),
        });

        if (!tokenError) {
          const url = createRecoveryUrl('/reset-password', token);
          const text = `A password reset was requested for your LimenServe account. Use this secure link within 15 minutes:\n\n${url}\n\nIf you did not request this change, you can ignore this email.`;
          const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Reset your LimenServe password</h2><p>Use the secure button below within 15 minutes to choose a new password.</p><p><a href="${escapeHtml(url)}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a></p><p>If you did not request this change, you can ignore this email.</p></div>`;
          await sendSecurityEmail({
            to: account.recovery_email,
            subject: 'Reset your LimenServe password',
            text,
            html,
          });
        }
      } else if (email !== DUMMY_ADMIN_EMAIL) {
        const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
          redirectTo: `${getRecoveryOrigin()}/reset-password`,
        });
        // Supabase owns the delivery and enumeration-safe response for this flow.
        if (error) req.log?.warn?.('auth.recovery.supabase_delivery_unavailable', { requestId: req.requestId });
      }
    }

    res.status(202).json({ message: GENERIC_RECOVERY_RESPONSE });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      sendRouteError(res, error, GENERIC_RECOVERY_RESPONSE);
      return;
    }

    req.log?.warn?.('auth.recovery.request_unavailable', { requestId: req.requestId });
    res.status(202).json({ message: GENERIC_RECOVERY_RESPONSE });
  }
});

router.post('/recovery-email/challenge', requireAuth, async (req, res) => {
  setNoStore(res);
  const email = normalizeEmail(req.body?.email);
  const currentPassword = String(req.body?.currentPassword || '');

  if (!RECOVERY_EMAIL_PATTERN.test(email) || email.length > 254 || !currentPassword) {
    res.status(400).json({ error: 'Enter a valid recovery email and confirm your current password.' });
    return;
  }

  if (!env.recoveryEmailConfigured) {
    res.status(503).json({ error: 'Recovery email delivery is not configured yet. Ask your system administrator to set it up first.' });
    return;
  }

  try {
    await consumeSharedRateLimit('auth.recovery.enroll.ip', req.ip, 3600, 10);
    await consumeSharedRateLimit('auth.recovery.enroll.account', req.user.id, 3600, 5);

    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
    if (authUserError || !authUser?.user || normalizeEmail(authUser.user.email) !== normalizeEmail(req.user.email)) {
      res.status(401).json({ error: 'Please sign in again before changing account security settings.' });
      return;
    }

    const ephemeralClient = createEphemeralAuthClient();
    const { data: verified, error: passwordError } = await ephemeralClient.auth.signInWithPassword({
      email: authUser.user.email,
      password: currentPassword,
    });
    if (passwordError || verified?.user?.id !== req.user.id) {
      res.status(401).json({ error: 'Your current password could not be confirmed. Check it and try again.' });
      return;
    }

    const token = randomBytes(32).toString('hex');
    const { error: beginError } = await supabaseAdmin.rpc('begin_limen_recovery_email_verification', {
      p_account_id: req.user.id,
      p_email: email,
      p_token_digest: hashToken(token),
    });
    if (beginError) {
      if (beginError.code === '23505' || String(beginError.message).includes('RECOVERY_EMAIL_IN_USE')) {
        res.status(409).json({ error: 'That email is already being used as a login or recovery address.' });
        return;
      }
      if (String(beginError.message).includes('already verified')) {
        res.status(409).json({ error: 'That recovery email is already verified for your account.' });
        return;
      }
      res.status(403).json({ error: 'This account cannot change its recovery email right now.' });
      return;
    }

    const verificationUrl = createRecoveryUrl('/verify-recovery-email', token);
    const text = `Confirm this email as your LimenServe account recovery address. This link expires in 15 minutes:\n\n${verificationUrl}\n\nIf you did not request this, ignore this message. Your current recovery address stays active until the new address is verified.`;
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Confirm your recovery email</h2><p>Confirm that you own this email address. The link expires in 15 minutes.</p><p><a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p><p>Your current recovery address stays active until the new one is verified. If you did not request this, ignore this message.</p></div>`;
    const sent = await sendSecurityEmail({
      to: email,
      subject: 'Verify your LimenServe recovery email',
      text,
      html,
    });
    if (!sent) {
      res.status(503).json({ error: 'We could not send the verification email. Your current recovery email, if any, is unchanged. Please try again later.' });
      return;
    }

    res.status(202).json({ message: 'Check your new email address for a verification link. Your current recovery method remains active until you confirm it.' });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      sendRouteError(res, error, 'Recovery email verification could not be started.');
      return;
    }
    req.log?.warn?.('auth.recovery.email_challenge_unavailable', { requestId: req.requestId });
    res.status(503).json({ error: 'Recovery email verification could not be started. Please try again shortly.' });
  }
});

router.post('/recovery-email/verify', async (req, res) => {
  setNoStore(res);
  const token = String(req.body?.token || '');
  if (!RECOVERY_TOKEN_PATTERN.test(token)) {
    res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one from Account Security.' });
    return;
  }

  try {
    await consumeSharedRateLimit('auth.recovery.verify.ip', req.ip, 3600, 20);
    await consumeSharedRateLimit('auth.recovery.verify.token', token, 3600, 5);

    const { data, error } = await supabaseAdmin.rpc('complete_limen_recovery_email_verification', {
      p_token_digest: hashToken(token),
    });
    if (error) {
      if (error.code === '23505' || String(error.message).includes('RECOVERY_EMAIL_IN_USE')) {
        res.status(409).json({ error: 'This email is already in use. Ask an administrator for help.' });
        return;
      }
      res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one from Account Security.' });
      return;
    }

    const verified = firstRow(data);
    if (!verified?.account_id || !verified?.verified_email) {
      res.status(400).json({ error: 'This verification link is invalid or has expired. Request a new one from Account Security.' });
      return;
    }

    if (verified.previous_email && env.recoveryEmailConfigured) {
      const text = 'The recovery email for your LimenServe account was changed. If you did not make this change, contact your LimenServe system administrator immediately.';
      const html = '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Recovery email changed</h2><p>The recovery email for your LimenServe account was changed.</p><p>If you did not make this change, contact your LimenServe system administrator immediately.</p></div>';
      await sendSecurityEmail({
        to: verified.previous_email,
        subject: 'Your LimenServe recovery email changed',
        text,
        html,
      });
    }

    res.json({ verified: true, message: 'Your recovery email is verified and ready to use.' });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      sendRouteError(res, error, 'This verification link is invalid or has expired.');
      return;
    }
    req.log?.warn?.('auth.recovery.email_verification_unavailable', { requestId: req.requestId });
    res.status(503).json({ error: 'Email verification is temporarily unavailable. Please try again shortly.' });
  }
});

router.post('/recovery/reset', async (req, res) => {
  setNoStore(res);
  const token = String(req.body?.token || '');
  const password = req.body?.password;
  if (!RECOVERY_TOKEN_PATTERN.test(token)) {
    res.status(400).json({ error: 'This reset link is invalid or has expired. Request a new one and try again.' });
    return;
  }
  if (!validateStrongPassword(password)) {
    res.status(400).json({ error: 'Choose a password with at least 12 characters, including uppercase and lowercase letters, a number, and a symbol.' });
    return;
  }

  try {
    await consumeSharedRateLimit('auth.recovery.reset.ip', req.ip, 3600, 12);
    await consumeSharedRateLimit('auth.recovery.reset.token', token, 3600, 5);

    const { data: accountId, error: consumeError } = await supabaseAdmin.rpc('consume_limen_password_recovery_token', {
      p_token_digest: hashToken(token),
    });
    if (consumeError || !accountId) {
      res.status(400).json({ error: 'This reset link has already been used or has expired. Request a new one and try again.' });
      return;
    }

    const { data: target, error: targetError } = await supabaseAdmin.auth.admin.getUserById(accountId);
    if (targetError || !target?.user) {
      res.status(400).json({ error: 'This reset link is no longer valid. Request a new one and try again.' });
      return;
    }

    // Change the password only. The immutable ID, login email, roles, and all
    // existing Auth metadata remain untouched.
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(accountId, { password });
    if (updateError) {
      req.log?.warn?.('auth.recovery.password_update_rejected', { requestId: req.requestId, code: updateError.code || 'unknown' });
      res.status(400).json({ error: 'The password could not be updated. Request a new reset link and try again.' });
      return;
    }

    let refreshSessionsRevoked = false;
    const ephemeralClient = createEphemeralAuthClient();
    const { data: signIn, error: signInError } = await ephemeralClient.auth.signInWithPassword({
      email: target.user.email,
      password,
    });
    if (!signInError && signIn?.session) {
      const { error: signOutError } = await ephemeralClient.auth.signOut({ scope: 'global' });
      refreshSessionsRevoked = !signOutError;
    }

    clearAuthUserCache();
    res.json({
      passwordUpdated: true,
      refreshSessionsRevoked,
      message: 'Your password has been changed. Sign in with your existing login email and new password.',
    });
  } catch (error) {
    if (Number.isInteger(error?.statusCode)) {
      sendRouteError(res, error, 'The reset request could not be completed. Request a fresh link and try again.');
      return;
    }
    req.log?.warn?.('auth.recovery.password_reset_unavailable', { requestId: req.requestId });
    res.status(503).json({ error: 'The reset request could not be completed. Request a fresh link and try again.' });
  }
});

export default router;
