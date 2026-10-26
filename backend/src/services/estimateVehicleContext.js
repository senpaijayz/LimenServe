// Omission preserves the quote's recorded vehicle; explicit null clears it.
// Keep this separate from the master vehicle row and from customer-controlled
// private snapshot fields.
export function estimatePricingVehicle(payload, existingQuote = null) {
  if (Object.hasOwn(payload, 'vehicle')) return payload.vehicle;
  const saved = existingQuote?.vehicle;
  if (!saved) return null;
  return { ...saved,
    model_name: saved.model_name || saved.model,
    variant: saved.variant || saved.metadata?.variant,
    fitmentId: saved.fitmentId || saved.metadata?.fitmentId,
  };
}
