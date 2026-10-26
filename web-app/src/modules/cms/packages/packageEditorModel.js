export const PACKAGE_TYPE_OPTIONS = [
  {
    value: "vehicle",
    label: "Car package",
    description: "Offer parts or services for specific vehicles you have checked.",
  },
  {
    value: "service",
    label: "Service package",
    description: "Group workshop services or labor. No parts are required.",
  },
  {
    value: "parts",
    label: "Parts bundle",
    description: "Sell two or more parts together after checking they work together.",
  },
  {
    value: "combination",
    label: "Combination package",
    description: "Include both the parts and the work needed to install or service them.",
  },
  {
    value: "promotion",
    label: "Promotion",
    description: "Create an offer with a discount or a special price you have approved.",
  },
  {
    value: "maintenance",
    label: "Maintenance package",
    description: "Group the parts or services needed for a maintenance visit.",
  },
  {
    value: "custom",
    label: "Custom package",
    description: "Build a different combination of parts or services.",
  },
];
export const PACKAGE_STATUS_OPTIONS = [
  "draft",
  "published",
  "unpublished",
  "archived",
];
export const PRICING_OPTIONS = [
  { value: "catalog", label: "Catalog prices" },
  { value: "percentage", label: "Percentage discount" },
  { value: "fixed_discount", label: "Fixed amount off" },
  { value: "fixed_price", label: "Fixed package price" },
];
export const PACKAGE_STEPS = [
  "Choose type",
  "Name & details",
  "Add items",
  "Check vehicles",
  "Set price",
  "Review",
  "Finish",
];
export const PACKAGE_STEP_GUIDANCE = [
  "Choose what you want to offer. You will add the actual parts and services in step 3.",
  "Give the package a name customers will recognize and explain what is included. Other settings are optional.",
  "Search for real parts or services, add them, then check the quantity of each item. Start with one complete package.",
  "Choose which vehicles this package is suitable for and explain how you checked. Not sure yet? You can still save a draft.",
  "Keep the listed prices or choose a discount you have approved. The preview shows the total before and after VAT.",
  "Check the name, included items, vehicle details and total exactly as customers will see them. Go back to change anything.",
  "Save a draft to finish later, or publish the reviewed package so eligible customers can add it to a quote.",
];
export const newIdentity = () => crypto.randomUUID();
export function newPackageVariant(index = 0) {
  return {
    id: newIdentity(),
    key: index ? `option-${index + 1}` : "complete",
    label: index ? `Option ${index + 1}` : "Complete package",
    description: "",
    displayOrder: index,
    active: true,
    pricing: { mode: "catalog", strategy: "live", value: 0 },
    eligibility: [],
    items: [],
  };
}
export function newPackageDraft() {
  return {
    id: newIdentity(),
    packageKey: "",
    name: "",
    description: "",
    type: "custom",
    category: "",
    serviceGroup: "",
    anchorProductId: null,
    anchorCategory: "",
    triggerServiceId: null,
    imageUrl: "",
    internalNotes: "",
    priority: 100,
    minAnchorQuantity: 1,
    relationshipVerified: false,
    relationshipEvidence: "",
    expectedRevision: 0,
    eligibility: [],
    variants: [newPackageVariant()],
  };
}
export function newEligibilityRule() {
  return {
    id: newIdentity(),
    mode: "unverified",
    fitmentId: null,
    make: "",
    model: "",
    family: "",
    engine: "",
    variant: "",
    yearFrom: null,
    yearTo: null,
    verified: false,
    evidence: "",
  };
}
export function newPackageItem(record, kind, order) {
  return {
    id: newIdentity(),
    kind,
    productId: kind === "product" ? record.id : null,
    serviceId: kind === "service" ? record.id : null,
    quantity: 1,
    displayOrder: order,
    required: true,
    active: true,
    priceMode: "catalog",
    priceOverride: null,
    reason: "",
    display: {
      name: record.name,
      sku: record.sku || record.code,
      price: record.price ?? record.standard_price,
      model: record.model_name,
      category: record.category,
      stock: record.stock,
      isActive: record.is_active,
    },
  };
}
export const packageSlug = (name) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 110);
export function duplicateVariant(variant, index) {
  return {
    ...structuredClone(variant),
    id: newIdentity(),
    key: `option-${index + 1}-${Date.now().toString(36)}`,
    label: `${variant.label} (copy)`,
    displayOrder: index,
    items: variant.items.map((item) => ({
      ...structuredClone(item),
      id: newIdentity(),
    })),
    eligibility: variant.eligibility.map((rule) => ({
      ...structuredClone(rule),
      id: newIdentity(),
    })),
  };
}
export function readPackageRecovery(userId) {
  if (!userId) return null;
  try {
    const value = sessionStorage.getItem(`limen-package-editor:${userId}`);
    if (!value || value.length > 400000) return null;
    const recovery = JSON.parse(value);
    if (
      !recovery.draft?.id ||
      !Array.isArray(recovery.draft.variants) ||
      Date.now() - recovery.updatedAt > 86400000
    )
      return null;
    return recovery;
  } catch {
    return null;
  }
}
