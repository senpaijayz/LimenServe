import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

// Separate from the retired /api/stockroom API; never revive its write routes.
export function createLocatorRouter({ client = supabaseAdmin } = {}) {
  const router = Router();
  router.use(requireRole('admin', 'stock_clerk', 'cashier', 'staff', 'viewer', 'mechanic'));
  router.post('/command', async (req, res, next) => {
    const { action, payload = {} } = req.body || {};
    if (!['list', 'load', 'history', 'save', 'assign', 'publish', 'restore'].includes(action)
      || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Invalid locator request.' });
    }
    if (!['list', 'load'].includes(action) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can change the stockroom.' });
    }
    try {
      const { data, error } = await client.rpc('limen_locator_command', {
        p_action: action,
        p_payload: { ...payload, allowDraft: req.user.role === 'admin' && payload.publishedOnly !== true },
        p_actor: req.user.id,
      });
      if (error) {
        if (['40001', '23505'].includes(error.code)) return res.status(409).json({ error: 'This layout changed or a draft with this name already exists. Reload the saved layout before saving. Your local edits have been kept.' });
        if (['22023', '22P02', '23503', '23514', '23502'].includes(error.code)) return res.status(400).json({ error: 'The layout or assignment is invalid. Check its shelves, layers, bins and product mappings.' });
        if (error.code === 'P0002') return res.status(404).json({ error: 'Layout or revision not found.' });
        if (error.code === '42501') return res.status(403).json({ error: 'This layout is not available for this operation.' });
        throw error;
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ result: data });
    } catch (error) { return next(error); }
  });
  return router;
}

export default createLocatorRouter();
