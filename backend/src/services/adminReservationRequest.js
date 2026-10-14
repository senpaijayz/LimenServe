import { randomUUID } from 'node:crypto';
import { normalizePhilippinePhoneNumber } from './publicEstimateLookup.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_RESERVATION_INVALID_MESSAGE = 'Please check the customer details and selected parts, then try again.';

function text(value, maxLength) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

export function parseAdminReservationRequest(body = {}, requestKeyFactory = randomUUID) {
  if (!body || typeof body !== 'object' || (body.items !== undefined && !Array.isArray(body.items))) {
    return { ok: false, statusCode: 400, error: ADMIN_RESERVATION_INVALID_MESSAGE };
  }
  const rawItems = Array.isArray(body.items) ? body.items : [{ productId: body.productId, quantity: body.quantity }];
  const items = rawItems.map((item) => ({ productId: text(item?.productId, 64).toLowerCase(), quantity: Number(item?.quantity) }));
  const productId = items[0]?.productId;
  const requestKey = text(body.requestKey, 64) || requestKeyFactory();
  const customerName = text(body.customerName, 120);
  const customerPhone = normalizePhilippinePhoneNumber(body.customerPhone);
  const customerEmail = text(body.customerEmail, 160).toLowerCase();
  const customerNote = text(body.note, 1000);
  const paymentStatus = text(body.paymentStatus, 20).toLowerCase() || 'unpaid';
  const quantity = items[0]?.quantity;

  const invalid = (error) => ({ ok: false, statusCode: 400, error });
  if (customerName.length < 2) return invalid('Enter the customer’s name using at least 2 characters.');
  if (!customerPhone) return invalid('Enter a valid phone number, such as 0917 123 4567.');
  if (customerEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail)) return invalid('Check the email address, or leave it blank if it is not needed.');
  if (items.length < 1) return invalid('Add at least one part to this reservation.');
  if (items.length > 50) return invalid('You can reserve up to 50 different parts in one order.');
  const invalidQuantity = items.findIndex((item, index) => !['number', 'string'].includes(typeof rawItems[index]?.quantity) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999);
  if (invalidQuantity >= 0) return invalid(`Check the quantity for part ${invalidQuantity + 1}. Use a whole number from 1 to 999.`);
  if (items.some((item) => !UUID_PATTERN.test(item.productId))) return invalid('One of the selected parts could not be identified. Remove it and select it again.');
  if (new Set(items.map((item) => item.productId)).size !== items.length) return invalid('A part is selected more than once. Combine its quantities into one line.');
  if (!UUID_PATTERN.test(requestKey)) return invalid('This reservation session could not be verified. Close the form and open it again.');
  if (!['unpaid', 'partial', 'paid'].includes(paymentStatus)) return invalid('Choose a valid payment status.');

  return {
    ok: true,
    productId,
    items,
    requestKey,
    customerName,
    customerPhone,
    customerEmail: customerEmail || null,
    quantity,
    customerNote: customerNote || null,
    paymentStatus,
  };
}
