import { Router } from 'express';
import { callRpc } from '../services/supabaseRpc.js';
import { getPublishedCmsPage, getPublishedCmsSite, getPublishedFeaturedCatalogItems } from '../services/cmsService.js';

const router = Router();

function isMissingLegacyMechanicsError(error) {
  const message = String(error?.message || '');
  return (message.includes('app.mechanics') || message.includes('app.get_public_mechanics') || message.includes('schema "app"'))
    && message.includes('does not exist');
}

function normalizeMechanic(row = {}) {
  let storedProfile = {};
  try {
    storedProfile = JSON.parse(row.location_name || '{}');
  } catch {
    storedProfile = {};
  }

  const normalizedLocation = String(row.location_name || '').toLowerCase();
  const legacyContact = row.location_name
    && !normalizedLocation.startsWith('{')
    && !['main shop', 'limen'].includes(normalizedLocation)
    ? row.location_name
    : '';
  const contactNumber = row.contact_number
    ?? row.contactNumber
    ?? row.metadata?.contact_number
    ?? row.metadata?.contactNumber
    ?? storedProfile.contact_number
    ?? legacyContact
    ?? '';
  const shiftType = row.shift_type
    ?? row.schedule_type
    ?? row.metadata?.shift_type
    ?? row.metadata?.schedule_type
    ?? storedProfile.shift_type
    ?? null;
  const availableDate = row.available_date
    ?? row.availableDate
    ?? row.metadata?.available_date
    ?? row.metadata?.availableDate
    ?? storedProfile.available_date
    ?? null;

  return {
    ...row,
    contact_number: contactNumber,
    contactNumber,
    shift_type: shiftType,
    schedule_type: shiftType,
    available_date: availableDate,
    availableDate,
    location_name: 'Limen',
  };
}

router.get('/mechanics', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('get_public_mechanics');
    res.json({ mechanics: (mechanics ?? []).map(normalizeMechanic) });
  } catch (error) {
    if (isMissingLegacyMechanicsError(error)) {
      try {
        const mechanics = await callRpc('list_mechanics');
        res.json({
          mechanics: (mechanics ?? [])
            .filter((mechanic) => mechanic.is_public !== false)
            .map(normalizeMechanic),
          warning: 'Using migrated mechanic list while public mechanic RPC is being refreshed.',
        });
        return;
      } catch (_fallbackError) {
        res.json({
          mechanics: [],
          warning: 'Mechanic public profiles need the live database function migration.',
        });
        return;
      }
    }

    next(error);
  }
});

router.get('/cms/site', async (_req, res, next) => {
  try {
    const site = await getPublishedCmsSite();
    res.json({ site });
  } catch (error) {
    next(error);
  }
});

router.get('/cms/pages/:slug', async (req, res, next) => {
  try {
    const page = await getPublishedCmsPage(req.params.slug);

    if (!page) {
      res.status(404).json({ error: 'Published CMS page was not found.' });
      return;
    }

    res.json({ page });
  } catch (error) {
    next(error);
  }
});

router.get('/catalog/featured', async (req, res, next) => {
  try {
    const placementKey = String(req.query.placementKey || 'home_best_sellers').trim();
    const items = await getPublishedFeaturedCatalogItems(placementKey);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.get('/catalog/recommendation-packages', async (req, res, next) => {
  try {
    const anchorProductId = String(req.query.anchorProductId || '').trim();

    if (!anchorProductId) {
      res.json({ packages: [] });
      return;
    }

    const rows = await callRpc('get_cms_recommendation_packages', {
      p_anchor_product_id: anchorProductId,
      p_vehicle_model_name: String(req.query.vehicleModel || '').trim() || null,
      p_part_limit: Number.parseInt(req.query.partLimit, 10) || 8,
      p_service_limit: Number.parseInt(req.query.serviceLimit, 10) || 4,
    });

    res.json({ rows: rows ?? [] });
  } catch (error) {
    next(error);
  }
});

export default router;
