const ESTIMATE_NUMBER_PATTERN = /^(?:EST-[A-Z0-9]+(?:-[A-Z0-9]+)*|Q-\d{9,27})$/;
const PHONE_INPUT_PATTERN = /^[\d().\-\s]+$/;

export const PUBLIC_ESTIMATE_INPUT_REQUIRED_MESSAGE = 'Quote number and phone number are required.';
export const PUBLIC_ESTIMATE_INPUT_INVALID_MESSAGE = 'Enter a valid quote number and an 11-digit Philippine mobile number starting with 09.';
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

  const digits = input.replace(/\D/g, '');
  return /^09\d{9}$/.test(digits) ? digits : null;
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
  const customerPhone = normalizePhilippinePhoneNumber(snapshot.customer?.phone);
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
      revision_number: publicNumber(estimate.revision_number),
    },
    customer: customerName ? { name: customerName, phone: customerPhone || null } : null,
    vehicle: hasVehicle ? {
      make: vehicleMake,
      model: vehicleModel,
      year: Number.isSafeInteger(vehicleYear) ? vehicleYear : null,
      engine: publicText(snapshot.vehicle?.engine),
      variant: publicText(snapshot.vehicle?.variant ?? snapshot.vehicle?.metadata?.variant),
      fitmentId: publicText(snapshot.vehicle?.fitmentId ?? snapshot.vehicle?.metadata?.fitmentId),
    } : null,
    items: (Array.isArray(snapshot.items) ? snapshot.items : []).map((item) => ({
      line_type: item?.line_type === 'service' ? 'service' : 'product',
      product_id: publicText(item?.product_id), service_id: publicText(item?.service_id),
      product_name: publicText(item?.product_name),
      product_sku: publicText(item?.product_sku),
      service_name: publicText(item?.service_name),
      service_code: publicText(item?.service_code),
      quantity: publicNumber(item?.quantity),
      unit_price: publicNumber(item?.unit_price),
      line_total: publicNumber(item?.line_total),
      catalog_unit_price: publicNumber(item?.catalog_unit_price ?? item?.unit_price),
      bundle_key: publicText(item?.bundle_key),
      bundle_name: publicText(item?.bundle_name),
      bundle_tier_label: publicText(item?.bundle_tier_label),
    })),
    packages: (Array.isArray(snapshot._managed_package_snapshots) ? snapshot._managed_package_snapshots : []).map((pkg) => ({
      package_id: publicText(pkg.packageId),
      revision_id: publicText(pkg.revisionId),
      variant_id: publicText(pkg.variantId),
      bundle_key: publicText(pkg.bundleKey),
      package_name: publicText(pkg.packageName),
      variant_label: publicText(pkg.variantLabel),
      quantity: publicNumber(pkg.quantity),
      catalog_total: publicNumber(pkg.catalogTotal),
      effective_total: publicNumber(pkg.effectiveTotal),
      savings: publicNumber(pkg.savings),
      availability: publicText(pkg.availability),
      type: publicText(pkg.definition?.type), anchor_product_id: publicText(pkg.definition?.anchorProductId),
      min_anchor_quantity: publicNumber(pkg.definition?.minAnchorQuantity ?? 1),
      unit_pricing: publicPackageUnitPricing(pkg.unitPricing),
    })),
  };
}

function publicPackageUnitPricing(price) {
  if (!price || !Array.isArray(price.lines)) return null;
  return {
    valid: true, variantId: publicText(price.variantId), label: publicText(price.label),
    catalogTotal: publicNumber(price.catalogTotal), packageTotal: publicNumber(price.packageTotal),
    savings: publicNumber(price.savings), tax: publicNumber(price.tax), grandTotal: publicNumber(price.grandTotal), availability: publicText(price.availability),
    lines: price.lines.map((line) => ({ itemId: publicText(line.itemId), kind: line.kind === 'service' ? 'service' : 'product',
      productId: publicText(line.productId), serviceId: publicText(line.serviceId), sku: publicText(line.sku), name: publicText(line.name),
      quantity: publicNumber(line.quantity), required: line.required !== false, priceMode: publicText(line.priceMode),
      catalogUnitPrice: publicNumber(line.catalogUnitPrice), catalogTotal: publicNumber(line.catalogTotal), effectiveTotal: publicNumber(line.effectiveTotal), savings: publicNumber(line.savings),
      allocations: (Array.isArray(line.allocations) ? line.allocations : []).map((allocation) => ({ quantity: publicNumber(allocation.quantity), unitPrice: publicNumber(allocation.unitPrice) })),
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
