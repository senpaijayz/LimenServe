import { Router } from 'express';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

router.get('/products', async (_req, res, next) => {
  try {
    const products = await callRpc('get_product_catalog');
    res.json({ products: products ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/products/:productId/recommendations', async (req, res, next) => {
  try {
    const recommendations = await callRpc('get_product_upsell_recommendations', {
      product_id: req.params.productId,
      vehicle_model_id: req.query.vehicleModelId || null,
      limit_count: Number(req.query.limit || 5),
    });

    res.json({ recommendations: recommendations ?? [] });
  } catch (error) {
    next(error);
  }
});

export default router;
