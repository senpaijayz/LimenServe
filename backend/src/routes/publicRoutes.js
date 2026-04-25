import { Router } from 'express';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

function isMissingLegacyMechanicsError(error) {
  const message = String(error?.message || '');
  return message.includes('app.mechanics') && message.includes('does not exist');
}

router.get('/mechanics', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('get_public_mechanics');
    res.json({ mechanics: mechanics ?? [] });
  } catch (error) {
    if (isMissingLegacyMechanicsError(error)) {
      res.json({
        mechanics: [],
        warning: 'Mechanic public profiles need the live database function migration.',
      });
      return;
    }

    next(error);
  }
});

export default router;
