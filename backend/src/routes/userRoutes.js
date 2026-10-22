import { createHash, createHmac, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../config/supabase.js';
import { clearAuthUserCache, requireRole } from '../middleware/auth.js';
import {
  createEphemeralAuthClient,
  createRecoveryUrl,
  escapeHtml,
  sendSecurityEmail,
} from '../services/recoveryDelivery.js';

const router = Router();
const ALLOWED_ROLES = new Set(['admin', 'cashier', 'stock_clerk']);
const PERSISTED_ROLES = new Set([...ALLOWED_ROLES, 'customer']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECOVERY_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null;
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
}

async function limitRecoverySetup(scope, identity, limit) {
  const keyHash = createHmac('sha256', env.supabaseServiceRoleKey)
    .update(String(identity || 'unknown'))
    .digest('hex');
  const { data, error } = await supabaseAdmin.rpc('consume_public_rate_limit', {
    p_scope: scope,
    p_key_hash: keyHash,
    p_window_seconds: 3600,
    p_limit: limit,
  });
  if (error) throw new Error('Account security is temporarily unavailable.');
  const decision = firstRow(data);
  return {
    allowed: Boolean(decision?.allowed),
    retryAfter: Math.max(1, Number(decision?.reset_seconds) || 60),
  };
}

function splitName(fullName = '') {
  const [firstName = '', ...lastNameParts] = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: lastNameParts.join(' '),
  };
}

function normalizeRole(role) {
  if (role === 'staff' || role === 'viewer') {
    return 'stock_clerk';
  }

  return PERSISTED_ROLES.has(role) ? role : 'stock_clerk';
}

function normalizeStaffRole(role) {
  const normalized = normalizeRole(role);
  return ALLOWED_ROLES.has(normalized) ? normalized : null;
}

function mapUser(authUser, profile = null) {
  const fullName = authUser?.user_metadata?.full_name || profile?.full_name || '';
  const name = splitName(fullName);
  const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
  const isBanned = Boolean(bannedUntil && bannedUntil.getTime() > Date.now());
  const isDeactivated = authUser?.app_metadata?.account_status === 'deactivated';
  const role = isDeactivated
    ? authUser?.app_metadata?.former_staff_role || profile?.role
    : authUser?.app_metadata?.role === 'admin' || profile?.role === 'admin'
      ? 'admin'
      : profile?.role || authUser?.app_metadata?.role;

  return {
    id: authUser.id,
    userId: authUser.id,
    firstName: name.firstName,
    lastName: name.lastName,
    fullName,
    email: authUser.email || profile?.email || '',
    role: normalizeRole(role),
    status: isBanned || isDeactivated ? 'inactive' : 'active',
    accountStatus: isDeactivated ? 'deactivated' : isBanned ? 'inactive' : 'active',
    lastLogin: authUser.last_sign_in_at || null,
    createdAt: authUser.created_at || profile?.created_at || null,
    updatedAt: authUser.updated_at || profile?.updated_at || null,
  };
}

function getTrustedStaffRole(authUser, profile) {
  const appRole = normalizeStaffRole(authUser?.app_metadata?.role);
  const profileRole = normalizeStaffRole(profile?.role);
  return {
    appRole,
    profileRole,
    matches: Boolean(appRole && profileRole && appRole === profileRole),
  };
}

function isCurrentlyBanned(authUser) {
  const bannedUntil = Date.parse(authUser?.banned_until || '');
  return Number.isFinite(bannedUntil) && bannedUntil > Date.now();
}

async function assertAdministrator(req, res) {
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(req.user.id);
  if (error || !data?.user) {
    res.status(403).json({ error: 'Your session is no longer authorized to perform this action.' });
    return null;
  }

  const profile = await fetchProfileByUserId(req.user.id).catch(() => null);
  const authUser = data.user;
  if (
    req.user.role !== 'admin'
    || profile?.role !== 'admin'
    || authUser.app_metadata?.role !== 'admin'
    || authUser.app_metadata?.account_status === 'deactivated'
    || isCurrentlyBanned(authUser)
  ) {
    res.status(403).json({ error: 'Your session is no longer authorized to perform this action.' });
    return null;
  }

  return authUser;
}

async function countOtherActiveAdministrators(excludedUserId) {
  let page = 1;
  let count = 0;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;

    const users = data?.users ?? [];
    const profiles = await Promise.all(users.map((user) => fetchProfileByUserId(user.id)));

    users.forEach((user, index) => {
      if (user.id === excludedUserId || user.app_metadata?.account_status === 'deactivated' || isCurrentlyBanned(user)) {
        return;
      }

      const profileRole = profiles[index]?.role;
      if (user.app_metadata?.role === 'admin' || profileRole === 'admin') {
        count += 1;
      }
    });

    if (users.length < 100) break;
    page += 1;
  }

  return count;
}

