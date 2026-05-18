export const PRODUCT_BARCODE_SUFFIX = '0001';
const PART_NUMBER_FIELDS = [
    'partNumber',
    'part_number',
    'partNo',
    'part_no',
    'itemSku',
    'item_sku',
    'productSku',
    'product_sku',
    'sku',
    'barcode',
    'barcodeValue',
    'code',
];

export function normalizeBarcodeToken(value) {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^\*+|\*+$/g, '');
}

export function buildProductBarcodeValue(sku) {
    const normalizedSku = normalizeBarcodeToken(sku);
    return normalizedSku ? `${normalizedSku} ${PRODUCT_BARCODE_SUFFIX}` : '';
}

export function stripProductBarcodeSuffix(value) {
    const normalizedValue = normalizeBarcodeToken(value);
    if (
        normalizedValue.endsWith(PRODUCT_BARCODE_SUFFIX)
        && normalizedValue.length > PRODUCT_BARCODE_SUFFIX.length
    ) {
        return normalizedValue.slice(0, -PRODUCT_BARCODE_SUFFIX.length);
    }

    return normalizedValue;
}

export function getBarcodeLookupCandidates(value) {
    const normalizedValue = normalizeBarcodeToken(value);
    const strippedValue = stripProductBarcodeSuffix(normalizedValue);

    return Array.from(new Set([normalizedValue, strippedValue].filter(Boolean)));
}

export function getBarcodeLookupQueries(value) {
    return getBarcodeLookupCandidates(value);
}

export function getProductPartNumber(product = {}) {
    const directValue = PART_NUMBER_FIELDS
        .map((field) => product?.[field])
        .find((value) => String(value ?? '').trim());

    return String(directValue ?? '').trim();
}

export function getProductPartNumberCandidates(product = {}) {
    const values = PART_NUMBER_FIELDS
        .map((field) => product?.[field])
        .filter((value) => String(value ?? '').trim());

    if (Array.isArray(product?.identifiers)) {
        values.push(...product.identifiers);
    }

    const partNumber = getProductPartNumber(product);
    if (partNumber) {
        values.push(buildProductBarcodeValue(partNumber));
    }

    return Array.from(new Set(values
        .flatMap((value) => getBarcodeLookupCandidates(value))
        .filter(Boolean)));
}

function normalizeSearchText(value) {
    return String(value ?? '').trim().toLowerCase();
}

function scoreProductSuggestion(product, query) {
    const textQuery = normalizeSearchText(query);
    const tokenQuery = normalizeBarcodeToken(query);
    if (!textQuery && !tokenQuery) {
        return 0;
    }

    const candidates = getProductPartNumberCandidates(product);
    if (tokenQuery && candidates.includes(tokenQuery)) {
        return 120;
    }
    if (tokenQuery && candidates.some((candidate) => candidate.startsWith(tokenQuery))) {
        return 100;
    }
    if (tokenQuery && candidates.some((candidate) => candidate.includes(tokenQuery))) {
        return 80;
    }

    const searchableText = [
        product?.name,
        product?.model,
        product?.category,
        product?.brand,
        product?.supplierName,
        product?.supplier_name,
    ].map(normalizeSearchText).filter(Boolean);

    if (searchableText.some((value) => value.startsWith(textQuery))) {
        return 50;
    }
    if (searchableText.some((value) => value.includes(textQuery))) {
        return 30;
    }

    return 0;
}

export function productMatchesPartNumberSearch(product, query) {
    return scoreProductSuggestion(product, query) > 0;
}

export function getPartNumberSearchSuggestions(products = [], query = '', limit = 5) {
    return products
        .map((product, index) => ({
            product,
            index,
            score: scoreProductSuggestion(product, query),
            partNumber: normalizeBarcodeToken(getProductPartNumber(product)),
        }))
        .filter((item) => item.score > 0)
        .sort((a, b) => (
            b.score - a.score
            || a.partNumber.localeCompare(b.partNumber)
            || a.index - b.index
        ))
        .slice(0, limit)
        .map((item) => item.product);
}

export function productMatchesIdentifier(product, identifier) {
    const productId = normalizeBarcodeToken(product?.id);
    const productIdentifiers = getProductPartNumberCandidates(product);
    const candidates = getBarcodeLookupCandidates(identifier);

    if (candidates.length === 0) {
        return false;
    }

    return candidates.some((candidate) => (
        productIdentifiers.includes(candidate)
        || candidate === productId
    ));
}
