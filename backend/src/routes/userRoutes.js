import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const ALLOWED_ROLES = new Set(['admin', 'cashier', 'stock_clerk']);

function splitName(fullName = '') {
  const [firstName = '', ...lastNameParts] = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: lastNameParts.join(' '),
  };
}

function normalizeRole(role) {
  if (role === 'staff' || role === 'viewer' || role === 'customer') {
    return 'stock_clerk';
  }

  return ALLOWED_ROLES.has(role) ? role : 'stock_clerk';
}

function mapUser(authUser, profile = null) {
  const fullName = authUser?.user_metadata?.full_name || profile?.full_name || '';
  const name = splitName(fullName);
  const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
  const isBanned = Boolean(bannedUntil && bannedUntil.getTime() > Date.now());

  return {
    id: authUser.id,
    userId: authUser.id,
    firstName: name.firstName,
    lastName: name.lastName,
    fullName,
    email: authUser.email || profile?.email || '',
    role: normalizeRole(authUser?.app_metadata?.role || profile?.role),
    status: isBanned ? 'inactive' : 'active',
    lastLogin: authUser.last_sign_in_at || null,
    createdAt: authUser.created_at || profile?.created_at || null,
    updatedAt: authUser.updated_at || profile?.updated_at || null,
  };
}

function isMissingProfileSyncRpc(error) {
  const message = String(error?.message || '');
  return error?.code === 'PGRST202'
    || message.includes('admin_upsert_user_profile')
    || message.includes('Could not find the function');
}

function normalizeUserSaveError(error) {
  const message = String(error?.message || '');
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
    if (isMissingProfileSyncRpc(error)) {
      console.warn('admin_upsert_user_profile RPC is not installed; using Supabase Auth metadata as the user source.');
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

router.post('/', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const fullName = String(req.body?.fullName || `${req.body?.firstName || ''} ${req.body?.lastName || ''}`).trim();
    const role = normalizeRole(req.body?.role);
    const password = String(req.body?.password || '');

    if (!email || !password || !fullName) {
      res.status(400).json({ error: 'Email, full name, and password are required.' });
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

router.patch('/:userId', async (req, res, next) => {
  try {
    const fullName = String(req.body?.fullName || `${req.body?.firstName || ''} ${req.body?.lastName || ''}`).trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = normalizeRole(req.body?.role);
    const password = String(req.body?.password || '');
    const authAttributes = {
      user_metadata: { full_name: fullName },
      app_metadata: { role },
    };

    if (email) {
      authAttributes.email = email;
    }

    if (password) {
      authAttributes.password = password;
    }

    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(req.params.userId, authAttributes);
    if (error) {
      throw error;
    }

    const profile = await syncUserProfile({
      userId: req.params.userId,
      email: email || data.user.email,
      fullName,
      role,
    }) ?? await fetchProfileByUserId(req.params.userId).catch(() => null);

    res.json({
      user: mapUser(data.user, profile ?? { email: email || data.user.email, full_name: fullName, role }),
      profileSynced: Boolean(profile),
    });
  } catch (error) {
    next(normalizeUserSaveError(error));
  }
});

export default router;
