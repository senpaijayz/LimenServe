import type { ProductLocation } from '../store/useStockroomStoreV2';

export const AISLE_SPACING = 6;
export const SHELF_SPACING = 5;
export const LEVEL_HEIGHT = 1.5;

export function getCoordinatesFromLocation(loc: ProductLocation): [number, number, number] {
    const x = (loc.aisle - 3.5) * AISLE_SPACING;
    const y = loc.level * LEVEL_HEIGHT - (LEVEL_HEIGHT / 2);
    const z = (loc.shelf - 3) * SHELF_SPACING;
    const binOffset = (loc.bin - 2) * 0.4;
    return [x + binOffset, y + 0.1, z];
}
