import { describe, expect, it } from 'vitest';
import {
    PRODUCT_BARCODE_SUFFIX,
    buildProductBarcodeValue,
    getBarcodeLookupCandidates,
    productMatchesIdentifier,
} from '../utils/barcode';

describe('barcode utilities', () => {
    it('builds the Mitsubishi barcode payload by appending the fixed 0001 suffix', () => {
        expect(PRODUCT_BARCODE_SUFFIX).toBe('0001');
        expect(buildProductBarcodeValue('MD972932')).toBe('MD9729320001');
    });

    it('normalizes code 39 scans with spaces and sentinel characters', () => {
        expect(getBarcodeLookupCandidates('*MD972932  0001*')).toEqual([
            'MD9729320001',
            'MD972932',
        ]);
    });

    it('matches either the raw sku or the scanned barcode payload to the same product', () => {
        const product = {
            id: 42,
            sku: 'MD972932',
        };

        expect(productMatchesIdentifier(product, 'MD972932')).toBe(true);
        expect(productMatchesIdentifier(product, 'MD9729320001')).toBe(true);
        expect(productMatchesIdentifier(product, '*MD972932 0001*')).toBe(true);
        expect(productMatchesIdentifier(product, 'MD9729330001')).toBe(false);
    });
});
