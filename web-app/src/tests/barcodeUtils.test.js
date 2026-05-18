import { describe, expect, it } from 'vitest';
import {
    PRODUCT_BARCODE_SUFFIX,
    buildProductBarcodeValue,
    getPartNumberSearchSuggestions,
    getProductPartNumber,
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
        expect(getBarcodeLookupCandidates('5370A737 0001')).toEqual([
            '5370A7370001',
            '5370A737',
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

    it('treats part number fields as the primary searchable identifier', () => {
        const product = {
            id: 42,
            partNumber: 'DP010374',
            sku: 'LEGACY-SKU',
        };

        expect(getProductPartNumber(product)).toBe('DP010374');
        expect(productMatchesIdentifier(product, 'dp010374')).toBe(true);
        expect(productMatchesIdentifier(product, 'DP0103740001')).toBe(true);
        expect(productMatchesIdentifier(product, 'LEGACY-SKU')).toBe(true);
    });

    it('returns at most five scrollable part number suggestions with close matches first', () => {
        const products = [
            { id: 1, sku: 'DP010370', name: 'Riken CP30' },
            { id: 2, sku: 'DP010371', name: 'Riken CP31' },
            { id: 3, sku: 'DP010372', name: 'Riken CP32' },
            { id: 4, sku: 'DP010373', name: 'Riken CP33' },
            { id: 5, sku: 'DP010374', name: 'Riken CP38 Sandpaper' },
            { id: 6, sku: 'DP010375', name: 'Riken CP39' },
            { id: 7, part_number: 'MB-9901', name: 'Brake Pad DP Kit' },
        ];

        const suggestions = getPartNumberSearchSuggestions(products, 'dp01037');

        expect(suggestions).toHaveLength(5);
        expect(suggestions.map((product) => getProductPartNumber(product))).toEqual([
            'DP010370',
            'DP010371',
            'DP010372',
            'DP010373',
            'DP010374',
        ]);
    });
});
