const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REASONS = new Set(['wrong_part', 'wrong_fitment', 'ordered_by_mistake', 'defective', 'excess', 'changed_mind', 'other']);
const CONDITIONS = new Set(['resalable', 'opened_resalable', 'inspection', 'installed', 'damaged']);
const REFUND_METHODS = new Set(['cash', 'check', 'store_credit', 'account_credit']);

function invalid(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function validatePosReturnPayload(body = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw invalid('Review the return details.');
  }
  if (typeof body.requestId !== 'string' || !UUID.test(body.requestId)) {
    throw invalid('A saved return reference is required.');
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    throw invalid('Select between 1 and 100 receipt items to return.');
  }

  const seenItems = new Set();
  const items = body.items.map((item) => {
    if (!item || typeof item !== 'object' || typeof item.saleItemId !== 'string' || !UUID.test(item.saleItemId)) {
      throw invalid('One selected receipt item is invalid. Reload the receipt and try again.');
    }
    if (seenItems.has(item.saleItemId)) throw invalid('A receipt item can only appear once in a return.');
    seenItems.add(item.saleItemId);

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999999
      || Math.abs(quantity * 100 - Math.round(quantity * 100)) > 1e-8) {
      throw invalid('Enter a valid return quantity with no more than two decimal places.');
    }
    if (!CONDITIONS.has(item.condition)) throw invalid('Choose whether each returned part can be resold.');
    return { saleItemId: item.saleItemId, quantity, condition: item.condition };
  });

  const reason = body.reason;
  const reasonNote = typeof body.reasonNote === 'string' ? body.reasonNote.trim() : '';
  const refundMethod = body.refundMethod;
  const refundReference = typeof body.refundReference === 'string' ? body.refundReference.trim() : '';
  if (!REASONS.has(reason) || reasonNote.length > 500) throw invalid('Choose a return reason and keep the note within 500 characters.');
  if (reason === 'other' && !reasonNote) throw invalid('Add a short note when the return reason is Other.');
  if (reason === 'defective' && items.some((item) => item.condition === 'resalable' || item.condition === 'opened_resalable')) {
    throw invalid('A defective part must be held for inspection or marked damaged; do not return it directly to saleable stock.');
  }
  if (!REFUND_METHODS.has(refundMethod) || refundReference.length > 120) throw invalid('Choose a settlement method and keep its reference within 120 characters.');
  if (refundMethod === 'check' && !refundReference) throw invalid('Enter the check number before recording a check refund.');
  if (body.refundConfirmed !== true) {
    throw invalid(refundMethod === 'account_credit'
      ? 'Confirm the returned parts were received and the unpaid balance should be reduced.'
      : 'Confirm the refund or store credit was actually issued before saving the return.');
  }

  return {
    requestId: body.requestId,
    payload: { items, reason, reasonNote, refundMethod, refundReference, refundConfirmed: true },
  };
}
