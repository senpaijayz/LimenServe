const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTEXT_TYPES = new Set(['estimate', 'sale', 'service']);
const ACTIONS = new Set(['shown', 'accepted', 'rejected', 'ignored']);

function normalizedUuid(value, { required = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return required ? undefined : null;
  }

  const candidate = String(value).trim();
  return UUID_PATTERN.test(candidate) ? candidate.toLowerCase() : undefined;
}

function normalizedReason(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const reason = value.trim();
  if (!reason || reason.length > 160 || /[\u0000-\u001F\u007F]/.test(reason)) {
    return undefined;
  }

  return reason;
}

export function parseUpsellAction(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Invalid recommendation event.' };
  }

  const contextType = String(body.contextType || '').trim().toLowerCase();
  const action = String(body.action || 'shown').trim().toLowerCase();
  const contextId = normalizedUuid(body.contextId, { required: true });
  const productId = normalizedUuid(body.productId, { required: true });
  const recommendedProductId = normalizedUuid(body.recommendedProductId);
  const recommendedServiceId = normalizedUuid(body.recommendedServiceId);
  const ruleId = normalizedUuid(body.ruleId);
  const reasonLabel = normalizedReason(body.reasonLabel);

  if (!CONTEXT_TYPES.has(contextType)
    || !ACTIONS.has(action)
    || contextId === undefined
    || productId === undefined
    || recommendedProductId === undefined
    || recommendedServiceId === undefined
    || ruleId === undefined
    || reasonLabel === undefined
    || Boolean(recommendedProductId) === Boolean(recommendedServiceId)) {
    return { ok: false, error: 'Invalid recommendation event.' };
  }

  return {
    ok: true,
    value: {
      contextType,
      contextId,
      productId,
      recommendedProductId,
      recommendedServiceId,
      action,
      ruleId,
      reasonLabel,
    },
  };
}
