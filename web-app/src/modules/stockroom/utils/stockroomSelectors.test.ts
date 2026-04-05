import { describe, expect, it } from 'vitest';
import { buildAdminStats, buildViewerStats, summarizeRoute } from './stockroomSelectors';
import type { SceneModel, StockroomBootstrap, StockroomItemDetails } from '../types';

describe('stockroomSelectors', () => {
  it('summarizes route details', () => {
    const itemDetails = {
      location: {
        floor: { floorNumber: 2 },
        zone: { code: 'A' },
        shelf: { code: 'S-10' },
        level: { levelNumber: 3 },
        slot: { slotNumber: 2 },
      },
    } as StockroomItemDetails;

    expect(summarizeRoute(itemDetails)).toBe('Floor 2 | A | S-10 | L3 | S2');
  });

  it('builds viewer stats from bootstrap', () => {
    const bootstrap = {
      floors: [{ id: '1' }, { id: '2' }],
      shelves: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      itemLocations: [{ id: 'one' }],
    } as unknown as StockroomBootstrap;

    expect(buildViewerStats(bootstrap)).toEqual({
      floors: 2,
      shelves: 3,
      mappedItems: 1,
    });
  });

  it('builds admin stats from the scene model', () => {
    const scene = {
      metadata: { sceneVersion: 1, sceneObjects: [], cameraPresets: {}, snapGrid: 0.25, appearance: { viewerBackground: '', adminBackground: '', canvasBorder: '', shadowColor: '' } },
      entities: [
        { kind: 'shelf' },
        { kind: 'shelf' },
        { kind: 'cashier_counter' },
        { kind: 'entrance' },
      ],
      entitiesByFloor: {},
    } as unknown as SceneModel;

    const stats = buildAdminStats(scene, { floors: [{ id: '1' }, { id: '2' }] } as unknown as StockroomBootstrap);
    expect(stats.map((entry) => entry.total)).toEqual([2, 1, 1, 2]);
  });
});
