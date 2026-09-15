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
    if (action === 'save' && Array.isArray(payload.objects)) {
      const identifiers = new Set();
      for (const shelf of payload.objects.filter((object) => ['shelf', 'shelf-2-layer', 'shelf-4-layer', 'parts-cabinet'].includes(object?.type))) {
        const aisle = String(shelf.aisle || '').replace(/^aisle\s+/i, '').trim().toUpperCase();
        const number = Number(shelf.shelfNumber);
        const key = `${Number(shelf.floor || 1)}:${aisle}:${number}`;
        if (!aisle || aisle.length > 24 || !Number.isInteger(number) || number < 1 || number > 9999 || identifiers.has(key)) {
          return res.status(400).json({ error: 'Each shelf needs a unique floor, aisle and shelf number (1–9999). Check duplicated shelf identifiers.' });
        }
        identifiers.add(key);
      }
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
