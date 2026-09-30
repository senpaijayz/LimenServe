import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createPriceHistoryRouter(client) {
  const router = Router();
  const authorize = requireRole('admin', 'stock_clerk', 'cashier');
  router.get('/products/:productId/price-history', authorize, async (req, res, next) => {
    if (!UUID.test(req.params.productId)) return res.status(400).json({ error: 'Invalid product.' });
    try {
      const { data, error } = await client.rpc('limen_product_price_history', { p_product_id: req.params.productId });
      if (error) throw error;
      if (!data) return res.status(404).json({ error: 'Product not found.' });
      res.set('Cache-Control', 'no-store').json(data);
    } catch (error) { next(error); }
  });
  router.post('/prices/quote', authorize, async (req, res, next) => {
    const ids = req.body?.productIds;
    if (!Array.isArray(ids) || ids.length > 100 || ids.some((id) => typeof id !== 'string' || !UUID.test(id))) {
      return res.status(400).json({ error: 'Provide up to 100 valid products.' });
    }
    try {
      const { data, error } = await client.rpc('limen_current_retail_prices', { p_product_ids: [...new Set(ids)] });
      if (error) throw error;
      res.set('Cache-Control', 'no-store').json({ prices: data ?? [] });
    } catch (error) { next(error); }
  });
  return router;
}
