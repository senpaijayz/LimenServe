import { parsePublicEstimateCreateInput } from './publicEstimateCreate.js';
import { verifyPublicEstimateEditToken } from './publicEstimateEdit.js';
import { buildPublicEstimateLookupResult } from './publicEstimateLookup.js';
import { PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE } from './publicEstimatePricing.js';
import { estimatePricingVehicle } from './estimateVehicleContext.js';

export const PUBLIC_ESTIMATE_EDIT_SESSION_INVALID_MESSAGE = 'This quote-edit session has expired. Start a new quotation to make changes.';
export const PUBLIC_ESTIMATE_NOT_EDITABLE_MESSAGE = 'This quotation can no longer be edited.';
export const PUBLIC_ESTIMATE_REVISION_UNAVAILABLE_MESSAGE = 'The quotation changes could not be saved right now.';

function setNoStore(res) {
  if (typeof res.set === 'function') {
    res.set('Cache-Control', 'no-store');
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
}

function isEditablePublicEstimate(snapshot) {
  const estimate = snapshot?.estimate;
  return estimate?.source === 'public' && ['draft', 'sent'].includes(estimate.status);
}

export function createPublicEstimateRevisionHandler({
  loadEstimate,
  reviseEstimate,
  resolvePricing,
  editTokenSecret,
  now = () => new Date(),
} = {}) {
  if (
    typeof loadEstimate !== 'function'
    || typeof reviseEstimate !== 'function'
    || typeof resolvePricing !== 'function'
    || typeof editTokenSecret !== 'string'
  ) {
    throw new TypeError('Public estimate revision dependencies are required.');
  }

  return async function publicEstimateRevisionHandler(req, res, next) {
    try {
      setNoStore(res);

      const { editToken, ...requestBody } = req.body ?? {};
      const editSession = verifyPublicEstimateEditToken(editToken, {
        secret: editTokenSecret,
        now,
      });
      if (!editSession) {
        res.status(401).json({ error: PUBLIC_ESTIMATE_EDIT_SESSION_INVALID_MESSAGE });
        return;
      }

      const existingEstimate = await loadEstimate(editSession.estimateId);
      if (!isEditablePublicEstimate(existingEstimate)) {
        res.status(409).json({ error: PUBLIC_ESTIMATE_NOT_EDITABLE_MESSAGE });
        return;
      }

      const input = parsePublicEstimateCreateInput(requestBody, { now });
      if (!input.ok) {
        res.status(input.statusCode).json({ error: input.error });
        return;
      }
      if (input.expectedRevision === null || input.expectedRevision !== Number(existingEstimate.estimate.revision_number ?? 0)) {
        res.status(409).json({ error: 'This quotation changed or needs to be refreshed. Reload it before saving.', code: 'QUOTE_CONFLICT' });
        return;
      }

      const pricingVehicle = estimatePricingVehicle(input.payload, existingEstimate);
      const pricing = await resolvePricing({
        items: input.payload.items,
        requestedItems: requestBody.items,
        requestedEstimate: requestBody.estimate,
        vehicle: pricingVehicle,
        selections: input.selections,
        repricePackageIds: input.repricePackageIds,
        existingQuote: existingEstimate,
      });
      if (!pricing?.ok) {
        res.status(pricing?.statusCode || 400).json({ error: pricing?.error || PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE,
          ...(pricing?.code ? { code: pricing.code } : {}) });
        return;
      }

      const payload = {
        ...input.payload,
        estimate: {
          ...input.payload.estimate,
          ...pricing.totals,
          revision_note: 'Public quote updated',
        },
        items: pricing.items,
      };
      const saved = await reviseEstimate(editSession.estimateId, payload, 'Public quote updated', {
        expectedRevision: input.expectedRevision, snapshots: pricing.snapshots || [], pricingVehicle,
      });

      const publicEstimate = buildPublicEstimateLookupResult(saved.estimate);
      if (!publicEstimate) {
        throw new Error('Public estimate revision returned an invalid snapshot.');
      }

      res.json({ estimate: publicEstimate });
    } catch (error) {
      if (error.publicMessage && error.statusCode >= 400 && error.statusCode < 500) {
        res.status(error.statusCode).json({ error: error.publicMessage, code: error.code });
        return;
      }
      const safeError = new Error(PUBLIC_ESTIMATE_REVISION_UNAVAILABLE_MESSAGE);
      safeError.statusCode = 503;
      safeError.cause = error;
      next(safeError);
    }
  };
}
