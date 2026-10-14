export const PRODUCT_BARCODE_SUFFIX = '0001';
const PRODUCT_BARCODE_VENDOR_PREFIXES = ['PA'];
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
    return normalizedSku;
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
    const prefixStrippedValues = PRODUCT_BARCODE_VENDOR_PREFIXES
        .filter((prefix) => strippedValue.startsWith(prefix) && strippedValue.length > prefix.length)
        .flatMap((prefix) => {
            const withoutPrefix = strippedValue.slice(prefix.length);
            return [withoutPrefix, stripProductBarcodeSuffix(withoutPrefix)];
        });

    return Array.from(new Set([
        normalizedValue,
        strippedValue,
        ...prefixStrippedValues,
        ...getEquivalentRetailCodes(normalizedValue),
    ].filter(Boolean)));
}

function getEquivalentRetailCodes(value) {
    // UPC-A and zero-prefixed EAN-13 encode the same symbol. Keep the scanned
    // value first; only add the equivalent when its check digit is valid.
    if (!/^\d{12,13}$/.test(value)) return [];
    const digits = [...value].map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
    if ((10 - sum % 10) % 10 !== check) return [];
    if (value.length === 12) return [`0${value}`];
    return value.startsWith('0') ? [value.slice(1)] : [];
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

export function findProductByIdentifier(products, identifier) {
    const code = normalizeBarcodeToken(identifier);
    if (!code) return null;
    const exact = products.filter((product) => [...PART_NUMBER_FIELDS.map((field) => product?.[field]), product?.id, ...(Array.isArray(product?.identifiers) ? product.identifiers : [])]
        .some((value) => value != null && normalizeBarcodeToken(value) === code));
    if (exact.length) return exact.length === 1 ? exact[0] : null;
    const matches = products.filter((product) => productMatchesIdentifier(product, code));
    // Never guess between different parts sharing a legacy/retail alias.
    return matches.length === 1 ? matches[0] : null;
}
