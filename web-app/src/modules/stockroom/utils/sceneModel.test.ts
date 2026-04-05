import { describe, expect, it } from 'vitest';
import { buildSceneModel, extractSceneMetadata, snapPosition, snapRotation } from './sceneModel';
import type { StockroomBootstrap } from '../types';

const bootstrap: StockroomBootstrap = {
  store: { id: 'store-1', name: 'Main Store' },
  activeLayout: {
    id: 'layout-1',
    storeId: 'store-1',
    name: 'Layout',
    versionNumber: 1,
    status: 'draft',
    staircaseFloor1Anchor: { x: 3, y: 3 },
    staircaseFloor2Anchor: { x: 3, y: 3 },
    cameraSettings: {},
    metadata: {},
  },
  floors: [
    { id: 'floor-1', layoutId: 'layout-1', floorNumber: 1, name: 'Ground', width: 18, depth: 16, elevation: 0, entryAnchor: { x: 9, y: 15 }, metadata: {} },
    { id: 'floor-2', layoutId: 'layout-1', floorNumber: 2, name: 'Upper', width: 18, depth: 16, elevation: 4, entryAnchor: { x: 9, y: 15 }, metadata: {} },
  ],
  zones: [
    { id: 'zone-1', layoutId: 'layout-1', floorId: 'floor-1', code: 'A', name: 'Front', positionX: 0, positionY: 0, width: 8, depth: 6, colorHex: '#efd6c6', metadata: {} },
  ],
  aisles: [
    { id: 'aisle-1', layoutId: 'layout-1', floorId: 'floor-1', zoneId: 'zone-1', code: 'A1', name: 'Aisle 1', startX: 6, startY: 1, endX: 6, endY: 12, walkwayWidth: 1.8, metadata: {} },
  ],
  shelves: [
    { id: 'shelf-1', layoutId: 'layout-1', floorId: 'floor-1', zoneId: 'zone-1', aisleId: 'aisle-1', code: 'S1', name: 'Shelf 1', shelfType: '4_level', positionX: 5, positionY: 4, rotation: 0, width: 2.8, depth: 0.9, height: 2.2, accessSide: 'front', metadata: {} },
  ],
  shelfLevels: [],
  shelfSlots: [],
  itemLocations: [],
  permissions: { canManage: true, role: 'admin' },
};

describe('sceneModel', () => {
  it('builds default metadata when layout metadata is empty', () => {
    const metadata = extractSceneMetadata(bootstrap.activeLayout, bootstrap);
    expect(metadata.sceneObjects.some((object) => object.kind === 'stairs' && object.floorNumber === 1)).toBe(true);
    expect(metadata.sceneObjects.some((object) => object.kind === 'stairs' && object.floorNumber === 2)).toBe(true);
  });

  it('builds canonical shelf and zone entities', () => {
    const metadata = extractSceneMetadata(bootstrap.activeLayout, bootstrap);
    const scene = buildSceneModel(bootstrap, metadata);
    expect(scene.entities.some((entity) => entity.kind === 'shelf' && entity.id === 'shelf-1')).toBe(true);
    expect(scene.entities.some((entity) => entity.kind === 'zone_overlay' && entity.id === 'zone-1')).toBe(true);
  });

  it('snaps values to the configured grid and rotation step', () => {
    expect(snapPosition({ x: 3.13, y: 4.11 }, 0.25)).toEqual({ x: 3.25, y: 4 });
    expect(snapRotation(22)).toBe(15);
  });
});
