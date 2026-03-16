import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    const [snapshot, itemSnapshot] = await Promise.all([
      callRpc('get_analytics_dashboard_snapshot'),
      callRpc('get_dashboard_item_sales_snapshot', {
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null,
        category_filter: req.query.category || null,
        product_id_filter: req.query.productId || null,
      }),
    ]);

    res.json({
      ...(snapshot ?? {}),
      ...(itemSnapshot ?? {}),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/items/top-selling', async (req, res, next) => {
  try {
    const items = await callRpc('get_top_selling_items', {
      start_date: req.query.startDate || null,
      end_date: req.query.endDate || null,
      category_filter: req.query.category || null,
      product_id_filter: req.query.productId || null,
      location_filter: req.query.location || null,
      limit_count: Number(req.query.limit || 10),
    });

    res.json({ items: items ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/trend', async (req, res, next) => {
  try {
    const trend = await callRpc('get_item_sales_trend', {
      start_date: req.query.startDate || null,
      end_date: req.query.endDate || null,
      product_id_filter: req.query.productId || null,
      category_filter: req.query.category || null,
      location_filter: req.query.location || null,
      granularity: req.query.granularity || 'month',
    });

    res.json({ trend: trend ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/peak-periods', async (req, res, next) => {
  try {
    const periods = await callRpc('get_item_peak_periods', {
      start_date: req.query.startDate || null,
      end_date: req.query.endDate || null,
      product_id_filter: req.query.productId || null,
      category_filter: req.query.category || null,
      location_filter: req.query.location || null,
    });

    res.json({ periods: periods ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/snapshot', async (req, res, next) => {
  try {
    const snapshot = await callRpc('get_dashboard_item_sales_snapshot', {
      start_date: req.query.startDate || null,
      end_date: req.query.endDate || null,
      category_filter: req.query.category || null,
      product_id_filter: req.query.productId || null,
    });

    res.json(snapshot ?? {});
  } catch (error) {
    next(error);
  }
});

router.get('/refresh-runs', requireRole('admin'), async (req, res, next) => {
  try {
    const refreshRuns = await callRpc('get_analytics_refresh_runs', {
      limit_count: Number(req.query.limit || 10),
    });

    res.json({ refreshRuns: refreshRuns ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/forecasts/products', async (req, res, next) => {
  try {
    const forecasts = await callRpc('get_monthly_product_forecasts', {
      target_month: req.query.targetMonth || null,
    });

    res.json({ forecasts: forecasts ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/forecasts/services', async (req, res, next) => {
  try {
    const forecasts = await callRpc('get_monthly_service_forecasts', {
      target_month: req.query.targetMonth || null,
    });

    res.json({ forecasts: forecasts ?? [] });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', requireRole('admin'), async (req, res, next) => {
  try {
    const refreshRunId = await callRpc('run_full_analytics_refresh', {
      p_notes: req.body?.notes || 'Manual refresh from backend API',
    });

    res.status(202).json({ refreshRunId });
  } catch (error) {
    next(error);
  }
});

export default router;
