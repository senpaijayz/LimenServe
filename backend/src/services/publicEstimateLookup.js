const ESTIMATE_NUMBER_PATTERN = /^EST-[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const PHONE_INPUT_PATTERN = /^[+\d().\-\s]+$/;

export const PUBLIC_ESTIMATE_INPUT_REQUIRED_MESSAGE = 'Quote number and phone number are required.';
export const PUBLIC_ESTIMATE_INPUT_INVALID_MESSAGE = 'Enter a valid quote number and Philippine phone number.';
export const PUBLIC_ESTIMATE_NOT_FOUND_MESSAGE = 'No matching active quote was found.';

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function publicText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  return value.trim() || null;
}

function publicNumber(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function normalizePublicEstimateNumber(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized.length < 5 || normalized.length > 64 || !ESTIMATE_NUMBER_PATTERN.test(normalized)) {
    return null;
  }

  return normalized;
}

export function normalizePhilippinePhoneNumber(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const input = value.trim();
  if (!input || input.length > 32 || !PHONE_INPUT_PATTERN.test(input)) {
    return null;
  }

  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0063')) {
    digits = `0${digits.slice(4)}`;
  } else if (digits.startsWith('63')) {
    digits = `0${digits.slice(2)}`;
  }

  return /^0\d{9,10}$/.test(digits) ? digits : null;
}

export function parsePublicEstimateLookupInput(body) {
  const estimateNumberInput = body?.estimateNumber;
  const phoneInput = body?.phone;

  if (!hasText(estimateNumberInput) || !hasText(phoneInput)) {
    return {
      ok: false,
      statusCode: 400,
      error: PUBLIC_ESTIMATE_INPUT_REQUIRED_MESSAGE,
    };
  }

  const estimateNumber = normalizePublicEstimateNumber(estimateNumberInput);
  const phone = normalizePhilippinePhoneNumber(phoneInput);
  if (!estimateNumber || !phone) {
    return {
      ok: false,
      statusCode: 400,
      error: PUBLIC_ESTIMATE_INPUT_INVALID_MESSAGE,
    };
  }

  return {
    ok: true,
    estimateNumber,
    phone,
  };
}

export function buildPublicEstimateLookupResult(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || snapshot.estimate?.source !== 'public') {
    return null;
  }

  const estimate = snapshot.estimate;
  const customerName = publicText(snapshot.customer?.name);
  const vehicleMake = publicText(snapshot.vehicle?.make);
  const vehicleModel = publicText(snapshot.vehicle?.model ?? snapshot.vehicle?.model_name);
  const vehicleYear = Number.parseInt(snapshot.vehicle?.year, 10);
  const hasVehicle = Boolean(vehicleMake || vehicleModel || Number.isSafeInteger(vehicleYear));

  return {
    estimate: {
      estimate_number: publicText(estimate.estimate_number),
      status: publicText(estimate.status),
      subtotal: publicNumber(estimate.subtotal),
      discount_total: publicNumber(estimate.discount_total),
      tax_total: publicNumber(estimate.tax_total),
      grand_total: publicNumber(estimate.grand_total),
      issued_at: publicText(estimate.issued_at),
      valid_until: publicText(estimate.valid_until),
    },
    customer: customerName ? { name: customerName } : null,
    vehicle: hasVehicle ? {
      make: vehicleMake,
      model: vehicleModel,
      year: Number.isSafeInteger(vehicleYear) ? vehicleYear : null,
    } : null,
    items: (Array.isArray(snapshot.items) ? snapshot.items : []).map((item) => ({
      line_type: item?.line_type === 'service' ? 'service' : 'product',
      product_name: publicText(item?.product_name),
      service_name: publicText(item?.service_name),
      quantity: publicNumber(item?.quantity),
      unit_price: publicNumber(item?.unit_price),
      line_total: publicNumber(item?.line_total),
    })),
  };
}

function setNoStore(res) {
  if (typeof res.set === 'function') {
    res.set('Cache-Control', 'no-store');
    return;
  }

  res.setHeader('Cache-Control', 'no-store');
}

export function createPublicEstimateLookupHandler({ rpc } = {}) {
  if (typeof rpc !== 'function') {
    throw new TypeError('A public estimate lookup RPC caller is required.');
  }

  return async function publicEstimateLookupHandler(req, res, next) {
    try {
      setNoStore(res);

      const input = parsePublicEstimateLookupInput(req.body);
      if (!input.ok) {
        res.status(input.statusCode).json({ error: input.error });
        return;
      }

      const snapshot = await rpc('lookup_public_estimate', {
        p_estimate_number: input.estimateNumber,
        p_phone: input.phone,
      });
      const estimate = buildPublicEstimateLookupResult(snapshot);

      if (!estimate) {
        res.status(404).json({ error: PUBLIC_ESTIMATE_NOT_FOUND_MESSAGE });
        return;
      }

      res.json({ estimate });
    } catch (error) {
      const safeError = new Error('Quote lookup is temporarily unavailable.');
      safeError.statusCode = 503;
      safeError.cause = error;
      next(safeError);
    }
  };
}
