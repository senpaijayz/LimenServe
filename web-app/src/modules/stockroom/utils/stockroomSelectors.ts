import type {
  AdminStatsCard,
  SceneEntity,
  SceneModel,
  StockroomBootstrap,
  StockroomItemDetails,
  StockroomMasterItem,
  StockroomSearchResult,
} from '../types';

export function buildFloorTabs(bootstrap: StockroomBootstrap | null) {
  return (bootstrap?.floors ?? [])
    .slice()
    .sort((left, right) => left.floorNumber - right.floorNumber)
    .map((floor) => ({
      value: floor.floorNumber,
      label: `Floor ${floor.floorNumber}`,
      subtitle: floor.name,
    }));
}

export function summarizeRoute(itemDetails: StockroomItemDetails | null) {
  if (!itemDetails) {
    return '';
  }

  return [
    `Floor ${itemDetails.location.floor.floorNumber}`,
    itemDetails.location.zone.code,
    itemDetails.location.shelf.code,
    `L${itemDetails.location.level.levelNumber}`,
    `S${itemDetails.location.slot.slotNumber}`,
  ].join(' | ');
}

export function formatMatchLabel(result: StockroomSearchResult) {
  const matchMap: Record<string, string> = {
    sku: 'SKU exact',
    sku_partial: 'SKU',
    part_code: 'Part code exact',
    part_code_partial: 'Part code',
    item_name: 'Name',
    keyword: 'Keyword',
  };

  if (!result.matchedBy) {
    return 'Mapped';
  }

  return matchMap[result.matchedBy] ?? 'Mapped';
}

export function countSceneEntities(scene: SceneModel, kind: SceneEntity['kind']) {
  return scene.entities.filter((entity) => entity.kind === kind).length;
}

export function buildViewerStats(bootstrap: StockroomBootstrap | null) {
  return {
    floors: bootstrap?.floors.length ?? 0,
    shelves: bootstrap?.shelves.length ?? 0,
    mappedItems: bootstrap?.itemLocations.length ?? 0,
  };
}

export function buildAdminStats(scene: SceneModel, bootstrap: StockroomBootstrap | null): AdminStatsCard[] {
  return [
    {
      id: 'shelves',
      label: 'Shelves',
      total: countSceneEntities(scene, 'shelf'),
    },
    {
      id: 'counters',
      label: 'Counters',
      total: countSceneEntities(scene, 'cashier_counter'),
    },
    {
      id: 'entrances',
      label: 'Entrances',
      total: scene.entities.filter((entity) => entity.kind === 'entrance' || entity.kind === 'door').length,
    },
    {
      id: 'floors',
      label: 'Floors',
      total: bootstrap?.floors.length ?? 0,
    },
  ];
}

export function filterMasterItems(items: StockroomMasterItem[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return items;
  }

  return items.filter((item) => {
    const keywordText = (item.keywords ?? []).join(' ').toLowerCase();
    return [
      item.name,
      item.sku,
      item.partCode,
      item.category,
      item.brand,
      item.modelName,
      keywordText,
    ].some((value) => String(value ?? '').toLowerCase().includes(normalized));
  });
}
