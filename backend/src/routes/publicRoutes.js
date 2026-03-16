import { Router } from 'express';
import { callRpc } from '../services/supabaseRpc.js';

const router = Router();

router.get('/mechanics', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('get_public_mechanics');
    res.json({ mechanics: mechanics ?? [] });
  } catch (error) {
    next(error);
  }
});

export default router;
