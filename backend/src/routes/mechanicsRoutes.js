import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { callRpc } from '../services/supabaseRpc.js';
import { supabaseAdmin } from '../config/supabase.js';

const router = Router();
const PHOTO_BUCKET = 'mechanic-photos';

function isMissingLegacyMechanicsError(error) {
  const message = String(error?.message || '');
  return (message.includes('app.mechanics')
    || message.includes('app.get_mechanics_internal')
    || message.includes('app.upsert_mechanic_internal')
    || message.includes('app.delete_mechanic_internal')
    || message.includes('schema "app"'))
    && message.includes('does not exist');
}

function mechanicsMigrationError() {
  return {
    error: 'Mechanic management database functions need to be migrated from app.mechanics to operations.mechanics.',
  };
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

function normalizeMechanicPayload(payload = {}) {
  const contactNumber = payload.contact_number ?? payload.contactNumber ?? '';
  const profilePayload = JSON.stringify({
    contact_number: contactNumber,
    shift_type: payload.shift_type ?? payload.schedule_type ?? null,
    available_date: payload.available_date ?? payload.availableDate ?? null,
  });

  return {
    ...payload,
    contact_number: contactNumber,
    contactNumber,
    locationName: profilePayload,
    location_name: profilePayload,
    metadata: {
      ...(payload.metadata ?? {}),
      contact_number: contactNumber,
      shift_type: payload.shift_type ?? payload.schedule_type ?? null,
      available_date: payload.available_date ?? payload.availableDate ?? null,
    },
  };
}

function parsePhotoDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }

  const mimeType = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (buffer.length > 2 * 1024 * 1024) {
    const error = new Error('Mechanic photo must be 2MB or smaller.');
    error.statusCode = 400;
    throw error;
  }

  return { mimeType, buffer };
}

function getPhotoExtension(mimeType) {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function isMissingBucketError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.statusCode === '404'
    || error?.status === 404
    || message.includes('bucket not found')
    || message.includes('not found');
}

async function ensureMechanicPhotoBucket() {
  const { error } = await supabaseAdmin.storage.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: 2 * 1024 * 1024,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
  });

  if (error && !String(error.message || '').toLowerCase().includes('already exists')) {
    throw error;
  }
}

async function uploadMechanicPhotoObject(path, parsed) {
  return supabaseAdmin.storage
    .from(PHOTO_BUCKET)
    .upload(path, parsed.buffer, {
      contentType: parsed.mimeType,
      upsert: true,
    });
}

async function uploadMechanicPhoto(payload = {}) {
  const parsed = parsePhotoDataUrl(payload.photoDataUrl || payload.photo_data_url);
  if (!parsed) {
    return payload;
  }

  const extension = getPhotoExtension(parsed.mimeType);
  const mechanicId = payload.id || 'new';
  const path = `${mechanicId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  let { error } = await uploadMechanicPhotoObject(path, parsed);

  if (error && isMissingBucketError(error)) {
    try {
      await ensureMechanicPhotoBucket();
      ({ error } = await uploadMechanicPhotoObject(path, parsed));
    } catch (bucketError) {
      error = bucketError;
    }
  }

  if (error) {
    console.warn('Supabase Storage photo upload failed; storing mechanic photo as data URL fallback:', error.message);
    return {
      ...payload,
      photoUrl: payload.photoDataUrl || payload.photo_data_url,
      photo_url: payload.photoDataUrl || payload.photo_data_url,
      photoDataUrl: undefined,
      photo_data_url: undefined,
    };
  }

  const { data } = supabaseAdmin.storage.from(PHOTO_BUCKET).getPublicUrl(path);
  return {
    ...payload,
    photoUrl: data.publicUrl,
    photo_url: data.publicUrl,
    photoDataUrl: undefined,
    photo_data_url: undefined,
  };
}

router.use(requireRole('admin'));

router.get('/', async (_req, res, next) => {
  try {
    const mechanics = await callRpc('list_mechanics');
    res.json({ mechanics: (mechanics ?? []).map(normalizeMechanic) });
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
    const payload = await uploadMechanicPhoto(normalizeMechanicPayload(req.body ?? {}));
    const mechanicId = await callRpc('upsert_mechanic', {
      p_payload: payload,
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
    const payload = await uploadMechanicPhoto(normalizeMechanicPayload({
      ...req.body,
      id: req.params.mechanicId,
    }));
    const mechanicId = await callRpc('upsert_mechanic', {
      p_payload: payload,
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
