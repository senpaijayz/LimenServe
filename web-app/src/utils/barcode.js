export const PRODUCT_BARCODE_SUFFIX = '0001';

export function normalizeBarcodeToken(value) {
    return String(value ?? '')
        .trim()
        .toUpperCase()
        .replace(/\s+/g, '')
        .replace(/^\*+|\*+$/g, '');
}

export function buildProductBarcodeValue(sku) {
    const normalizedSku = normalizeBarcodeToken(sku);
    return normalizedSku ? `${normalizedSku}${PRODUCT_BARCODE_SUFFIX}` : '';
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

export function productMatchesIdentifier(product, identifier) {
    const productSku = normalizeBarcodeToken(product?.sku);
    const productId = normalizeBarcodeToken(product?.id);
    const productBarcode = buildProductBarcodeValue(productSku);
    const candidates = getBarcodeLookupCandidates(identifier);

    if (candidates.length === 0) {
        return false;
    }

    return candidates.some((candidate) => (
        candidate === productSku
        || candidate === productBarcode
        || candidate === productId
    ));
}
