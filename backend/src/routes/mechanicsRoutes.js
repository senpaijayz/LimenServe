import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

router.use(requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('list_mechanics');
    res.json({ mechanics: mechanics ?? [] });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const mechanicId = await callRpc('upsert_mechanic', {
      p_payload: req.body,
    });
    res.status(201).json({ mechanicId });
  } catch (error) {
    next(error);
  }
});

router.patch('/:mechanicId', async (req, res, next) => {
  try {
    const mechanicId = await callRpc('upsert_mechanic', {
      p_payload: {
        ...req.body,
        id: req.params.mechanicId,
      },
    });
    res.json({ mechanicId });
  } catch (error) {
    next(error);
  }
});

router.delete('/:mechanicId', async (req, res, next) => {
  try {
    const deleted = await callRpc('delete_mechanic', {
      p_mechanic_id: req.params.mechanicId,
    });
    res.json({ deleted: Boolean(deleted) });
  } catch (error) {
    next(error);
  }
});

export default router;
