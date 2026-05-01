import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  createPartsMappingLayout,
  deletePartsMappingLayout,
  listPartsMappingLayouts,
  setPriorityPartsMappingLayout,
  updatePartsMappingLayout,
} from '../services/partsMappingService.js';

const router = Router();

router.get('/layouts', requireRole('admin', 'stock_clerk'), async (_req, res, next) => {
  try {
    const layouts = await listPartsMappingLayouts();
    res.json({ layouts });
  } catch (error) {
    next(error);
  }
});

router.post('/layouts', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const layout = await createPartsMappingLayout({
      name: String(req.body?.name || '').trim(),
      description: String(req.body?.description || '').trim(),
      layoutData: String(req.body?.layoutData || ''),
      isDefault: Boolean(req.body?.isDefault),
    });
    res.status(201).json({ layout });
  } catch (error) {
    next(error);
  }
});

router.put('/layouts/:layoutId', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const layout = await updatePartsMappingLayout(req.params.layoutId, {
      name: req.body?.name,
      description: req.body?.description,
      layoutData: req.body?.layoutData,
    });
    res.json({ layout });
  } catch (error) {
    next(error);
  }
});

router.delete('/layouts/:layoutId', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    await deletePartsMappingLayout(req.params.layoutId);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/layouts/:layoutId/priority', requireRole('admin', 'stock_clerk'), async (req, res, next) => {
  try {
    const layout = await setPriorityPartsMappingLayout(req.params.layoutId);
    res.json({ layout });
  } catch (error) {
    next(error);
  }
});

export default router;
