import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();
const ALLOWED_ROLES = new Set(['admin', 'cashier', 'staff', 'stock_clerk', 'viewer', 'customer']);

function splitName(fullName = '') {
  const [firstName = '', ...lastNameParts] = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName,
    lastName: lastNameParts.join(' '),
  };
}

function normalizeRole(role) {
  return ALLOWED_ROLES.has(role) ? role : 'staff';
}

function mapUser(authUser, profile = null) {
  const fullName = profile?.full_name || authUser?.user_metadata?.full_name || '';
  const name = splitName(fullName);
  const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
  const isBanned = Boolean(bannedUntil && bannedUntil.getTime() > Date.now());

  return {
    id: authUser.id,
    userId: authUser.id,
    firstName: name.firstName,
    lastName: name.lastName,
    fullName,
    email: profile?.email || authUser.email || '',
    role: normalizeRole(profile?.role || authUser?.app_metadata?.role),
    status: isBanned ? 'inactive' : 'active',
    lastLogin: authUser.last_sign_in_at || null,
    createdAt: authUser.created_at || profile?.created_at || null,
    updatedAt: profile?.updated_at || authUser.updated_at || null,
  };
}

async function loadProfiles() {
  const { data, error } = await supabaseAdmin
    .schema('core')
    .from('user_profiles')
    .select('id, user_id, email, full_name, role, created_at, updated_at');

  if (error) {
    throw error;
  }

  return new Map((data ?? []).map((profile) => [profile.user_id, profile]));
}

async function upsertProfile({ userId, email, fullName, role }) {
  const { error } = await supabaseAdmin
    .schema('core')
    .from('user_profiles')
    .upsert({
      user_id: userId,
      email,
      full_name: fullName,
      role: normalizeRole(role),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    throw error;
  }
}

router.use(requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const [{ data, error }, profiles] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 100 }),
      loadProfiles(),
    ]);

    if (error) {
      throw error;
    }

    const users = (data?.users ?? [])
      .map((user) => mapUser(user, profiles.get(user.id)))
      .sort((left, right) => String(left.email).localeCompare(String(right.email)));

    res.json({ users });
  } catch (error) {
    next(error);
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

    await upsertProfile({
      userId: data.user.id,
      email,
      fullName,
      role,
    });

    res.status(201).json({ user: mapUser(data.user, { email, full_name: fullName, role }) });
  } catch (error) {
    next(error);
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

    await upsertProfile({
      userId: req.params.userId,
      email: email || data.user.email,
      fullName,
      role,
    });

    res.json({ user: mapUser(data.user, { email: email || data.user.email, full_name: fullName, role }) });
  } catch (error) {
    next(error);
  }
});

export default router;
