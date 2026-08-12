import { createHash } from 'node:crypto';

import { getDefaultRateLimitKey } from '../middleware/rateLimit.js';
import {
  buildPublicEstimateLookupResult,
  normalizePhilippinePhoneNumber,
} from './publicEstimateLookup.js';
import { PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE } from './publicEstimatePricing.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/;
const PUBLIC_QUOTE_VALID_DAYS = 30;
const PUBLIC_QUOTE_TAX_RATE = 0.12;
const MAX_PUBLIC_QUOTE_ITEMS = 100;
const MAX_ITEM_QUANTITY = 1_000;
const MAX_MONEY_AMOUNT = 100_000_000;
const MONEY_TOLERANCE = 0.01;

const TOP_LEVEL_KEYS = new Set(['customer', 'vehicle', 'estimate', 'items']);
const CUSTOMER_KEYS = new Set(['customer_type', 'name', 'phone', 'metadata']);
const CUSTOMER_METADATA_KEYS = new Set(['source']);
const VEHICLE_KEYS = new Set(['make', 'model_name', 'year', 'plate_no', 'metadata']);
const VEHICLE_METADATA_KEYS = new Set(['displayLabel', 'source']);
const ESTIMATE_KEYS = new Set([
  'status',
  'source',
  'note',
  'subtotal',
  'discount_total',
  'tax_total',
  'grand_total',
  'issued_at',
  'valid_until',
  'revision_note',
]);
const ITEM_KEYS = new Set([
  'line_type',
  'product_id',
  'product_name',
  'product_sku',
  'service_id',
  'service_name',
  'quantity',
  'unit_price',
  'line_total',
  'recommendation_rule_id',
  'is_upsell',
  'bundle_key',
  'bundle_name',
  'bundle_tier_label',
  'catalog_unit_price',
]);

export const PUBLIC_ESTIMATE_CREATE_INVALID_MESSAGE = 'Enter valid customer and quotation details.';
export const PUBLIC_ESTIMATE_CREATE_UNAVAILABLE_MESSAGE = 'The quotation could not be created right now.';

class PublicEstimateCreateValidationError extends Error {}

function invalid(reason) {
  throw new PublicEstimateCreateValidationError(reason);
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireRecord(value, fieldName) {
  if (!isPlainRecord(value)) {
    invalid(`${fieldName} must be an object.`);
  }

  return value;
}

function rejectUnknownKeys(value, allowedKeys, fieldName) {
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) {
    invalid(`${fieldName}.${unknownKey} is not allowed.`);
  }
}

function boundedText(value, {
  fieldName,
  maxLength,
  required = false,
  nullable = false,
} = {}) {
  if (value === undefined || value === null) {
    if (required) {
      invalid(`${fieldName} is required.`);
    }

    return nullable ? null : '';
  }

  if (typeof value !== 'string') {
    invalid(`${fieldName} must be text.`);
  }

  const normalized = value.trim();
  if (required && !normalized) {
    invalid(`${fieldName} is required.`);
  }

  if (normalized.length > maxLength || CONTROL_CHARACTER_PATTERN.test(normalized)) {
    invalid(`${fieldName} is invalid.`);
  }

  return normalized || (nullable ? null : '');
}

function optionalUuid(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    invalid(`${fieldName} must be a UUID.`);
  }

  return value.toLowerCase();
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function boundedNumber(value, {
  fieldName,
  min = 0,
  max = MAX_MONEY_AMOUNT,
  required = true,
  integer = false,
  money = false,
} = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) {
      invalid(`${fieldName} is required.`);
    }

    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    invalid(`${fieldName} is outside the allowed range.`);
  }

  if (integer && !Number.isSafeInteger(value)) {
    invalid(`${fieldName} must be a whole number.`);
  }

  if (money && Math.abs(roundMoney(value) - value) > Number.EPSILON * 100) {
    invalid(`${fieldName} must use at most two decimal places.`);
  }

  return money ? roundMoney(value) : value;
}

function normalizeYear(value, fieldName, currentYear) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = typeof value === 'string' && /^\d{4}$/.test(value.trim())
    ? Number(value.trim())
    : value;

  return boundedNumber(numericValue, {
    fieldName,
    min: 1900,
    max: currentYear + 2,
    integer: true,
  });
}

