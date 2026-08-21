import { parsePublicEstimateCreateInput } from './publicEstimateCreate.js';
import { verifyPublicEstimateEditToken } from './publicEstimateEdit.js';
import { buildPublicEstimateLookupResult } from './publicEstimateLookup.js';
import { PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE } from './publicEstimatePricing.js';

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

      const pricing = await resolvePricing({
        items: input.payload.items,
        requestedItems: requestBody.items,
        requestedEstimate: requestBody.estimate,
        vehicle: input.payload.vehicle ?? null,
      });
      if (!pricing?.ok) {
        res.status(400).json({ error: PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE });
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
      await reviseEstimate(editSession.estimateId, payload, 'Public quote updated');

      const updatedEstimate = await loadEstimate(editSession.estimateId);
      const publicEstimate = buildPublicEstimateLookupResult(updatedEstimate);
      if (!publicEstimate) {
        throw new Error('Public estimate revision returned an invalid snapshot.');
      }

      res.json({ estimate: publicEstimate });
    } catch (error) {
      const safeError = new Error(PUBLIC_ESTIMATE_REVISION_UNAVAILABLE_MESSAGE);
      safeError.statusCode = 503;
      safeError.cause = error;
      next(safeError);
    }
  };
}