function isMissingProfileSyncRpc(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST202'
    || message.includes('admin_upsert_user_profile')
    || message.includes('Could not find the function');
}

function isAmbiguousProfileSyncRpc(error) {
  const message = String(error?.message || '');
  return error?.code === '42702'
    || (message.includes('user_id') && message.includes('ambiguous'));
}

function normalizeUserSaveError(error) {
  const message = String(error?.message || '');
  if (message.includes('LAST_ACTIVE_ADMIN_PROTECTED')) {
    error.statusCode = 409;
    error.message = 'At least one active Administrator account must remain.';
  }
  if (message.includes('ADMIN_ACCOUNT_PROTECTED')) {
    error.statusCode = 403;
    error.message = 'Administrator accounts are protected and cannot be deleted or deactivated.';
  }
  if (message.includes('DEACTIVATED_ACCOUNT_LOCKED')) {
    error.statusCode = 409;
    error.message = 'This account was deactivated while it was being edited. Restore it before making further changes.';
  }
  if (message.includes('ACTIVE_STAFF_ACCOUNT_DELETE_BLOCKED')) {
    error.statusCode = 409;
    error.message = 'Restore and deactivate this account again before permanently deleting it.';
  }
  if (message.includes('app.user_profiles') || message.includes('handle_auth_user')) {
    error.statusCode = 503;
    error.message = 'Supabase Auth profile sync still points to the old app.user_profiles table. Run 01_core_identity.sql to install the core.user_profiles sync functions.';
  }
  return error;
}

async function syncUserProfile({ userId, email, fullName, role }) {
  const { data, error } = await supabaseAdmin.rpc('admin_upsert_user_profile', {
    p_user_id: userId,
    p_email: email || null,
    p_full_name: fullName || null,
    p_role: normalizeRole(role),
  });

  if (error) {
    if (isMissingProfileSyncRpc(error) || isAmbiguousProfileSyncRpc(error)) {
      console.warn(`admin_upsert_user_profile RPC is unavailable or stale (${error.message}); using Supabase Auth metadata as the user source.`);
      return null;
    }
    throw error;
  }

  return Array.isArray(data) ? (data[0] ?? null) : data;
}

async function fetchProfileByUserId(userId) {
  const { data, error } = await supabaseAdmin
    .rpc('get_user_profile_by_user_id', {
      p_user_id: userId,
    });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? (data[0] ?? null) : data;
}

async function loadProfilesForUsers(users = []) {
  const entries = await Promise.all(users.map(async (user) => {
    try {
      const profile = await fetchProfileByUserId(user.id);
      return [user.id, profile];
    } catch (error) {
      console.warn(`Failed to load profile for ${user.id}:`, error.message);
      return [user.id, null];
    }
  }));

  return new Map(entries);
}

