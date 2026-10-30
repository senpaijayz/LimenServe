import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { clearPublicResponseCache } from '../middleware/cache.js';
import {
  createManagedPackageService,
  duplicateManagedPackage,
  deleteArchivedManagedPackage,
  getManagedPackage,
  getManagedPackageHistory,
  listManagedPackages,
  previewManagedPackage,
  publishManagedPackage,
  saveManagedPackage,
  searchManagedPackageProducts,
  searchManagedPackageServices,
  searchManagedPackageVehicles,
  transitionManagedPackage,
} from '../services/managedPackageService.js';
import { packageError } from '../services/managedPackageDomain.js';
import { initializeManagedPackageCandidates, previewManagedPackageInitialization } from '../services/managedPackageInitialization.js';
import { readSavedPackagePreview } from '../services/managedPackagePreviewService.js';
import { packageDraftReviews } from '../services/packageDraftReviewService.js';

const router = Router();
router.use(requireRole('admin'));

function objectBody(req) {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) throw packageError('Enter valid package details.');
  return req.body;
}
function expectedRevision(req) {
  const revision = objectBody(req).expectedRevision;
  if (!Number.isSafeInteger(revision) || revision < 0) throw packageError('Reload this package before making changes.');
  return revision;
}
const handle = (action) => async (req, res, next) => {
  try { await action(req, res); } catch (error) { next(error); }
};
const invalidatePackages = () => clearPublicResponseCache(['managed-packages', 'recommendations']);

router.get('/', handle(async (req, res) => res.json(await listManagedPackages(req.query))));
router.get('/review-drafts', handle(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await packageDraftReviews.list(req.query));
}));
router.get('/review-drafts/:id', handle(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({package:await packageDraftReviews.detail(req.params.id)});
}));
router.get('/products', handle(async (req, res) => res.json(await searchManagedPackageProducts(req.query))));
router.get('/services', handle(async (req, res) => res.json(await searchManagedPackageServices(req.query))));
router.post('/services', handle(async (req, res) => {
  const service = await createManagedPackageService(objectBody(req), req.user.id);
  clearPublicResponseCache(['managed-packages', 'recommendations', 'catalog-services']);
  res.status(201).json({ service });
}));
router.get('/vehicles', handle(async (req, res) => res.json(await searchManagedPackageVehicles(req.query))));
router.get('/initialization', handle(async (_req, res) => res.json(await previewManagedPackageInitialization())));
router.post('/initialization', handle(async (req, res) => {
  res.json(await initializeManagedPackageCandidates(objectBody(req), req.user.id));
}));
router.post('/preview', handle(async (req, res) => res.json(await previewManagedPackage(objectBody(req)))));
router.post('/', handle(async (req, res) => {
  const saved = await saveManagedPackage(objectBody(req), req.user.id);
  // Saving a working draft intentionally does not invalidate the published
  // package, which remains unchanged until an explicit successful publication.
  res.status(201).json({ package: saved });
}));
router.get('/:id/saved-preview', handle(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await readSavedPackagePreview(req.params.id, req.query));
}));
router.get('/:id', handle(async (req, res) => res.json({ package: await getManagedPackage(req.params.id) })));
router.get('/:id/history', handle(async (req, res) => res.json(await getManagedPackageHistory(req.params.id, req.query))));
router.post('/:id/publish', handle(async (req, res) => {
  const result = await publishManagedPackage(req.params.id, expectedRevision(req), req.user.id);
  invalidatePackages();
  res.json(result);
}));
router.post('/:id/duplicate', handle(async (req, res) => {
  const saved = await duplicateManagedPackage(req.params.id, req.user.id);
  res.status(201).json({ package: saved });
}));
router.delete('/:id', handle(async (req, res) => {
  const result = await deleteArchivedManagedPackage(req.params.id, expectedRevision(req), req.user.id, objectBody(req).confirmation);
  invalidatePackages();
  res.json(result);
}));
for (const action of ['unpublish', 'archive', 'restore']) {
  router.post(`/:id/${action}`, handle(async (req, res) => {
    const result = await transitionManagedPackage(req.params.id, expectedRevision(req), req.user.id, action);
    invalidatePackages();
    res.json(result);
  }));
}

export default router;
