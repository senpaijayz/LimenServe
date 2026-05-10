import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import {
  getCmsPage,
  listCmsPages,
  saveCmsNavigation,
  saveCmsPage,
  saveCmsSiteSettings,
} from '../services/cmsService.js';

const router = Router();

function requireObjectPayload(req, res) {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object.' });
    return false;
  }

  return true;
}

router.get('/pages', requireRole('admin'), async (_req, res, next) => {
  try {
    const pages = await listCmsPages();
    res.json({ pages });
  } catch (error) {
    next(error);
  }
});

router.get('/pages/:slug', requireRole('admin'), async (req, res, next) => {
  try {
    const page = await getCmsPage(req.params.slug);

    if (!page) {
      res.status(404).json({ error: 'CMS page was not found.' });
      return;
    }

    res.json({ page });
  } catch (error) {
    next(error);
  }
});

router.post('/pages', requireRole('admin'), async (req, res, next) => {
  try {
    if (!requireObjectPayload(req, res)) {
      return;
    }

    const page = await saveCmsPage(req.body, req.user?.id);
    res.status(201).json({ page });
  } catch (error) {
    next(error);
  }
});

router.put('/pages/:slug', requireRole('admin'), async (req, res, next) => {
  try {
    if (!requireObjectPayload(req, res)) {
      return;
    }

    const page = await saveCmsPage({
      ...req.body,
      slug: req.params.slug,
    }, req.user?.id);

    res.json({ page });
  } catch (error) {
    next(error);
  }
});

router.put('/site-settings', requireRole('admin'), async (req, res, next) => {
  try {
    if (!requireObjectPayload(req, res)) {
      return;
    }

    const site = await saveCmsSiteSettings(req.body, req.user?.id);
    res.json({ site });
  } catch (error) {
    next(error);
  }
});

router.put('/navigation', requireRole('admin'), async (req, res, next) => {
  try {
    if (!Array.isArray(req.body?.navigation)) {
      res.status(400).json({ error: 'Navigation payload must include a navigation array.' });
      return;
    }

    const site = await saveCmsNavigation(req.body.navigation, req.user?.id);
    res.json({ site });
  } catch (error) {
    next(error);
  }
});

export default router;