router.use(requireRole('admin'));
router.use(async (req, res, next) => {
  try {
    const actor = await assertAdministrator(req, res);
    if (actor) next();
  } catch (error) {
    next(error);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 });

    if (error) {
      throw error;
    }

    const authUsers = data?.users ?? [];
    const profiles = await loadProfilesForUsers(authUsers);
    const users = (data?.users ?? [])
      .map((user) => mapUser(user, profiles.get(user.id)))
      .sort((left, right) => String(left.email).localeCompare(String(right.email)));

    res.json({ users });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.get('/:userId/recovery-email', async (req, res, next) => {
  noStore(res);
  try {
    const { userId } = req.params;
    if (!UUID_PATTERN.test(userId)) {
      res.status(400).json({ error: 'Choose a valid staff account.' });
      return;
    }

    const { data, error } = await supabaseAdmin.rpc('get_limen_account_security', {
      p_account_id: userId,
    });
    if (error) throw error;
    const security = firstRow(data);
    if (!security) {
      res.status(404).json({ error: 'This staff account could not be found.' });
      return;
    }

    res.json({
      recovery: {
        loginEmail: security.login_email,
        verifiedEmail: security.verified_email,
        verifiedAt: security.verified_at,
        pendingEmail: security.pending_email,
        pendingExpiresAt: security.pending_expires_at,
        deliveryReady: env.recoveryEmailConfigured,
      },
    });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.post('/:userId/recovery-email', async (req, res, next) => {
  noStore(res);
  try {
    const { userId } = req.params;
    const email = String(req.body?.email || '').trim().toLowerCase();
    const currentPassword = String(req.body?.currentPassword || '');
    if (!UUID_PATTERN.test(userId) || !RECOVERY_EMAIL_PATTERN.test(email) || email.length > 254 || !currentPassword) {
      res.status(400).json({ error: 'Enter a valid recovery email and confirm your administrator password.' });
      return;
    }
    if (!env.recoveryEmailConfigured) {
      res.status(503).json({ error: 'Recovery email delivery is not set up yet. Configure the email sender first.' });
      return;
    }

    const [ipLimit, actorLimit, targetLimit] = await Promise.all([
      limitRecoverySetup('users.recovery.ip', req.ip, 10),
      limitRecoverySetup('users.recovery.actor', req.user.id, 5),
      limitRecoverySetup('users.recovery.target', userId, 5),
    ]);
    if (!ipLimit.allowed || !actorLimit.allowed || !targetLimit.allowed) {
      res.setHeader('Retry-After', String(Math.max(ipLimit.retryAfter, actorLimit.retryAfter, targetLimit.retryAfter)));
      res.status(429).json({ error: 'Too many recovery email attempts. Please wait before trying again.' });
      return;
    }

    const [{ data: actorData, error: actorError }, { data: targetData, error: targetError }] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(req.user.id),
      supabaseAdmin.auth.admin.getUserById(userId),
    ]);
    if (actorError || !actorData?.user || actorData.user.app_metadata?.role !== 'admin') {
      res.status(403).json({ error: 'Sign in again before changing account security settings.' });
      return;
    }
    if (targetError || !targetData?.user) {
      res.status(404).json({ error: 'This staff account could not be found.' });
      return;
    }
    const target = targetData.user;
    const profile = await fetchProfileByUserId(userId).catch(() => null);
    const role = getTrustedStaffRole(target, profile);
    if (!role.matches || target.app_metadata?.account_status === 'deactivated' || isCurrentlyBanned(target)) {
      res.status(409).json({ error: 'This account must be active before its recovery email can be changed.' });
      return;
    }

    const authClient = createEphemeralAuthClient();
    const { data: verified, error: passwordError } = await authClient.auth.signInWithPassword({
      email: actorData.user.email,
      password: currentPassword,
    });
    if (passwordError || verified?.user?.id !== req.user.id) {
      res.status(401).json({ error: 'Your administrator password could not be confirmed.' });
      return;
    }

    const token = randomBytes(32).toString('hex');
    const { error: beginError } = await supabaseAdmin.rpc('begin_limen_recovery_email_verification', {
      p_account_id: userId,
      p_email: email,
      p_token_digest: createHash('sha256').update(token).digest('hex'),
    });
    if (beginError) {
      const message = String(beginError.message || '');
      if (beginError.code === '23505' || message.includes('RECOVERY_EMAIL_IN_USE')) {
        res.status(409).json({ error: 'This email is already used by another account.' });
      } else if (message.includes('already verified')) {
        res.status(409).json({ error: 'This recovery email is already verified.' });
      } else {
        res.status(409).json({ error: 'The recovery email could not be changed for this account.' });
      }
      return;
    }

    const verificationUrl = createRecoveryUrl('/verify-recovery-email', token);
    const text = `An administrator added this address as a recovery email for a LimenServe account. Confirm it within 15 minutes:\n\n${verificationUrl}\n\nIf you did not expect this, ignore the message. The current recovery email stays active until you confirm.`;
    const html = `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2>Confirm your recovery email</h2><p>An administrator added this address as a recovery email for a LimenServe account. Confirm it within 15 minutes.</p><p><a href="${escapeHtml(verificationUrl)}" style="display:inline-block;background:#1e3a8a;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700">Verify email</a></p><p>If you did not expect this, ignore the message. The current recovery email stays active until you confirm.</p></div>`;
    const sent = await sendSecurityEmail({
      to: email,
      subject: 'Verify your LimenServe recovery email',
      text,
      html,
    });
    if (!sent) {
      res.status(503).json({ error: 'The verification email could not be sent. The current recovery email is unchanged. Try again shortly.' });
      return;
    }
    res.status(202).json({ message: 'Verification sent. This recovery email will become active after the recipient confirms it.' });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.post('/', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.fullName || `${req.body?.firstName || ''} ${req.body?.lastName || ''}`).trim();
    const role = normalizeStaffRole(req.body?.role);
    const password = String(req.body?.password || '');

    if (!email || !password || !fullName || !role) {
      res.status(400).json({ error: 'Enter an email, full name, password, and eligible staff role.' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { role },
    });

    if (error) {
      throw error;
    }

    const profile = await syncUserProfile({
      userId: data.user.id,
      email,
      fullName,
      role,
    }) ?? await fetchProfileByUserId(data.user.id).catch(() => null);

    res.status(201).json({
      user: mapUser(data.user, profile ?? { email, full_name: fullName, role }),
      profileSynced: Boolean(profile),
    });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.delete('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!UUID_PATTERN.test(userId)) {
      res.status(400).json({ error: 'Enter a valid staff account.' });
      return;
    }

    if (userId === req.user.id) {
      res.status(403).json({ error: 'You cannot deactivate the account you are currently using.' });
      return;
    }

    const actor = await assertAdministrator(req, res);
    if (!actor) return;

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      res.status(404).json({ error: 'This staff account could not be found.' });
      return;
    }

    const target = data.user;
    if (String(target.email || '').toLowerCase() === 'admin@limen.com') {
      res.status(403).json({ error: 'The primary administrator account is protected and cannot be removed.' });
      return;
    }
    const profile = await fetchProfileByUserId(userId).catch(() => null);
    const { appRole, profileRole, matches } = getTrustedStaffRole(target, profile);

    if (appRole === 'admin' || profileRole === 'admin') {
      res.status(403).json({ error: 'Administrator accounts are protected and cannot be deleted.' });
      return;
    }

    if (!matches) {
      res.status(409).json({ error: 'This account’s role records do not match. Reconcile the account before changing access.' });
      return;
    }

    if (!['cashier', 'stock_clerk'].includes(appRole)) {
      res.status(403).json({ error: 'Only Cashier and Clerk accounts can be removed from active staff.' });
      return;
    }

    if (target.app_metadata?.account_status === 'deactivated') {
      res.status(409).json({ error: 'This account is already inactive.' });
      return;
    }

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
      app_metadata: {
        ...target.app_metadata,
        role: 'customer',
        former_staff_role: appRole,
        account_status: 'deactivated',
      },
    });

    if (updateError || !updated?.user) {
      throw updateError || new Error('Supabase did not confirm account deactivation.');
    }

    try {
      await syncUserProfile({
        userId,
        email: updated.user.email,
        fullName: updated.user.user_metadata?.full_name || profile.full_name,
        role: 'customer',
      });
    } catch (profileError) {
      // Auth metadata already marks this account as deactivated, and the auth
      // resolver denies staff access from that trusted server-side marker.
      console.warn('Staff account deactivated; profile sync needs repair:', profileError.message);
    }

    clearAuthUserCache();
    const savedProfile = await fetchProfileByUserId(userId).catch(() => null);
    res.json({
      user: mapUser(updated.user, savedProfile),
      deactivated: true,
      businessHistoryPreserved: true,
    });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.delete('/:userId/permanent', async (req, res, next) => {
  noStore(res);
  try {
    const { userId } = req.params;
    if (!UUID_PATTERN.test(userId)) {
      res.status(400).json({ error: 'Choose a valid staff account.' });
      return;
    }
    if (userId === req.user.id) {
      res.status(403).json({ error: 'You cannot permanently delete the account you are using.' });
      return;
    }

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      res.status(404).json({ error: 'This staff account could not be found.' });
      return;
    }
    const target = data.user;
    const profile = await fetchProfileByUserId(userId).catch(() => null);
    if (String(target.email || '').toLowerCase() === 'admin@limen.com'
      || target.app_metadata?.role === 'admin'
      || profile?.role === 'admin'
      || target.app_metadata?.former_staff_role === 'admin') {
      res.status(403).json({ error: 'Administrator accounts cannot be permanently deleted.' });
      return;
    }
    if (target.app_metadata?.account_status !== 'deactivated'
      || target.app_metadata?.role !== 'customer'
      || !['cashier', 'stock_clerk'].includes(target.app_metadata?.former_staff_role)
      || profile?.role !== 'customer') {
      res.status(409).json({ error: 'Only deactivated Cashier and Clerk accounts can be permanently deleted. Reconcile this account before trying again.' });
      return;
    }

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (deleteError) {
      const message = String(deleteError.message || '');
      if (/storage|owns? .*objects?/i.test(message)) {
        res.status(409).json({ error: 'This account still owns uploaded files. Transfer or remove those files before permanently deleting it.' });
        return;
      }
      if (/foreign key|constraint|ACTIVE_STAFF_ACCOUNT_DELETE_BLOCKED/i.test(message)) {
        res.status(409).json({ error: 'This account is still linked to records that cannot be cleared safely. Review the account and try again.' });
        return;
      }
      throw deleteError;
    }

    clearAuthUserCache();
    res.json({ deleted: true, userId, businessHistoryPreserved: true });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.post('/:userId/restore', async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!UUID_PATTERN.test(userId)) {
      res.status(400).json({ error: 'Enter a valid staff account.' });
      return;
    }

    const actor = await assertAdministrator(req, res);
    if (!actor) return;

    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      res.status(404).json({ error: 'This staff account could not be found.' });
      return;
    }

    const target = data.user;
    const formerRole = normalizeStaffRole(target.app_metadata?.former_staff_role);
    if (target.app_metadata?.account_status !== 'deactivated' || !['cashier', 'stock_clerk'].includes(formerRole)) {
      res.status(409).json({ error: 'This account is not an inactive Cashier or Clerk account.' });
      return;
    }

    const profile = await fetchProfileByUserId(userId).catch(() => null);
    if (!profile) {
      res.status(409).json({ error: 'This account’s profile could not be confirmed. Contact support before restoring access.' });
      return;
    }

    // Restore the profile while the trusted Auth marker still denies staff access.
    const restoredProfile = await syncUserProfile({
      userId,
      email: target.email,
      fullName: target.user_metadata?.full_name || profile.full_name,
      role: formerRole,
    }) ?? await fetchProfileByUserId(userId);

    if (normalizeStaffRole(restoredProfile?.role) !== formerRole) {
      res.status(503).json({ error: 'The staff profile could not be restored safely. Access remains disabled; try again later.' });
      return;
    }

    const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      ban_duration: 'none',
      app_metadata: {
        ...target.app_metadata,
        role: formerRole,
        former_staff_role: null,
        account_status: 'active',
      },
    });

    if (updateError || !updated?.user) {
      throw updateError || new Error('Supabase did not confirm account restoration.');
    }

    clearAuthUserCache();
    const savedProfile = await fetchProfileByUserId(userId).catch(() => null);
    res.json({ user: mapUser(updated.user, savedProfile), restored: true });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

router.patch('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!UUID_PATTERN.test(userId)) {
      res.status(400).json({ error: 'Enter a valid staff account.' });
      return;
    }

    const role = normalizeStaffRole(req.body?.role);
    if (!role) {
      res.status(400).json({ error: 'Choose Administrator, Cashier, or Clerk.' });
      return;
    }

    const actor = await assertAdministrator(req, res);
    if (!actor) return;

    const { data: currentAuth, error: loadError } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (loadError || !currentAuth?.user) {
      res.status(404).json({ error: 'This user account could not be found.' });
      return;
    }
    const currentProfile = await fetchProfileByUserId(userId).catch(() => null);
    const currentTarget = currentAuth.user;
    if (String(currentTarget.email || '').toLowerCase() === 'admin@limen.com') {
      res.status(403).json({ error: 'The primary administrator identity is protected. Use Account Security to change its password.' });
      return;
    }
    const currentRole = getTrustedStaffRole(currentTarget, currentProfile);
    if (currentTarget.app_metadata?.account_status === 'deactivated' || isCurrentlyBanned(currentTarget)) {
      res.status(409).json({ error: 'Restore this account before editing its details.' });
      return;
    }
    if (!currentRole.matches) {
      res.status(409).json({ error: 'This account’s role records do not match. Reconcile the account before editing it.' });
      return;
    }

    if (currentRole.appRole === 'admin' && role !== 'admin') {
      const otherAdmins = await countOtherActiveAdministrators(userId);
      if (otherAdmins < 1) {
        res.status(409).json({ error: 'At least one active Administrator account must remain.' });
        return;
      }
    }

    const fullName = String(req.body?.fullName || `${req.body?.firstName || ''} ${req.body?.lastName || ''}`).trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const authAttributes = {
      user_metadata: { full_name: fullName },
      app_metadata: { ...currentTarget.app_metadata, role },
    };

    if (email) {
      authAttributes.email = email;
    }

    if (password) {
      authAttributes.password = password;
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, authAttributes);
    if (error) {
      throw error;
    }

    const profile = await syncUserProfile({
      userId,
      email: email || data.user.email,
      fullName,
      role,
    }) ?? await fetchProfileByUserId(req.params.userId).catch(() => null);

    clearAuthUserCache();
    res.json({
      user: mapUser(data.user, profile ?? { email: email || data.user.email, full_name: fullName, role }),
      profileSynced: Boolean(profile),
    });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

export default router;
