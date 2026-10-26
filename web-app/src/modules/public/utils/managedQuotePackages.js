export const isManagedBundle = (key) =>
  typeof key === "string" && key.startsWith("pkg:");
export const managedBundleKey = (id) => `pkg:${id}`;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const cents = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error(
      "This package needs a current, verified price. Refresh the package list.",
    );
  return Math.round(Number(value) * 100);
};
const money = (value) => Number((value / 100).toFixed(2));

export function makeManagedOffer(publication, price, quantity = 1) {
  if (
    !publication?.definition ||
    !uuid.test(publication.definition.id || "") ||
    !uuid.test(publication.revisionId || "") ||
    !uuid.test(price?.variantId || "") ||
    price.valid === false ||
    !Array.isArray(price.lines) ||
    !price.lines.length
  )
    throw new Error("Choose a published package with an available price.");
  const offer = {
    definition: publication.definition,
    price,
    selection: {
      packageId: publication.definition.id,
      revisionId: publication.revisionId,
      variantId: price.variantId,
      quantity,
    },
    saved: false,
  };
  managedOfferLines(offer); // Validate before changing any cart state.
  return offer;
}

export function managedOfferLines(offer) {
  const { selection, price, definition } = offer;
  if (
    !Number.isSafeInteger(selection.quantity) ||
    selection.quantity < 1 ||
    selection.quantity > 1000
  )
    throw new Error("Choose a whole package quantity between 1 and 1000.");
  let net = 0;
  let gross = 0;
  const lines = price.lines.flatMap((item) => {
    if (
      !["product", "service"].includes(item.kind) ||
      !uuid.test(item.itemId || "") ||
      !uuid.test(item.productId || item.serviceId || "") ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      !Array.isArray(item.allocations) ||
      item.allocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      ) !== item.quantity
    )
      throw new Error("The package item quantities need review.");
    const catalog = cents(item.catalogUnitPrice);
    if (item.kind === "product" && !catalog)
      throw new Error(
        "A part without a verified price cannot be added as free.",
      );
    return item.allocations.map((allocation, index) => {
      const quantity = allocation.quantity * selection.quantity;
      const unit = cents(allocation.unitPrice);
      if (
        !Number.isSafeInteger(quantity) ||
        quantity < 1 ||
        quantity > 1000 ||
        unit > catalog
      )
        throw new Error("This package quantity or price needs review.");
      net += unit * quantity;
      gross += catalog * quantity;
      return {
        id: item.productId || item.serviceId,
        kind: item.kind,
        lineKey: `${managedBundleKey(selection.packageId)}:${item.itemId}:${index}`,
        name: item.name,
        sku: item.sku,
        code: item.kind === "service" ? item.sku : undefined,
        price: money(unit),
        catalogPrice: money(catalog),
        quantity,
        bundleKey: managedBundleKey(selection.packageId),
        bundleName: definition.name,
        bundleTierKey: selection.variantId,
        bundleTierLabel: price.label,
        isUpsell: true,
        recommendationRuleId: null,
        managedSelection: { ...selection },
      };
    });
  });
  if (
    net !== cents(price.packageTotal) * selection.quantity ||
    gross !== cents(price.catalogTotal) * selection.quantity ||
    gross > 10000000000
  )
    throw new Error(
      "The package totals do not match its included items. Refresh the offer.",
    );
  return lines;
}

export function replaceManagedLines(
  current,
  offer,
  kind,
  { consumeOrdinary = false } = {},
) {
  const next = managedOfferLines(offer).filter((line) => line.kind === kind);
  const needs = new Map();
  next.forEach((line) =>
    needs.set(line.id, (needs.get(line.id) || 0) + line.quantity),
  );
  const retained = current
    .filter(
      (line) => line.bundleKey !== managedBundleKey(offer.selection.packageId),
    )
    .flatMap((line) => {
      if (!consumeOrdinary || line.bundleKey || !needs.get(line.id))
        return [line];
      const consumed = Math.min(needs.get(line.id), line.quantity);
      needs.set(line.id, needs.get(line.id) - consumed);
      return line.quantity > consumed
        ? [{ ...line, quantity: line.quantity - consumed }]
        : [];
    });
  return [...retained, ...next];
}

export function managedSelectionsFromLines(lines) {
  const selections = new Map();
  for (const line of lines.filter((item) => isManagedBundle(item.bundleKey))) {
    if (!line.managedSelection)
      throw new Error(
        "Reload this saved package before editing the quotation.",
      );
    const prior = selections.get(line.bundleKey);
    if (
      prior &&
      JSON.stringify(prior) !== JSON.stringify(line.managedSelection)
    )
      throw new Error(
        "The package quantities are inconsistent. Review the selected package.",
      );
    selections.set(line.bundleKey, line.managedSelection);
  }
  return [...selections.values()].map((selection) => ({ ...selection }));
}

export function savedManagedOffers(quote) {
  const rows = quote?._managed_package_snapshots || quote?.packages || [];
  if (!Array.isArray(rows) || rows.length > 12 || !Array.isArray(quote?.items))
    throw new Error('The saved package information is incomplete. Reload the quotation before editing it.');
  const offers = rows.map((row) => {
    const id = row.packageId || row.package_id;
    const definition = {
      id,
      name: row.packageName || row.package_name,
      type: row.definition?.type || row.type,
      anchorProductId: row.definition?.anchorProductId || row.anchor_product_id,
      minAnchorQuantity:
        row.definition?.minAnchorQuantity || row.min_anchor_quantity || 1,
    };
    const price = row.unitPricing || row.unit_pricing;
    const offer = makeManagedOffer(
      { definition, revisionId: row.revisionId || row.revision_id },
      price,
      row.quantity,
    );
    return { ...offer, saved: true };
  });
  const signature = (kind, id, quantity, unit, catalog, bundle) => {
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000)
      throw new Error('A saved package quantity needs review.');
    return JSON.stringify([bundle, kind, id, quantity, cents(unit), cents(catalog)]);
  };
  const expected = offers.flatMap(managedOfferLines).map((line) =>
    signature(line.kind, line.id, line.quantity, line.price, line.catalogPrice, line.bundleKey)).sort();
  const recorded = quote.items.filter((line) => isManagedBundle(line.bundle_key)).map((line) =>
    signature(line.line_type, line.product_id || line.service_id, line.quantity, line.unit_price, line.catalog_unit_price, line.bundle_key)).sort();
  if (expected.length !== recorded.length || expected.some((line, index) => line !== recorded[index]))
    throw new Error('The saved package items do not match their recorded prices. Keep this quotation unchanged and ask the shop to review it.');
  return offers;
}

export function managedOfferTotal(offer) {
  return money(cents(offer.price.packageTotal) * offer.selection.quantity);
}
