import { Router } from 'express';
import { getPublishedManagedPackage, listPublishedManagedPackages, listPackageVehicleConfigurations } from '../services/publishedManagedPackages.js';

const router = Router();
router.get('/package-vehicle-configurations', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ configurations: await listPackageVehicleConfigurations(req.query) });
  } catch (error) { next(error); }
});
router.get('/packages', async (req, res, next) => {
  try {
    // Publishing/unpublishing is immediately visible on the next request. Do not
    // serve an archived offer from an independent CDN/browser response cache.
    res.set('Cache-Control', 'no-store');
    res.json(await listPublishedManagedPackages(req.query));
  } catch (error) { next(error); }
});
router.get('/packages/:packageId', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json({ package: await getPublishedManagedPackage(req.params.packageId, req.query) });
  } catch (error) { next(error); }
});
export default router;
