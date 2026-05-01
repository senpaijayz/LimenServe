import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  buildBootstrapResponse,
  createAisle,
  createLayoutVersion,
  createOrUpdateItemLocation,
  createShelf,
  createZone,
  deleteItemLocation,
  getItemRouteDetails,
  getStockroomSnapshot,
  invalidateStockroomCache,
  listMasterItems,
  listStockroomLayouts,
  parseKeywordsInput,
  publishLayout,
  removeAisle,
  removeShelf,
  removeZone,
  searchLocatorItems,
  updateAisle,
  updateItemMaster,
  updateLayoutMetadata,
  updateShelf,
  updateZone,
} from '../services/stockroomService.js';

const router = Router();

function numberOrDefault(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readLayoutPayload(body = {}) {
  return {
    name: String(body.name || '').trim(),
    staircaseFloor1Anchor: body.staircaseFloor1Anchor ?? { x: 0, y: 0 },
    staircaseFloor2Anchor: body.staircaseFloor2Anchor ?? { x: 0, y: 0 },
    cameraSettings: body.cameraSettings ?? {},
    metadata: body.metadata ?? {},
  };
}

function readZonePayload(body = {}) {
  return {
    layoutId: body.layoutId,
    floorId: body.floorId,
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    positionX: numberOrDefault(body.positionX),
    positionY: numberOrDefault(body.positionY),
    width: numberOrDefault(body.width, 8),
    depth: numberOrDefault(body.depth, 6),
    colorHex: String(body.colorHex || '#2563eb').trim(),
    metadata: body.metadata ?? {},
  };
}

function readAislePayload(body = {}) {
  return {
    layoutId: body.layoutId,
    floorId: body.floorId,
    zoneId: body.zoneId,
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    startX: numberOrDefault(body.startX),
    startY: numberOrDefault(body.startY),
    endX: numberOrDefault(body.endX, 5),
    endY: numberOrDefault(body.endY),
    walkwayWidth: numberOrDefault(body.walkwayWidth, 1.8),
    metadata: body.metadata ?? {},
  };
}

function readShelfPayload(body = {}) {
  return {
    layoutId: body.layoutId,
    floorId: body.floorId,
    zoneId: body.zoneId,
    aisleId: body.aisleId,
    code: String(body.code || '').trim(),
    name: String(body.name || '').trim(),
    shelfType: body.shelfType === '2_level' ? '2_level' : '4_level',
    positionX: numberOrDefault(body.positionX),
    positionY: numberOrDefault(body.positionY),
    rotation: numberOrDefault(body.rotation),
    width: numberOrDefault(body.width, 2.2),
    depth: numberOrDefault(body.depth, 0.9),
    height: numberOrDefault(body.height, body.shelfType === '2_level' ? 1.45 : 2.4),
    accessSide: String(body.accessSide || 'front'),
    metadata: body.metadata ?? {},
  };
}

function readItemLocationPayload(body = {}) {
  return {
    layoutId: body.layoutId,
    itemId: body.itemId,
    floorId: body.floorId,
    zoneId: body.zoneId,
    aisleId: body.aisleId,
    shelfId: body.shelfId,
    shelfLevelId: body.shelfLevelId,
    shelfSlotId: body.shelfSlotId,
    routeHint: body.routeHint ?? {},
  };
}

router.get('/bootstrap', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const layoutId = req.query.layoutId ? String(req.query.layoutId) : null;
    const snapshot = await getStockroomSnapshot({
      layoutId,
      allowDraft: req.user?.role === 'admin' && Boolean(layoutId),
    });
    res.json(buildBootstrapResponse(snapshot, req.user));
  } catch (error) {
    next(error);
  }
});

router.get('/search', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) {
      res.json({ results: [] });
      return;
    }

    const results = await searchLocatorItems(q);
    res.json({ results });
  } catch (error) {
    next(error);
  }
});

router.get('/items/:productId', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const currentFloor = numberOrDefault(req.query.currentFloor, 1);
    const details = await getItemRouteDetails(req.params.productId, currentFloor);

    if (!details) {
      res.status(404).json({ error: 'Item location not found.' });
      return;
    }

    res.json(details);
  } catch (error) {
    next(error);
  }
});