function assertBooleanIfPresent(value, fieldName) {
  if (value !== undefined && typeof value !== 'boolean') {
    invalid(`${fieldName} must be a boolean.`);
  }

  return value === true;
}

function assertIgnoredTextIfPresent(value, fieldName, maxLength) {
  if (value !== undefined && value !== null) {
    boundedText(value, { fieldName, maxLength });
  }
}

function assertMoneyMatches(actual, expected, fieldName) {
  const normalized = boundedNumber(actual, { fieldName, money: true });
  if (Math.abs(normalized - expected) > MONEY_TOLERANCE) {
    invalid(`${fieldName} does not match the quotation items.`);
  }
}

function normalizeCustomer(customer) {
  const value = requireRecord(customer, 'customer');
  rejectUnknownKeys(value, CUSTOMER_KEYS, 'customer');

  assertIgnoredTextIfPresent(value.customer_type, 'customer.customer_type', 32);

  const name = boundedText(value.name, {
    fieldName: 'customer.name',
    maxLength: 120,
  }) || 'Walk-in Customer';
  const phone = normalizePhilippinePhoneNumber(value.phone);
  if (!phone) {
    invalid('customer.phone must be a Philippine phone number.');
  }

  if (value.metadata !== undefined) {
    const metadata = requireRecord(value.metadata, 'customer.metadata');
    rejectUnknownKeys(metadata, CUSTOMER_METADATA_KEYS, 'customer.metadata');
    assertIgnoredTextIfPresent(metadata.source, 'customer.metadata.source', 64);
  }

  return {
    customer_type: 'walk_in',
    name,
    phone,
    metadata: {
      source: 'public_estimate_page',
    },
  };
}

function normalizeVehicle(vehicle, currentYear) {
  if (vehicle === undefined) {
    return null;
  }

  const value = requireRecord(vehicle, 'vehicle');
  rejectUnknownKeys(value, VEHICLE_KEYS, 'vehicle');

  assertIgnoredTextIfPresent(value.make, 'vehicle.make', 80);
  // Public submissions must never select or mutate an existing vehicle by plate.
  // The current database function updates a matching plate, so this value is
  // intentionally validated for shape but omitted from the privileged payload.
  assertIgnoredTextIfPresent(value.plate_no, 'vehicle.plate_no', 32);

  const modelName = boundedText(value.model_name, {
    fieldName: 'vehicle.model_name',
    maxLength: 120,
    required: true,
  });
  const year = normalizeYear(value.year, 'vehicle.year', currentYear);
  let displayLabel = null;

  if (value.metadata !== undefined) {
    const metadata = requireRecord(value.metadata, 'vehicle.metadata');
    rejectUnknownKeys(metadata, VEHICLE_METADATA_KEYS, 'vehicle.metadata');
    displayLabel = boundedText(metadata.displayLabel, {
      fieldName: 'vehicle.metadata.displayLabel',
      maxLength: 180,
      nullable: true,
    });
    assertIgnoredTextIfPresent(metadata.source, 'vehicle.metadata.source', 64);
  }

  return {
    make: 'Mitsubishi',
    model_name: modelName,
    year,
    metadata: {
      ...(displayLabel ? { displayLabel } : {}),
      source: 'public_estimate_page',
    },
  };
}

function validateIgnoredItemLabels(item, index) {
  for (const [key, maxLength] of [
    ['product_name', 200],
    ['product_sku', 100],
    ['service_name', 200],
    ['bundle_key', 100],
    ['bundle_name', 200],
    ['bundle_tier_label', 100],
  ]) {
    if (item[key] !== undefined && item[key] !== null) {
      boundedText(item[key], {
        fieldName: `items[${index}].${key}`,
        maxLength,
      });
    }
  }

  if (item.catalog_unit_price !== undefined && item.catalog_unit_price !== null) {
    boundedNumber(item.catalog_unit_price, {
      fieldName: `items[${index}].catalog_unit_price`,
      money: true,
    });
  }
}

