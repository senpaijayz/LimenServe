import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc, querySchemaTable } from '../services/supabaseRpc.js';

const router = Router();

function isMissingItemAnalyticsRpcError(error) {
  const message = String(error?.message || error || '');

  return (
    message.includes('get_dashboard_item_sales_snapshot') ||
    message.includes('get_top_selling_items') ||
    message.includes('get_item_sales_trend') ||
    message.includes('get_item_peak_periods') ||
    message.includes('schema cache') ||
    message.includes('Could not find the function')
  );
}

function isMissingAnalyticsDependency(error, names = []) {
  const message = String(error?.message || error || '');

  return names.some((name) => message.includes(name))
    || message.includes('schema cache')
    || message.includes('Could not find the function')
    || message.includes('does not exist');
}

async function callOptionalItemAnalyticsRpc(name, params = {}, fallbackValue = null) {
  try {
    return await callRpc(name, params);
  } catch (error) {
    if (isMissingItemAnalyticsRpcError(error)) {
      return fallbackValue;
    }

    throw error;
  }
}

async function getOptionalMlRows(viewName, queryBuilder, fallbackValue = []) {
  try {
    return await querySchemaTable('ml', viewName, queryBuilder);
  } catch (error) {
    if (isMissingAnalyticsDependency(error, [viewName])) {
      return fallbackValue;
    }

    throw error;
  }
}

async function getOptionalLatestRefreshRun() {
  try {
    const rows = await querySchemaTable('core', 'analytics_refresh_runs', (query) => query
      .select('id, status, notes, error_message, dimension_rows, fact_rows, rule_rows, forecast_rows, started_at, ended_at')
      .order('started_at', { ascending: false })
      .limit(1));

    const latest = rows?.[0];
    if (!latest) {
      return null;
    }

    return {
      id: latest.id,
      status: latest.status,
      notes: latest.notes,
      errorMessage: latest.error_message,
      dimensionRows: Number(latest.dimension_rows ?? 0),
      factRows: Number(latest.fact_rows ?? 0),
      ruleRows: Number(latest.rule_rows ?? 0),
      forecastRows: Number(latest.forecast_rows ?? 0),
      startedAt: latest.started_at,
      endedAt: latest.ended_at,
    };
  } catch (error) {
    if (isMissingAnalyticsDependency(error, ['analytics_refresh_runs'])) {
      return null;
    }

    throw error;
  }
}

async function buildAnalyticsDashboardSnapshotFallback() {
  const [latestRefresh, topUpsellOpportunities, predictedLowStockRisk, topProductForecasts, topServiceForecasts] = await Promise.all([
    getOptionalLatestRefreshRun(),
    getOptionalMlRows('v_top_upsell_opportunities', (query) => query
      .select('*')
      .order('lift', { ascending: false })
      .order('confidence', { ascending: false })
      .limit(5)),
    getOptionalMlRows('v_predicted_low_stock_risk', (query) => query
      .select('*')
      .in('risk_level', ['critical', 'high', 'medium'])
      .order('predicted_quantity', { ascending: false })
      .limit(5)),
    callRpc('get_monthly_product_forecasts', { target_month: null }).catch((error) => {
      if (isMissingAnalyticsDependency(error, ['get_monthly_product_forecasts'])) {
        return [];
      }

      throw error;
    }),
    callRpc('get_monthly_service_forecasts', { target_month: null }).catch((error) => {
      if (isMissingAnalyticsDependency(error, ['get_monthly_service_forecasts'])) {
        return [];
      }

      throw error;
    }),
  ]);

  return {
    latestRefresh,
    topUpsellOpportunities: topUpsellOpportunities ?? [],
    predictedLowStockRisk: predictedLowStockRisk ?? [],
    topProductForecasts: (topProductForecasts ?? []).slice(0, 5),
    topServiceForecasts: (topServiceForecasts ?? []).slice(0, 5),
  };
}

async function loadAnalyticsDashboardSnapshot() {
  try {
    return await callRpc('get_analytics_dashboard_snapshot');
  } catch (error) {
    if (isMissingAnalyticsDependency(error, ['get_analytics_dashboard_snapshot', 'analytics_refresh_runs'])) {
      return buildAnalyticsDashboardSnapshotFallback();
    }

    throw error;
  }
}

router.get('/dashboard', async (req, res, next) => {
  try {
    const [snapshot, itemSnapshot] = await Promise.all([
      loadAnalyticsDashboardSnapshot(),
      callOptionalItemAnalyticsRpc(
        'get_dashboard_item_sales_snapshot',
        {
          start_date: req.query.startDate || null,
          end_date: req.query.endDate || null,
          category_filter: req.query.category || null,
          product_id_filter: req.query.productId || null,
        },
        {
          topSellingItems: [],
          itemTrend: [],
          peakPeriods: [],
        },
      ),
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
    const items = await callOptionalItemAnalyticsRpc(
      'get_top_selling_items',
      {
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null,
        category_filter: req.query.category || null,
        product_id_filter: req.query.productId || null,
        location_filter: req.query.location || null,
        limit_count: Number(req.query.limit || 10),
      },
      [],
    );

    res.json({ items: items ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/trend', async (req, res, next) => {
  try {
    const trend = await callOptionalItemAnalyticsRpc(
      'get_item_sales_trend',
      {
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null,
        product_id_filter: req.query.productId || null,
        category_filter: req.query.category || null,
        location_filter: req.query.location || null,
        granularity: req.query.granularity || 'month',
      },
      [],
    );

    res.json({ trend: trend ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/peak-periods', async (req, res, next) => {
  try {
    const periods = await callOptionalItemAnalyticsRpc(
      'get_item_peak_periods',
      {
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null,
        product_id_filter: req.query.productId || null,
        category_filter: req.query.category || null,
        location_filter: req.query.location || null,
      },
      [],
    );

    res.json({ periods: periods ?? [] });
  } catch (error) {
    next(error);
  }
});

router.get('/items/snapshot', async (req, res, next) => {
  try {
    const snapshot = await callOptionalItemAnalyticsRpc(
      'get_dashboard_item_sales_snapshot',
      {
        start_date: req.query.startDate || null,
        end_date: req.query.endDate || null,
        category_filter: req.query.category || null,
        product_id_filter: req.query.productId || null,
      },
      {
        topSellingItems: [],
        itemTrend: [],
        peakPeriods: [],
      },
    );

    res.json(snapshot ?? {});
  } catch (error) {
    next(error);
  }
});

router.get('/refresh-runs', requireRole('admin'), async (req, res, next) => {
  try {
    const limitCount = Number(req.query.limit || 10);
    let refreshRuns;

    try {
      refreshRuns = await callRpc('get_analytics_refresh_runs', {
        limit_count: limitCount,
      });
    } catch (error) {
      if (!isMissingAnalyticsDependency(error, ['get_analytics_refresh_runs', 'analytics_refresh_runs'])) {
        throw error;
      }

      refreshRuns = await querySchemaTable('core', 'analytics_refresh_runs', (query) => query
        .select('id, status, notes, error_message, dimension_rows, fact_rows, rule_rows, forecast_rows, started_at, ended_at')
        .order('started_at', { ascending: false })
        .limit(Math.max(limitCount, 1)));
    }

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