router.get('/layouts', requireRole('admin'), async (_req, res, next) => {
  try {
    const layouts = await listStockroomLayouts();
    res.json({ layouts });
  } catch (error) {
    next(error);
  }
});

router.post('/layouts', requireRole('admin'), async (req, res, next) => {
  try {
    const layout = await createLayoutVersion({
      name: String(req.body?.name || '').trim(),
      userId: req.user?.id ?? null,
      sourceLayoutId: req.body?.sourceLayoutId ?? null,
    });
    res.status(201).json({ layout });
  } catch (error) {
    next(error);
  }
});

router.put('/layouts/:layoutId', requireRole('admin'), async (req, res, next) => {
  try {
    const layout = await updateLayoutMetadata(req.params.layoutId, readLayoutPayload(req.body));
    res.json({ layout });
  } catch (error) {
    next(error);
  }
});

router.post('/layouts/:layoutId/publish', requireRole('admin'), async (req, res, next) => {
  try {
    const layout = await publishLayout(req.params.layoutId);
    res.json({ layout });
  } catch (error) {
    next(error);
  }
});

router.get('/master-items', requireRole('admin'), async (req, res, next) => {
  try {
    const items = await listMasterItems(String(req.query.q || '').trim(), req.query.layoutId ? String(req.query.layoutId) : null);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.put('/master-items/:productId', requireRole('admin'), async (req, res, next) => {
  try {
    const item = await updateItemMaster(req.params.productId, {
      partCode: String(req.body?.partCode || '').trim() || null,
      keywords: parseKeywordsInput(req.body?.keywords),
      isActive: req.body?.isActive !== false,
      metadata: req.body?.metadata ?? {},
    });
    res.json({ item });
  } catch (error) {
    next(error);
  }
});

router.post('/zones', requireRole('admin'), async (req, res, next) => {
  try {
    const zone = await createZone(readZonePayload(req.body));
    res.status(201).json({ zone });
  } catch (error) {
    next(error);
  }
});

router.put('/zones/:zoneId', requireRole('admin'), async (req, res, next) => {
  try {
    const zone = await updateZone(req.params.zoneId, readZonePayload(req.body));
    res.json({ zone });
  } catch (error) {
    next(error);
  }
});

router.delete('/zones/:zoneId', requireRole('admin'), async (req, res, next) => {
  try {
    await removeZone(req.params.zoneId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/aisles', requireRole('admin'), async (req, res, next) => {
  try {
    const aisle = await createAisle(readAislePayload(req.body));
    res.status(201).json({ aisle });
  } catch (error) {
    next(error);
  }
});

router.put('/aisles/:aisleId', requireRole('admin'), async (req, res, next) => {
  try {
    const aisle = await updateAisle(req.params.aisleId, readAislePayload(req.body));
    res.json({ aisle });
  } catch (error) {
    next(error);
  }
});

router.delete('/aisles/:aisleId', requireRole('admin'), async (req, res, next) => {
  try {
    await removeAisle(req.params.aisleId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/shelves', requireRole('admin'), async (req, res, next) => {
  try {
    const shelf = await createShelf(readShelfPayload(req.body));
    res.status(201).json({ shelf });
  } catch (error) {
    next(error);
  }
});

router.put('/shelves/:shelfId', requireRole('admin'), async (req, res, next) => {
  try {
    const shelf = await updateShelf(req.params.shelfId, readShelfPayload(req.body));
    res.json({ shelf });
  } catch (error) {
    next(error);
  }
});

router.delete('/shelves/:shelfId', requireRole('admin'), async (req, res, next) => {
  try {
    await removeShelf(req.params.shelfId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.put('/item-locations/:productId', requireRole('admin'), async (req, res, next) => {
  try {
    const itemLocation = await createOrUpdateItemLocation({
      ...readItemLocationPayload(req.body),
      itemId: req.params.productId,
    });
    res.json({ itemLocation });
  } catch (error) {
    next(error);
  }
});

router.delete('/item-locations/:productId', requireRole('admin'), async (req, res, next) => {
  try {
    await deleteItemLocation(String(req.query.layoutId || ''), req.params.productId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/invalidate-cache', requireRole('admin'), async (_req, res) => {
  invalidateStockroomCache();
  res.json({ ok: true });
});

export default router;
