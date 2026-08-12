import { describe, expect, it } from 'vitest';
import {
    getLocatorQualityProfile,
    resolveLocatorQualityTier,
} from '../modules/locator3d/utils/qualityTier';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('3D locator quality tiers', () => {
    it('uses a conservative tier for reduced-motion, data-saving, and constrained devices', () => {
        expect(resolveLocatorQualityTier('auto', { deviceMemory: 8, hardwareConcurrency: 8, reducedMotion: true })).toBe('low');
        expect(resolveLocatorQualityTier('auto', { deviceMemory: 8, hardwareConcurrency: 8, saveData: true })).toBe('low');
        expect(resolveLocatorQualityTier('auto', { deviceMemory: 2, hardwareConcurrency: 8 })).toBe('low');
        expect(resolveLocatorQualityTier('auto', { deviceMemory: 4, hardwareConcurrency: 8 })).toBe('medium');
        expect(resolveLocatorQualityTier('auto', { deviceMemory: 8, hardwareConcurrency: 8 })).toBe('high');
    });

    it('honors an explicit quality choice and disables costly work for low quality', () => {
        const lowQuality = getLocatorQualityProfile('low', { deviceMemory: 16, hardwareConcurrency: 16 });

        expect(resolveLocatorQualityTier('medium', { deviceMemory: 1, hardwareConcurrency: 1 })).toBe('medium');
        expect(lowQuality).toMatchObject({
            bloom: false,
            contactShadows: false,
            dpr: [1, 1],
            environment: false,
            labels: false,
            shadows: false,
            tier: 'low',
        });
    });

    it('stores only known quality preferences', () => {
        resetLocator3DStore();

        useLocator3DStore.getState().setQualityPreference('low');
        expect(useLocator3DStore.getState().qualityPreference).toBe('low');

        useLocator3DStore.getState().setQualityPreference('ultra');
        expect(useLocator3DStore.getState().qualityPreference).toBe('auto');
    });
});
