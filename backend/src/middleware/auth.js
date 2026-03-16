import { supabaseAdmin, supabaseAuth } from '../config/supabase.js';

async function fetchProfile(userId) {
  const { data, error } = await supabaseAdmin.rpc('get_user_profile_by_user_id', {
    p_user_id: userId,
  });

  if (error) {
    throw error;
  }

  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export async function attachUser(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    req.authToken = token;
    req.user = null;

    if (!token) {
      return next();
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);

    if (error || !data?.user) {
      return next();
    }

    const profile = await fetchProfile(data.user.id);

    req.user = {
      id: data.user.id,
      email: data.user.email,
      fullName: profile?.full_name || data.user.user_metadata?.full_name || '',
      role: profile?.role || data.user.app_metadata?.role || 'customer',
      profile,
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

export function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  return next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }

    return next();
  };
}
