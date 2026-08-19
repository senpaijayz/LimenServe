import { randomUUID } from 'node:crypto';
import { normalizePhilippinePhoneNumber } from './publicEstimateLookup.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_RESERVATION_INVALID_MESSAGE = 'Enter a customer name, valid phone, part, whole-number quantity, and request key.';

function text(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function parseAdminReservationRequest(body = {}, requestKeyFactory = randomUUID) {
  const productId = text(body.productId, 64);
  const requestKey = text(body.requestKey, 64) || requestKeyFactory();
  const customerName = text(body.customerName, 120);
  const customerPhone = normalizePhilippinePhoneNumber(body.customerPhone);
  const customerEmail = text(body.customerEmail, 160).toLowerCase();
  const customerNote = text(body.note, 1000);
  const paymentStatus = text(body.paymentStatus, 20).toLowerCase() || 'unpaid';
  const quantity = Number(body.quantity);

  if (!UUID_PATTERN.test(productId)
    || !UUID_PATTERN.test(requestKey)
    || customerName.length < 2
    || !customerPhone
    || (customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail))
    || !['unpaid', 'partial', 'paid'].includes(paymentStatus)
    || !Number.isInteger(quantity)
    || quantity < 1
    || quantity > 999) {
    return { ok: false, statusCode: 400, error: ADMIN_RESERVATION_INVALID_MESSAGE };
  }

  return {
    ok: true,
    productId,
    requestKey,
    customerName,
    customerPhone,
    customerEmail: customerEmail || null,
    quantity,
    customerNote: customerNote || null,
    paymentStatus,
  };
}
