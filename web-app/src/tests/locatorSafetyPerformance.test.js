import { beforeEach, describe, expect, it } from 'vitest';
import { configureLocatorRecovery, readLocatorRecovery, writeLocatorRecovery, clearLocatorRecovery } from '../modules/locator3d/utils/locatorRecovery';
import { createFrameSampler, sampleFrameQuality } from '../modules/locator3d/utils/frameQuality';
import { nextShelfNumber, validateLayoutObjects, validateShelfIdentifiers } from '../modules/locator3d/utils/layoutValidation';
import { resetLocator3DStore, useLocator3DStore } from '../modules/locator3d/store/useLocator3DStore';

describe('Scoped recovery and adaptive rendering', () => {
    beforeEach(() => { localStorage.clear(); configureLocatorRecovery(null); });
    it('never recovers an unowned legacy draft or writes without a user and layout', () => {
        localStorage.setItem('limen:locator3d:autosave:v1', JSON.stringify({ objects: [] }));
        writeLocatorRecovery([]);
        expect(localStorage.length).toBe(1);
        expect(readLocatorRecovery()).toBeNull();
    });
    it('isolates users and layouts, retains base revision and clears only the current draft', () => {
        configureLocatorRecovery({ userId: 'a', layoutId: 'one', revision: 7 }); writeLocatorRecovery([{ id: 'shelf-a' }]);
        configureLocatorRecovery({ userId: 'b', layoutId: 'one', revision: 7 }); expect(readLocatorRecovery()).toBeNull();
        configureLocatorRecovery({ userId: 'a', layoutId: 'two', revision: 2 }); expect(readLocatorRecovery()).toBeNull();
        writeLocatorRecovery([]); clearLocatorRecovery();
        configureLocatorRecovery({ userId: 'a', layoutId: 'one', revision: 8 });
        expect(readLocatorRecovery()).toMatchObject({ revision: 7, objects: [{ id: 'shelf-a' }] });
    });
    it('ignores idle/hidden frames and respects manual quality', () => {
        const sampler = createFrameSampler();
        for (let i = 0; i < 180; i++) {
            expect(sampleFrameQuality(sampler, 4, 'high')).toBeNull();
            expect(sampleFrameQuality(sampler, 0.08, 'high', false)).toBeNull();
        }
    });
    it('requires sustained low frame rate and a cooldown before another downgrade', () => {
        const sampler = createFrameSampler();
        for (let i = 0; i < 89; i++) expect(sampleFrameQuality(sampler, 0.05, 'high')).toBeNull();
        expect(sampleFrameQuality(sampler, 0.05, 'high')).toBe('medium');
        for (let i = 0; i < 100; i++) expect(sampleFrameQuality(sampler, 0.05, 'medium')).toBeNull();
    });
    it('does not lower quality at a healthy frame rate', () => {
        const sampler = createFrameSampler();
        for (let i = 0; i < 200; i++) expect(sampleFrameQuality(sampler, 1 / 60, 'high')).toBeNull();
    });
});

describe('Shelf identity and mapping safety', () => {
    const shelf = { id: 'one', type: 'shelf', floor: 1, aisle: 'A', shelfNumber: 1, position: [0, 0, 0], dimensions: { width: 1, depth: 1, height: 2 } };
    it('rejects duplicate normalized labels while allowing the same number on another floor', () => {
        expect(validateShelfIdentifiers([shelf, { ...shelf, id: 'two', aisle: 'Aisle a' }])[0].code).toBe('duplicate_shelf_identifier');
        expect(validateShelfIdentifiers([shelf, { ...shelf, id: 'two', floor: 2 }])).toEqual([]);
        expect(validateShelfIdentifiers([{ ...shelf, shelfNumber: 0 }])[0].code).toBe('invalid_shelf_identifier');
        expect(nextShelfNumber([shelf], shelf)).toBe(2);
    });
    it('duplication allocates new identifiers and deleting occupied shelves is blocked', () => {
        resetLocator3DStore();
        const store = useLocator3DStore.getState();
        store.forceSelectObject('shelf-2-a'); store.duplicateSelectedObject();
        expect(validateShelfIdentifiers(useLocator3DStore.getState().sceneObjects)).toEqual([]);
        store.setProductLocations([{ productId: 'part', shelfObjectId: 'shelf-2-a', floor: 1, binNumber: 1 }]);
        store.forceSelectObject('shelf-2-a');
        expect(store.deleteSelectedObject()).toBe(false);
    });
    it('validates against the resized, moved and rotated floor, not fixed defaults', () => {
        const floor = { id: 'floor', type: 'floor', position: [30, 0, 10], rotation: [0, Math.PI / 2, 0], dimensions: { width: 6, depth: 10, height: 5 } };
        expect(validateLayoutObjects([floor, { ...shelf, position: [30, 5, 10], floor: 2 }])).toEqual([]);
        expect(validateLayoutObjects([floor, { ...shelf, position: [30, 0, 14] }]).some((issue) => issue.code === 'out_of_bounds')).toBe(true);
    });
});
