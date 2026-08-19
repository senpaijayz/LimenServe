import { randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_RESERVATION_INVALID_MESSAGE = 'Choose a customer, part, whole-number quantity, and request key.';

function text(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function parseAdminReservationRequest(body = {}, requestKeyFactory = randomUUID) {
  const customerId = text(body.customerId, 64);
  const productId = text(body.productId, 64);
  const requestKey = text(body.requestKey, 64) || requestKeyFactory();
  const customerNote = text(body.note, 1000);
  const quantity = Number(body.quantity);

  if (!UUID_PATTERN.test(customerId)
    || !UUID_PATTERN.test(productId)
    || !UUID_PATTERN.test(requestKey)
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > 999) {
    return { ok: false, statusCode: 400, error: ADMIN_RESERVATION_INVALID_MESSAGE };
  }

  return {
    ok: true,
    customerId,
    productId,
    requestKey,
    quantity,
    customerNote: customerNote || null,
  };
}
