import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();

function normalizeLimit(value) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }

  return Math.min(parsed, 50);
}

function mapNotification(row = {}) {
  return {
    id: row.id,
    category: row.category,
    type: row.type,
    title: row.title,
    message: row.message,
    targetPath: row.target_path,
    metadata: row.metadata ?? {},
    read: Boolean(row.read_at),
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}

router.use(requireRole('admin', 'cashier'));

router.get('/', async (req, res, next) => {
  try {
    const limit = normalizeLimit(req.query.limit);
    const category = String(req.query.category || '').trim();

    let query = supabaseAdmin
      .schema('catalog')
      .from('admin_notifications')
      .select('id, category, type, title, message, target_path, metadata, read_at, created_at')
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    const notifications = (data ?? []).map(mapNotification);

    res.json({
      notifications,
      unreadCount: notifications.filter((notification) => !notification.read).length,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/read-all', async (_req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .schema('catalog')
      .from('admin_notifications')
      .update({
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .is('read_at', null)
      .is('dismissed_at', null);

    if (error) {
      throw error;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.patch('/:notificationId/read', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .schema('catalog')
      .from('admin_notifications')
      .update({
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.notificationId)
      .is('dismissed_at', null)
      .select('id, category, type, title, message, target_path, metadata, read_at, created_at')
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      res.status(404).json({ error: 'Notification was not found.' });
      return;
    }

    res.json({ notification: mapNotification(data) });
  } catch (error) {
    next(error);
  }
});

router.delete('/:notificationId', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin
      .schema('catalog')
      .from('admin_notifications')
      .update({
        dismissed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.notificationId);

    if (error) {
      throw error;
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
