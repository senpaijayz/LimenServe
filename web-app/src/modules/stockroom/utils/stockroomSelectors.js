export function groupLayoutByFloor(bootstrap) {
  const floors = bootstrap?.floors ?? [];
  const zones = bootstrap?.zones ?? [];
  const aisles = bootstrap?.aisles ?? [];
  const shelves = bootstrap?.shelves ?? [];
  const shelfLevels = bootstrap?.shelfLevels ?? [];
  const shelfSlots = bootstrap?.shelfSlots ?? [];

  return floors.map((floor) => ({
    ...floor,
    zones: zones.filter((zone) => zone.floorId === floor.id),
    aisles: aisles.filter((aisle) => aisle.floorId === floor.id),
    shelves: shelves.filter((shelf) => shelf.floorId === floor.id),
    shelfLevels: shelfLevels.filter((level) => shelves.some((shelf) => shelf.id === level.shelfId && shelf.floorId === floor.id)),
    shelfSlots: shelfSlots.filter((slot) => shelfLevels.some((level) => level.id === slot.shelfLevelId && shelves.some((shelf) => shelf.id === level.shelfId && shelf.floorId === floor.id))),
  }));
}

export function buildFloorOptions(bootstrap) {
  return (bootstrap?.floors ?? []).map((floor) => ({
    value: floor.floorNumber,
    label: `Floor ${floor.floorNumber}`,
  }));
}

export function summarizeRoute(itemDetails) {
  if (!itemDetails) {
    return '';
  }

  const parts = [
    `Floor ${itemDetails.location.floor.floorNumber}`,
    `${itemDetails.location.zone.code}`,
    `${itemDetails.location.shelf.code}`,
    `L${itemDetails.location.level.levelNumber}`,
    `S${itemDetails.location.slot.slotNumber}`,
  ];

  return parts.join(' | ');
}

export function filterMasterItems(items, query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return items;
  }

  return items.filter((item) => (
    String(item.name || '').toLowerCase().includes(normalizedQuery)
    || String(item.sku || '').toLowerCase().includes(normalizedQuery)
    || String(item.partCode || '').toLowerCase().includes(normalizedQuery)
    || String(item.category || '').toLowerCase().includes(normalizedQuery)
    || String(item.modelName || '').toLowerCase().includes(normalizedQuery)
    || (item.keywords ?? []).join(' ').toLowerCase().includes(normalizedQuery)
  ));
}
