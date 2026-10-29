import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const allowedTypes = new Set(['all', 'stock_in', 'stock_out', 'adjustment', 'release', 'sale', 'service_usage', 'archive', 'restore']);
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const router = Router();
router.get('/stock/movements/export', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'private, no-store');
    const search = req.query.search ?? '', type = req.query.type ?? 'all';
    const startDate = req.query.startDate || null, endDate = req.query.endDate || null;
    if (typeof search !== 'string' || typeof type !== 'string' || !allowedTypes.has(type)
      || (startDate !== null && !validDate(startDate)) || (endDate !== null && !validDate(endDate))
      || (startDate && endDate && startDate > endDate)) {
      return res.status(400).json({ error: 'Choose a valid movement type and date range.' });
    }
    const filters = { search: search.trim().slice(0, 180), type, startDate, endDate };
    const data = await callRpc('limen_inventory_movement_export', {
      p_search: filters.search, p_type: type, p_start_date: startDate, p_end_date: endDate,
    });
    if (data.tooLarge) return res.status(422).json({ error: 'More than 10,000 records match. Choose a shorter date range or a more specific search, then export again. No partial file was created.' });
    res.json({ ...data, filters, timeZone: 'Asia/Manila' });
  } catch (error) { next(error); }
});
export default router;