function normalizeItem(item, index) {
  const value = requireRecord(item, `items[${index}]`);
  rejectUnknownKeys(value, ITEM_KEYS, `items[${index}]`);
  validateIgnoredItemLabels(value, index);

  if (value.line_type !== 'product' && value.line_type !== 'service') {
    invalid(`items[${index}].line_type is invalid.`);
  }

  const quantity = boundedNumber(value.quantity, {
    fieldName: `items[${index}].quantity`,
    min: 1,
    max: MAX_ITEM_QUANTITY,
    integer: true,
  });
  const unitPrice = boundedNumber(value.unit_price, {
    fieldName: `items[${index}].unit_price`,
    money: true,
  });
  const expectedLineTotal = roundMoney(quantity * unitPrice);
  assertMoneyMatches(value.line_total, expectedLineTotal, `items[${index}].line_total`);

  const productId = optionalUuid(value.product_id, `items[${index}].product_id`);
  const serviceId = optionalUuid(value.service_id, `items[${index}].service_id`);
  if (value.line_type === 'product' && (!productId || serviceId)) {
    invalid(`items[${index}] must identify exactly one product.`);
  }

  if (value.line_type === 'service' && (!serviceId || productId)) {
    invalid(`items[${index}] must identify exactly one service.`);
  }

  const recommendationRuleId = optionalUuid(
    value.recommendation_rule_id,
    `items[${index}].recommendation_rule_id`,
  );
  const isUpsell = assertBooleanIfPresent(value.is_upsell, `items[${index}].is_upsell`);

  return {
    line_type: value.line_type,
    ...(productId ? { product_id: productId } : {}),
    ...(serviceId ? { service_id: serviceId } : {}),
    quantity,
    unit_price: unitPrice,
    line_total: expectedLineTotal,
    recommendation_rule_id: recommendationRuleId,
    is_upsell: isUpsell,
  };
}

function normalizeEstimate(estimate, items, nowDate) {
  const value = requireRecord(estimate, 'estimate');
  rejectUnknownKeys(value, ESTIMATE_KEYS, 'estimate');

  assertIgnoredTextIfPresent(value.status, 'estimate.status', 32);
  assertIgnoredTextIfPresent(value.source, 'estimate.source', 32);
  assertIgnoredTextIfPresent(value.issued_at, 'estimate.issued_at', 64);
  assertIgnoredTextIfPresent(value.valid_until, 'estimate.valid_until', 32);
  assertIgnoredTextIfPresent(value.revision_note, 'estimate.revision_note', 200);

  const note = boundedText(value.note, {
    fieldName: 'estimate.note',
    maxLength: 1_000,
    nullable: true,
  }) || 'Public estimate generated from LimenServe quote builder.';
  const discountTotal = boundedNumber(value.discount_total, {
    fieldName: 'estimate.discount_total',
    money: true,
  });
  const itemSubtotal = roundMoney(items.reduce((sum, item) => sum + item.line_total, 0));
  const subtotal = roundMoney(itemSubtotal + discountTotal);
  const taxTotal = roundMoney(itemSubtotal * PUBLIC_QUOTE_TAX_RATE);
  const grandTotal = roundMoney(itemSubtotal + taxTotal);

  assertMoneyMatches(value.subtotal, subtotal, 'estimate.subtotal');
  assertMoneyMatches(value.tax_total, taxTotal, 'estimate.tax_total');
  assertMoneyMatches(value.grand_total, grandTotal, 'estimate.grand_total');

  const validUntil = new Date(nowDate.getTime());
  validUntil.setUTCDate(validUntil.getUTCDate() + PUBLIC_QUOTE_VALID_DAYS);

  return {
    status: 'sent',
    source: 'public',
    note,
    subtotal,
    discount_total: discountTotal,
    tax_total: taxTotal,
    grand_total: grandTotal,
    issued_at: nowDate.toISOString(),
    valid_until: validUntil.toISOString().slice(0, 10),
    revision_note: 'Public quote created',
  };
}

function resolveNow(now) {
  const value = typeof now === 'function' ? now() : now;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Public estimate creation clock returned an invalid date.');
  }

  return date;
}

