import { describe, expect, it } from 'vitest';
import { validateScan, cameraError } from '../utils/scannerPolicy';
import { getBarcodeLookupCandidates } from '../utils/barcode';

describe('product barcode validation', () => {
    it.each([undefined, null, {}, '', '   ', 'A', '123\u0000', '<script>x</script>', 'https://example.com', 'A'.repeat(161)])('rejects unsafe or invalid input %s', (value) => expect(validateScan(value)).toBe(''));
    it('normalizes Code39 wrappers but preserves full identifiers for exact-first lookup', () => {
        expect(validateScan(' * md094120 0001 * ')).toBe('MD0941200001');
        expect(getBarcodeLookupCandidates(validateScan('MD0941200001'))).toEqual(['MD0941200001', 'MD094120']);
        expect(validateScan('0001230001')).toBe('0001230001');
    });
    it('never exposes technical errors to users', () => expect(cameraError(new Error('secret'))).not.toContain('secret'));
    it('matches equivalent UPC-A/EAN-13 without stripping arbitrary leading zeros', () => {
        expect(getBarcodeLookupCandidates('0012345678905')).toEqual(['0012345678905', '012345678905']);
        expect(getBarcodeLookupCandidates('012345678905')).toEqual(['012345678905', '0012345678905']);
        expect(getBarcodeLookupCandidates('0012345678906')).toEqual(['0012345678906']);
    });
});
