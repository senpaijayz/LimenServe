import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { locatorRpcClient } from '../services/locatorRpcClient.js';

// Separate from the retired /api/stockroom API; never revive its write routes.
export function createLocatorRouter({ client = locatorRpcClient } = {}) {
  const router = Router();
  router.use(requireRole('admin', 'stock_clerk', 'cashier', 'staff', 'viewer', 'mechanic'));
  router.post('/command', async (req, res, next) => {
    const { action, payload = {} } = req.body || {};
    if (!['list', 'load', 'history', 'view_revision', 'save', 'assign', 'unassign', 'publish', 'restore'].includes(action)
      || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ error: 'Invalid locator request.' });
    }
    if (!['list', 'load'].includes(action) && req.user.role !== 'admin') {
      return res.status(403).json({ error: action === 'view_revision' || action === 'history'
        ? 'Only administrators can view stockroom draft history.'
        : 'Only administrators can manage the stockroom.' });
    }
    if (action === 'view_revision' && (!/^[0-9a-f-]{36}$/i.test(String(payload.layoutId || ''))
      || !Number.isSafeInteger(Number(payload.revision)) || Number(payload.revision) < 1)) {
      return res.status(400).json({ error: 'A valid layout and revision are required.' });
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
        const layerCount = Math.min(12, Math.max(1, Math.round(Number(shelf.layerCount || (shelf.type === 'shelf-4-layer' ? 4 : 2)))));
        const capacities = shelf.layerCapacities || {};
        const spacings = shelf.layerSpacingByNumber || {};
        if ((typeof capacities !== 'object' || Array.isArray(capacities))
          || (typeof spacings !== 'object' || Array.isArray(spacings))) {
          return res.status(400).json({ error: 'Shelf layer settings must be valid objects.' });
        }
        for (const [layer, capacity] of Object.entries(capacities)) {
          if (!/^\d+$/.test(layer) || Number(layer) < 1 || Number(layer) > layerCount || !Number.isInteger(capacity) || capacity < 3 || capacity > 5) {
            return res.status(400).json({ error: 'Shelf layer capacity must be 3–5 parts for a valid layer.' });
          }
        }
        for (const [layer, spacing] of Object.entries(spacings)) {
          if (!/^\d+$/.test(layer) || Number(layer) < 1 || Number(layer) > layerCount || typeof spacing !== 'number' || spacing < 0.8 || spacing > 1) {
            return res.status(400).json({ error: 'Shelf layer spacing must be 80–100% for a valid layer.' });
          }
        }
      }
    }
    const controller = new AbortController();
    const signal = req.abortSignal ? AbortSignal.any([req.abortSignal, controller.signal]) : controller.signal;
    const onClose = () => { if (!res.writableEnded) controller.abort(); };
    res.once('close', onClose);
    try {
      const revisionRead = action === 'view_revision';
      const { data, error, durationMs } = await client.rpc(
        revisionRead ? 'limen_locator_revision_snapshot' : 'limen_locator_command',
        revisionRead
          ? { p_layout_id: payload.layoutId, p_revision: payload.revision }
          : {
            p_action: action,
            p_payload: { ...payload, allowDraft: req.user.role === 'admin' && payload.publishedOnly !== true },
            p_actor: req.user.id,
          },
        { signal },
      );
      if (res.destroyed || res.headersSent) return;
      if (Number.isFinite(durationMs)) {
        res.set('Server-Timing', `locator;dur=${durationMs.toFixed(1)}`);
        req.log?.info?.('locator.command', { requestId: req.requestId, action, durationMs: Number(durationMs.toFixed(1)), outcome: error?.code || 'ok' });
      }
      if (error) {
        if (error.code === 'PT410') return res.status(409).json({ error: 'A product in this shelf map was removed or replaced. Refresh the locator and select the current part before saving.', code: 'LOCATOR_PRODUCT_CHANGED' });
        if (String(error.code || '').startsWith('LOCATOR_') || error.code === '57014') return res.status(504).json({ error: 'The stockroom server did not confirm the result in time. Your edits are kept. Check the saved layout before retrying.', code: 'LOCATOR_SAVE_UNCONFIRMED' });
        if (error.code === '23514' && /layer.*capacity/i.test(error.message || '')) return res.status(409).json({ error: error.message, code: 'LOCATOR_LAYER_FULL' });
        if (['PT409', '40001', '23505'].includes(error.code)) {
          const duplicateName = /draft with this name already exists/i.test(error.message || '');
          return res.status(409).json({
            error: duplicateName
              ? 'A saved draft already has this name. Load that draft or choose a different name to keep your current edits.'
              : 'This layout changed after you opened it. Reload the saved version and reconcile your edits before saving.',
            code: duplicateName ? 'LOCATOR_DRAFT_NAME_EXISTS' : 'LOCATOR_REVISION_CONFLICT',
          });
        }
        if (['22023', '22P02', '23503', '23514', '23502'].includes(error.code)) return res.status(400).json({ error: 'The layout or assignment is invalid. Check its shelves, layers, bins and product mappings.' });
        if (error.code === 'P0002') return res.status(404).json({ error: 'Layout or revision not found.' });
        if (error.code === '42501') return res.status(403).json({ error: 'This layout is not available for this operation.' });
        throw error;
      }
      res.set('Cache-Control', 'no-store');
      return res.json({ result: data });
    } catch (error) { if (!res.destroyed && !res.headersSent) return next(error); }
    finally { res.removeListener('close', onClose); }
  });
  return router;
}

export default createLocatorRouter();