export function parsePublicEstimateCreateInput(body, { now = () => new Date() } = {}) {
  try {
    const value = requireRecord(body, 'request');
    rejectUnknownKeys(value, TOP_LEVEL_KEYS, 'request');

    const customer = normalizeCustomer(value.customer);
    const nowDate = resolveNow(now);
    const vehicle = normalizeVehicle(value.vehicle, nowDate.getUTCFullYear());

    if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_PUBLIC_QUOTE_ITEMS) {
      invalid(`items must contain between 1 and ${MAX_PUBLIC_QUOTE_ITEMS} entries.`);
    }

    const items = value.items.map(normalizeItem);
    const estimate = normalizeEstimate(value.estimate, items, nowDate);

    return {
      ok: true,
      payload: {
        customer,
        ...(vehicle ? { vehicle } : {}),
        estimate,
        items,
      },
    };
  } catch (error) {
    if (!(error instanceof PublicEstimateCreateValidationError)) {
      throw error;
    }

    return {
      ok: false,
      statusCode: 400,
      error: PUBLIC_ESTIMATE_CREATE_INVALID_MESSAGE,
      reason: error.message,
    };
  }
}

function setNoStore(res) {
  if (typeof res.set === 'function') {
    res.set('Cache-Control', 'no-store');
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
}

export function isTrustedEstimateCreator(user) {
  return user?.role === 'admin';
}

export function applyToPublicEstimateCreators(middleware) {
  if (typeof middleware !== 'function') {
    throw new TypeError('Public estimate middleware must be a function.');
  }

  return function publicEstimateOnlyMiddleware(req, res, next) {
    if (isTrustedEstimateCreator(req.user)) {
      next();
      return;
    }

    return middleware(req, res, next);
  };
}

export function getPublicEstimatePhoneRateLimitKey(req) {
  const phone = normalizePhilippinePhoneNumber(req.body?.customer?.phone);
  if (!phone) {
    return `invalid:${getDefaultRateLimitKey(req)}`;
  }

  const digest = createHash('sha256').update(phone).digest('hex');
  return `phone:${digest}`;
}

export function createPublicEstimateCreateHandler({
  createEstimate,
  loadEstimate,
  resolvePricing,
  notify = () => undefined,
  onNotificationError = () => undefined,
  now = () => new Date(),
} = {}) {
  if (
    typeof createEstimate !== 'function'
    || typeof loadEstimate !== 'function'
    || typeof resolvePricing !== 'function'
  ) {
    throw new TypeError('Public estimate persistence dependencies are required.');
  }

  if (typeof notify !== 'function' || typeof onNotificationError !== 'function') {
    throw new TypeError('Public estimate notification dependencies must be functions.');
  }

  return async function publicEstimateCreateHandler(req, res, next) {
    try {
      setNoStore(res);

      const input = parsePublicEstimateCreateInput(req.body, { now });
      if (!input.ok) {
        res.status(input.statusCode).json({ error: input.error });
        return;
      }

      const pricing = await resolvePricing({
        items: input.payload.items,
        requestedItems: req.body.items,
        requestedEstimate: req.body.estimate,
        vehicle: input.payload.vehicle ?? null,
      });
      if (!pricing?.ok) {
        res.status(400).json({
          error: PUBLIC_ESTIMATE_PRICING_INVALID_MESSAGE,
        });
        return;
      }

      const persistedPayload = {
        ...input.payload,
        estimate: {
          ...input.payload.estimate,
          ...pricing.totals,
        },
        items: pricing.items,
      };
      const estimateId = await createEstimate(persistedPayload);
      const estimate = await loadEstimate(estimateId);
      const publicEstimate = buildPublicEstimateLookupResult(estimate);

      if (!publicEstimate) {
        throw new Error('Public estimate persistence returned an invalid snapshot.');
      }

      Promise.resolve(notify(estimate)).catch(onNotificationError);
      res.status(201).json({ estimate: publicEstimate });
    } catch (error) {
      const safeError = new Error(PUBLIC_ESTIMATE_CREATE_UNAVAILABLE_MESSAGE);
      safeError.statusCode = 503;
      safeError.cause = error;
      next(safeError);
    }
  };
}
