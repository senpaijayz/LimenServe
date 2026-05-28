import { supabaseAdmin, supabaseAuth } from '../config/supabase.js';
import { createAuthUserResolver } from './authUserResolver.js';

export const authUserResolver = createAuthUserResolver({ supabaseAuth, supabaseAdmin });

export async function attachUser(req, _res, next) {
  try {
    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : null;

    req.authToken = token;
    req.user = null;

    if (req.skipUserAttachment) {
      return next();
    }

    if (!token) {
      return next();
    }

    req.user = await authUserResolver.resolveUser(token);

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
