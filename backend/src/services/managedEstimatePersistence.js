import { callRpc } from './supabaseRpc.js';
import { packageError } from './managedPackageDomain.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function approvedPayload(payload, snapshots, pricingVehicle = payload?.vehicle) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !Array.isArray(payload.items) || !payload.items.length || payload.items.length > 100
    || !Array.isArray(snapshots) || snapshots.length > 12) throw packageError('The approved quotation is incomplete.');
  // Do not forward private/internal top-level fields from any HTTP body. The
  // package snapshots are a separate argument produced by the pricing resolver.
  return {
    ...(payload.customer ? { customer: payload.customer } : {}),
    ...(Object.hasOwn(payload, 'vehicle') ? { vehicle: payload.vehicle } : {}),
    estimate: payload.estimate,
    items: payload.items,
    ...(pricingVehicle !== undefined ? { _pricing_vehicle_context: pricingVehicle } : {}),
  };
}

async function persist(name, args) {
  try {
    const saved = await callRpc(name, args);
    if (!saved || typeof saved !== 'object' || !UUID.test(saved.estimateId || '') || !UUID.test(saved.revisionId || '')
      || saved.estimate?.estimate?.id !== saved.estimateId || !Array.isArray(saved.estimate.items)
      || !Number.isSafeInteger(saved.estimate.estimate.revision_number)) {
      throw packageError('The save confirmation could not be read. Check your saved quotations before submitting again.', 503, 'QUOTE_CONFIRMATION_UNAVAILABLE');
    }
    return saved;
  }
  catch (error) {
    if (error.code === '40001') throw packageError(error.message || 'This quotation changed. Reload and review it before saving.', 409, 'QUOTE_CONFLICT');
    if (error.code === '22023' || error.code === '23514') throw packageError(error.message || 'Review the quotation before saving.');
    if (error.code === '42501') throw packageError('You no longer have permission to save this quotation.', 403, 'QUOTE_FORBIDDEN');
    throw error;
  }
}

export async function createManagedEstimate({ payload, snapshots = [], actorId = null }) {
  if (actorId !== null && !UUID.test(actorId)) throw packageError('Choose a valid quotation editor.');
  return persist('create_estimate_packages', {
    p_payload: approvedPayload(payload, snapshots), p_snapshots: snapshots, p_editor_id: actorId,
  });
}

export async function reviseManagedEstimate({ estimateId, expectedRevision, payload, snapshots = [], actorId = null, changeNote = 'Quote updated', pricingVehicle }) {
  if (typeof estimateId !== 'string' || !UUID.test(estimateId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw packageError('Reload this quotation before saving changes.');
  }
  if (actorId !== null && !UUID.test(actorId)) throw packageError('Choose a valid quotation editor.');
  if (typeof changeNote !== 'string' || changeNote.length > 200) throw packageError('Keep the quotation change note within 200 characters.');
  return persist('revise_estimate_packages', {
    p_estimate_id: estimateId, p_expected_revision: expectedRevision,
    p_payload: approvedPayload(payload, snapshots, pricingVehicle), p_snapshots: snapshots,
    p_editor_id: actorId, p_change_note: changeNote,
  });
}
