import { normalizePhilippinePhoneNumber } from './publicEstimateLookup.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const PUBLIC_RESERVATION_INVALID_MESSAGE = 'Enter a valid part, quantity, name, and phone number.';

function text(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim().slice(0, maxLength);
}

export function parsePublicReservationRequest(body = {}) {
  const productId = text(body.productId, 64);
  const requestKey = text(body.requestKey, 64);
  const customerName = text(body.customerName, 120);
  const customerPhone = normalizePhilippinePhoneNumber(body.customerPhone);
  const customerEmail = text(body.customerEmail, 160).toLowerCase();
  const customerNote = text(body.note, 1000);
  const quantity = Number(body.quantity);

  if (!UUID_PATTERN.test(productId)
    || !UUID_PATTERN.test(requestKey)
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > 999
    || customerName.length < 2
    || !customerPhone
    || (customerEmail && !EMAIL_PATTERN.test(customerEmail))) {
    return {
      ok: false,
      statusCode: 400,
      error: PUBLIC_RESERVATION_INVALID_MESSAGE,
    };
  }

  return {
    ok: true,
    productId,
    requestKey,
    quantity,
    customerName,
    customerPhone,
    customerEmail: customerEmail || null,
    customerNote: customerNote || null,
  };
}
