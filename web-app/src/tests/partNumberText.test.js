import { describe, expect, it } from 'vitest';
import { extractPartNumberCandidates, partNumberCaptureRegion } from '../utils/partNumberText';

describe('printed part-number proposals', () => {
    it('extracts Mitsubishi identifiers and preserves all digits/suffixes', () => {
        expect(extractPartNumberCandidates('PART NO: MD0941200001\n1800A062\n6370A933HA\n11045W010P')).toEqual(['MD0941200001', '1800A062', '6370A933HA', '11045W010P']);
    });
    it('joins a spaced alpha prefix without replacing ambiguous letters or digits', () => {
        expect(extractPartNumberCandidates('MD 094120\nMROO1234')).toEqual(['MD094120', '094120', 'MROO1234']);
    });
    it('retains a part before a quantity field but rejects dates/phones/descriptions and URLs', () => {
        expect(extractPartNumberCandidates('MITSUBISHI\nOIL FILTER\nDATE: 2026-11-03\nTEL: 09151234567\nTIN 213000580\nMD094120 QTY 1\nhttps://bad.example/123456\n2026-11-03')).toEqual(['MD094120']);
    });
    it('deduplicates and limits displayed choices', () => {
        expect(extractPartNumberCandidates(Array.from({ length: 50 }, (_, i) => 'MD0941'+i).join('\n'))).toHaveLength(6);
        expect(extractPartNumberCandidates('MR446308\nMR446308')).toEqual(['MR446308']);
    });
});
describe('camera guide capture coordinates', () => {
    it('matches the visible guide while excluding letterboxing', () => {
        const crop = partNumberCaptureRegion(1920, 1080, 400, 300);
        expect(crop.x).toBeCloseTo(134.4); expect(crop.y).toBeCloseTo(93.6);
        expect(crop.width).toBeCloseTo(1651.2); expect(crop.height).toBeCloseTo(892.8);
        expect(crop.x + crop.width).toBeLessThanOrEqual(1920);
    });
    it('rejects a camera that has no frame or no visible viewport', () => {
        expect(() => partNumberCaptureRegion(0, 0, 400, 300)).toThrow(/not ready/);
    });
});
