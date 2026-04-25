import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

function isMissingLegacyMechanicsError(error) {
  const message = String(error?.message || '');
  return message.includes('app.mechanics') && message.includes('does not exist');
}

function mechanicsMigrationError() {
  return {
    error: 'Mechanic management database functions need to be migrated from app.mechanics to operations.mechanics.',
  };
}

router.use(requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('list_mechanics');
    res.json({ mechanics: mechanics ?? [] });
  } catch (error) {
    if (isMissingLegacyMechanicsError(error)) {
      res.json({
        mechanics: [],
        warning: mechanicsMigrationError().error,
      });
      return;
    }

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
    if (isMissingLegacyMechanicsError(error)) {
      res.status(503).json(mechanicsMigrationError());
      return;
    }

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
    if (isMissingLegacyMechanicsError(error)) {
      res.status(503).json(mechanicsMigrationError());
      return;
    }

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
    if (isMissingLegacyMechanicsError(error)) {
      res.status(503).json(mechanicsMigrationError());
      return;
    }

    next(error);
  }
});

export default router;
