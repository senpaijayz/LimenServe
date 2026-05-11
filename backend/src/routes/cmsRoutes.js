import { Router } from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { requireRole } from '../middleware/auth.js';
import { clearPublicResponseCache } from '../middleware/cache.js';
import {
  getCmsPage,
  listCmsPages,
  saveCmsNavigation,
  saveCmsPage,
  saveCmsSiteSettings,
} from '../services/cmsService.js';

const router = Router();
const CMS_ASSET_BUCKET = 'public-assets';
const CMS_ASSET_MAX_BYTES = 5 * 1024 * 1024;
const CMS_ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']);

function parseCmsAssetDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp|svg\+xml));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    const error = new Error('Upload a JPG, PNG, WEBP, or SVG image.');
    error.statusCode = 400;
    throw error;
  }

  const mimeType = match[1].toLowerCase();
  if (!CMS_ALLOWED_IMAGE_TYPES.has(mimeType)) {
    const error = new Error('Unsupported image type.');
    error.statusCode = 400;
    throw error;
  }

  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > CMS_ASSET_MAX_BYTES) {
    const error = new Error('Image must be 5MB or smaller.');
    error.statusCode = 400;
    throw error;
  }

  return { mimeType, buffer };
}

function getAssetExtension(mimeType, fallbackName = '') {
  const extension = String(fallbackName || '').split('.').pop()?.toLowerCase();
  if (['jpg', 'jpeg', 'png', 'webp', 'svg'].includes(extension)) {
    return extension === 'jpeg' ? 'jpg' : extension;
  }
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/svg+xml') return 'svg';
  return 'jpg';
}

function normalizeStorageFolder(value) {
  return String(value || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    || 'general';
}

function normalizeFileName(value) {
  return String(value || 'cms-image')
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'cms-image';
}

async function ensureCmsAssetBucket() {
  const createResult = await supabaseAdmin.storage.createBucket(CMS_ASSET_BUCKET, {
    public: true,
    fileSizeLimit: CMS_ASSET_MAX_BYTES,
    allowedMimeTypes: [...CMS_ALLOWED_IMAGE_TYPES],
  });

  const createMessage = String(createResult.error?.message || '').toLowerCase();
  const bucketAlreadyExists = createResult.error?.status === 409
    || createMessage.includes('already exists')
    || createMessage.includes('resource already exists')
    || createMessage.includes('duplicate');

  if (createResult.error && !bucketAlreadyExists) {
    throw createResult.error;
  }

  try {
    await supabaseAdmin.storage.updateBucket(CMS_ASSET_BUCKET, {
      public: true,
      fileSizeLimit: CMS_ASSET_MAX_BYTES,
      allowedMimeTypes: [...CMS_ALLOWED_IMAGE_TYPES],
    });
  } catch (error) {
    console.warn('Unable to update CMS asset bucket settings:', error?.message || error);
  }
}

async function uploadCmsAsset({ dataUrl, fileName, folder }) {
  const parsed = parseCmsAssetDataUrl(dataUrl);
  const safeFolder = normalizeStorageFolder(folder);
  const safeFileName = normalizeFileName(fileName);
  const extension = getAssetExtension(parsed.mimeType, fileName);
  const path = `cms/${safeFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName}.${extension}`;

  await ensureCmsAssetBucket();

  let { error } = await supabaseAdmin.storage
    .from(CMS_ASSET_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: false,
      cacheControl: '31536000',
    });

  if (error && String(error.message || '').toLowerCase().includes('bucket')) {
    await ensureCmsAssetBucket();
    ({ error } = await supabaseAdmin.storage
      .from(CMS_ASSET_BUCKET)
      .upload(path, parsed.buffer, {
        contentType: parsed.mimeType,
        upsert: false,
        cacheControl: '31536000',
      }));
  }

  if (error) {
    throw error;
  }

  const { data } = supabaseAdmin.storage.from(CMS_ASSET_BUCKET).getPublicUrl(path);

  return {
    bucket: CMS_ASSET_BUCKET,
    path,
    publicUrl: data.publicUrl,
    mimeType: parsed.mimeType,
    fileSize: parsed.buffer.length,
  };
}

function requireObjectPayload(req, res) {
  if (!req.body || Array.isArray(req.body) || typeof req.body !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object.' });
    return false;
  }

  return true;
}

router.post('/media', requireRole('admin'), async (req, res, next) => {
  try {
    if (!requireObjectPayload(req, res)) {
      return;
    }

    const asset = await uploadCmsAsset({
      dataUrl: req.body.dataUrl,
      fileName: req.body.fileName,
      folder: req.body.folder,
    });

    res.status(201).json({ asset });
  } catch (error) {
    next(error);
  }
});

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
    clearPublicResponseCache();
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

    clearPublicResponseCache();
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
    clearPublicResponseCache();
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
    clearPublicResponseCache();
    res.json({ site });
  } catch (error) {
    next(error);
  }
});

export default router;
