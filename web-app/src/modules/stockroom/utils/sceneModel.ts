import type {
  SceneEntity,
  SceneEntityPatch,
  SceneLayoutMetadata,
  SceneMetadataObject,
  SceneModel,
  StockroomAisle,
  StockroomBootstrap,
  StockroomFloor,
  StockroomLayout,
  StockroomShelf,
  StockroomZone,
  Vec2,
  Vec3,
} from '../types';

export const DEFAULT_SNAP_GRID = 0.25;
export const ROTATION_STEP_DEGREES = 15;

const DEFAULT_APPEARANCE = {
  viewerBackground: '#f7f5f0',
  adminBackground: '#315481',
  canvasBorder: 'rgba(148, 163, 184, 0.18)',
  shadowColor: 'rgba(15, 23, 42, 0.16)',
};

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeVec2(value: unknown, fallback: Vec2): Vec2 {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  return {
    x: toNumber((value as Vec2).x, fallback.x),
    y: toNumber((value as Vec2).y, fallback.y),
  };
}

function normalizeVec3(value: unknown, fallback: Vec3): Vec3 {
  if (!value || typeof value !== 'object') {
    return fallback;
  }

  return {
    x: toNumber((value as Vec3).x, fallback.x),
    y: toNumber((value as Vec3).y, fallback.y),
    z: toNumber((value as Vec3).z, fallback.z),
  };
}

function buildWallDefaults(floor: StockroomFloor): SceneMetadataObject[] {
  const width = floor.width || 18;
  const depth = floor.depth || 16;
  const wallHeight = 2.8;
  const thickness = 0.24;
  const centerX = width / 2;
  const centerY = depth / 2;

  return [
    {
      id: `wall-${floor.floorNumber}-north`,
      kind: 'wall',
      floorNumber: floor.floorNumber,
      label: 'North Wall',
      position: { x: centerX, y: 0.12 },
      rotation: 0,
      size: { x: width, y: wallHeight, z: thickness },
      style: { color: '#0e131d', accentColor: '#232c3d' },
      locked: false,
    },
    {
      id: `wall-${floor.floorNumber}-south`,
      kind: 'wall',
      floorNumber: floor.floorNumber,
      label: 'South Wall',
      position: { x: centerX, y: depth - 0.12 },
      rotation: 0,
      size: { x: width, y: wallHeight, z: thickness },
      style: { color: '#0e131d', accentColor: '#232c3d' },
      locked: false,
    },
    {
      id: `wall-${floor.floorNumber}-west`,
      kind: 'wall',
      floorNumber: floor.floorNumber,
      label: 'West Wall',
      position: { x: 0.12, y: centerY },
      rotation: 90,
      size: { x: depth, y: wallHeight, z: thickness },
      style: { color: '#0e131d', accentColor: '#232c3d' },
      locked: false,
    },
    {
      id: `wall-${floor.floorNumber}-east`,
      kind: 'wall',
      floorNumber: floor.floorNumber,
      label: 'East Wall',
      position: { x: width - 0.12, y: centerY },
      rotation: 90,
      size: { x: depth, y: wallHeight, z: thickness },
      style: { color: '#0e131d', accentColor: '#232c3d' },
      locked: false,
    },
  ];
}

function buildDefaultSceneObjects(bootstrap: StockroomBootstrap): SceneMetadataObject[] {
  const layout = bootstrap.activeLayout;
  const firstFloor = bootstrap.floors.find((floor) => floor.floorNumber === 1) ?? bootstrap.floors[0];
  const defaults = bootstrap.floors.flatMap(buildWallDefaults);

  bootstrap.floors.forEach((floor) => {
    const anchor = floor.floorNumber === 1
      ? layout?.staircaseFloor1Anchor ?? { x: floor.width * 0.22, y: floor.depth * 0.2 }
      : layout?.staircaseFloor2Anchor ?? { x: floor.width * 0.22, y: floor.depth * 0.2 };

    defaults.push({
      id: `stairs-${floor.floorNumber}`,
      kind: 'stairs',
      floorNumber: floor.floorNumber,
      label: 'Main Staircase',
      position: normalizeVec2(anchor, { x: floor.width * 0.22, y: floor.depth * 0.2 }),
      rotation: 0,
      size: { x: 2.4, y: 1.3, z: 3.1 },
      style: { color: '#d7b58d', accentColor: '#f6d0a0', glowColor: '#f6d0a0' },
      locked: true,
    });
  });

  if (firstFloor) {
    defaults.push(
      {
        id: 'entrance-main',
        kind: 'entrance',
        floorNumber: 1,
        label: 'Main Entrance',
        position: { x: firstFloor.width * 0.72, y: Math.max(firstFloor.depth - 0.55, 0.5) },
        rotation: 0,
        size: { x: 2.2, y: 0.12, z: 0.55 },
        style: { color: '#ff3347', accentColor: '#ff7381', glowColor: '#ff7381' },
      },
      {
        id: 'cashier-counter-main',
        kind: 'cashier_counter',
        floorNumber: 1,
        label: 'Cashier Counter',
        position: { x: firstFloor.width * 0.76, y: firstFloor.depth * 0.74 },
        rotation: 0,
        size: { x: 2.5, y: 1.15, z: 0.95 },
        style: { color: '#111827', accentColor: '#fb7185' },
      },
      {
        id: 'comfort-room-main',
        kind: 'comfort_room',
        floorNumber: 1,
        label: 'Comfort Room',
        position: { x: firstFloor.width * 0.18, y: firstFloor.depth * 0.54 },
        rotation: 0,
        size: { x: 3.6, y: 2.4, z: 3.2 },
        style: { color: '#111827', accentColor: '#94a3b8' },
      },
      {
        id: 'comfort-room-door',
        kind: 'door',
        floorNumber: 1,
        label: 'Comfort Room Door',
        position: { x: firstFloor.width * 0.31, y: firstFloor.depth * 0.66 },
        rotation: 90,
        size: { x: 0.18, y: 2.1, z: 0.95 },
        style: { color: '#e6edf7', accentColor: '#7dd3fc' },
      },
    );
  }

  return defaults;
}

function normalizeSceneObject(object: unknown): SceneMetadataObject | null {
  if (!object || typeof object !== 'object') {
    return null;
  }

  const record = object as Partial<SceneMetadataObject>;
  const fallbackSize = record.kind === 'wall'
    ? { x: 3, y: 2.8, z: 0.24 }
    : record.kind === 'stairs'
      ? { x: 2.4, y: 1.3, z: 3.1 }
      : { x: 2.4, y: 1.2, z: 1.4 };

  if (!record.id || !record.kind) {
    return null;
  }

  return {
    id: String(record.id),
    kind: record.kind,
    floorNumber: toNumber(record.floorNumber, 1),
    label: String(record.label || record.kind),
    position: normalizeVec2(record.position, { x: 4, y: 4 }),
    rotation: toNumber(record.rotation, 0),
    size: normalizeVec3(record.size, fallbackSize),
    style: record.style ?? {},
    linkedResourceId: record.linkedResourceId ?? null,
    locked: Boolean(record.locked),
  };
}

export function extractSceneMetadata(layout: StockroomLayout | null, bootstrap: StockroomBootstrap): SceneLayoutMetadata {
  const metadataRecord = (layout?.metadata ?? {}) as Partial<SceneLayoutMetadata>;
  const rawObjects = Array.isArray(metadataRecord.sceneObjects)
    ? metadataRecord.sceneObjects.map(normalizeSceneObject).filter(Boolean) as SceneMetadataObject[]
    : [];

  const sceneObjects = rawObjects.length > 0 ? rawObjects : buildDefaultSceneObjects(bootstrap);
  const hasStairsFloor1 = sceneObjects.some((object) => object.kind === 'stairs' && object.floorNumber === 1);
  const hasStairsFloor2 = sceneObjects.some((object) => object.kind === 'stairs' && object.floorNumber === 2);

  if (!hasStairsFloor1 || !hasStairsFloor2) {
    const stairsDefaults = buildDefaultSceneObjects(bootstrap).filter((object) => object.kind === 'stairs');
    stairsDefaults.forEach((stair) => {
      const hasFloorStair = sceneObjects.some((object) => object.kind === 'stairs' && object.floorNumber === stair.floorNumber);
      if (!hasFloorStair) {
        sceneObjects.push(stair);
      }
    });
  }

  return {
    sceneVersion: toNumber(metadataRecord.sceneVersion, 1),
    sceneObjects,
    cameraPresets: metadataRecord.cameraPresets ?? {},
    snapGrid: toNumber(metadataRecord.snapGrid, DEFAULT_SNAP_GRID),
    appearance: {
      ...DEFAULT_APPEARANCE,
      ...(metadataRecord.appearance ?? {}),
    },
  };
}

export function snapValue(value: number, grid = DEFAULT_SNAP_GRID) {
  if (!grid) {
    return value;
  }
  return Math.round(value / grid) * grid;
}

export function snapPosition(position: Vec2, grid = DEFAULT_SNAP_GRID): Vec2 {
  return {
    x: snapValue(position.x, grid),
    y: snapValue(position.y, grid),
  };
}

export function snapRotation(rotation: number, step = ROTATION_STEP_DEGREES) {
  return Math.round(rotation / step) * step;
}

export function buildSceneModel(
  bootstrap: StockroomBootstrap | null,
  metadata: SceneLayoutMetadata | null,
  overrides: Record<string, SceneEntityPatch> = {},
): SceneModel {
  if (!bootstrap || !metadata) {
    return {
      metadata: {
        sceneVersion: 1,
        sceneObjects: [],
        cameraPresets: {},
        snapGrid: DEFAULT_SNAP_GRID,
        appearance: DEFAULT_APPEARANCE,
      },
      entities: [],
      entitiesByFloor: {},
    };
  }

  const zoneEntities: SceneEntity[] = bootstrap.zones.map((zone) => {
    const floor = bootstrap.floors.find((entry) => entry.id === zone.floorId);
    const zoneCenterX = zone.positionX + zone.width / 2;
    const floorMidpoint = (floor?.width ?? 18) / 2;
    const fallbackColor = zoneCenterX <= floorMidpoint ? '#dcc9b3' : '#d5ceec';

    return {
      id: zone.id,
      entityKey: `zone:${zone.id}`,
      kind: 'zone_overlay',
      source: 'canonical',
      floorNumber: floor?.floorNumber ?? 1,
      floorId: zone.floorId,
      position: { x: zoneCenterX, y: zone.positionY + (zone.depth / 2) },
      rotation: 0,
      size: { x: zone.width, y: 0.04, z: zone.depth },
      label: zone.name,
      style: {
        zoneColor: zone.colorHex || fallbackColor,
        opacity: 0.32,
        accentColor: zone.colorHex || fallbackColor,
      },
      linkedResourceId: zone.id,
      resourceType: 'zone',
      locked: false,
    };
  });

  const shelfEntities: SceneEntity[] = bootstrap.shelves.map((shelf) => ({
    id: shelf.id,
    entityKey: `shelf:${shelf.id}`,
    kind: 'shelf',
    source: 'canonical',
    floorNumber: bootstrap.floors.find((floor) => floor.id === shelf.floorId)?.floorNumber ?? 1,
    floorId: shelf.floorId,
    position: { x: shelf.positionX, y: shelf.positionY },
    rotation: shelf.rotation ?? 0,
    size: { x: shelf.width, y: shelf.height, z: shelf.depth },
    label: shelf.code || shelf.name,
    style: {
      color: '#0b1017',
      accentColor: '#4f5d75',
      variant: (shelf.metadata?.sceneVariant as '2-bay' | '3-bay' | undefined) ?? (shelf.width > 3 ? '3-bay' : '2-bay'),
      roughness: 0.88,
      metalness: 0.04,
    },
    linkedResourceId: shelf.id,
    resourceType: 'shelf',
  }));

  const metadataEntities: SceneEntity[] = metadata.sceneObjects.map((object) => ({
    id: object.id,
    entityKey: `${object.kind}:${object.id}`,
    kind: object.kind,
    source: 'metadata',
    floorNumber: object.floorNumber,
    floorId: bootstrap.floors.find((floor) => floor.floorNumber === object.floorNumber)?.id ?? null,
    position: object.position,
    rotation: object.rotation,
    size: object.size,
    label: object.label,
    style: object.style ?? {},
    linkedResourceId: object.linkedResourceId ?? null,
    locked: Boolean(object.locked),
  }));

  const entities = [...zoneEntities, ...metadataEntities, ...shelfEntities].map((entity) => {
    const override = overrides[entity.entityKey];
    if (!override) {
      return entity;
    }

    return {
      ...entity,
      ...override,
      position: override.position ?? entity.position,
      size: override.size ?? entity.size,
      style: { ...entity.style, ...(override.style ?? {}) },
      floorNumber: override.floorNumber ?? entity.floorNumber,
      rotation: override.rotation ?? entity.rotation,
      label: override.label ?? entity.label,
    };
  });

  const entitiesByFloor = entities.reduce<Record<number, SceneEntity[]>>((groups, entity) => {
    groups[entity.floorNumber] = [...(groups[entity.floorNumber] ?? []), entity];
    return groups;
  }, {});

  return {
    metadata,
    entities,
    entitiesByFloor,
  };
}

export function updateMetadataObject(
  metadata: SceneLayoutMetadata,
  entityKey: string,
  patch: SceneEntityPatch,
): SceneLayoutMetadata {
  const [kind, rawId] = entityKey.split(':');
  const objectId = rawId ?? entityKey;

  return {
    ...metadata,
    sceneObjects: metadata.sceneObjects.map((object) => {
      if (object.id !== objectId || object.kind !== kind) {
        return object;
      }

      return {
        ...object,
        position: patch.position ?? object.position,
        rotation: patch.rotation ?? object.rotation,
        size: patch.size ?? object.size,
        label: patch.label ?? object.label,
        floorNumber: patch.floorNumber ?? object.floorNumber,
        style: {
          ...(object.style ?? {}),
          ...(patch.style ?? {}),
        },
      };
    }),
  };
}

export function removeMetadataObject(metadata: SceneLayoutMetadata, entityKey: string): SceneLayoutMetadata {
  const [kind, rawId] = entityKey.split(':');
  const objectId = rawId ?? entityKey;

  return {
    ...metadata,
    sceneObjects: metadata.sceneObjects.filter((object) => !(object.id === objectId && object.kind === kind)),
  };
}

function nextObjectLabel(kind: SceneMetadataObject['kind'], count: number) {
  const labelMap: Record<SceneMetadataObject['kind'], string> = {
    shelf: 'Shelf',
    wall: 'Wall',
    door: 'Door',
    stairs: 'Staircase',
    comfort_room: 'Comfort Room',
    cashier_counter: 'Cashier Counter',
    entrance: 'Entrance',
  };

  return `${labelMap[kind]} ${count}`;
}

export function createMetadataObject(
  kind: SceneMetadataObject['kind'],
  floorNumber: number,
  bootstrap: StockroomBootstrap,
  metadata: SceneLayoutMetadata,
  options: Partial<SceneMetadataObject> = {},
): SceneMetadataObject {
  const floor = bootstrap.floors.find((candidate) => candidate.floorNumber === floorNumber) ?? bootstrap.floors[0];
  const currentCount = metadata.sceneObjects.filter((object) => object.kind === kind).length + 1;
  const defaultPosition = {
    x: floor ? floor.width * 0.5 : 8,
    y: floor ? floor.depth * 0.5 : 8,
  };

  const baseObject: Record<SceneMetadataObject['kind'], Omit<SceneMetadataObject, 'id' | 'floorNumber' | 'label'>> = {
    wall: {
      kind: 'wall',
      position: defaultPosition,
      rotation: 0,
      size: { x: 3.8, y: 2.8, z: 0.24 },
      style: { color: '#0b1020', accentColor: '#243245' },
      locked: false,
    },
    door: {
      kind: 'door',
      position: defaultPosition,
      rotation: 0,
      size: { x: 0.24, y: 2.1, z: 1.1 },
      style: { color: '#dbeafe', accentColor: '#38bdf8' },
      locked: false,
    },
    stairs: {
      kind: 'stairs',
      position: defaultPosition,
      rotation: 0,
      size: { x: 2.4, y: 1.3, z: 3.1 },
      style: { color: '#d8b382', accentColor: '#f6d0a0', glowColor: '#f6d0a0' },
      locked: true,
    },
    comfort_room: {
      kind: 'comfort_room',
      position: defaultPosition,
      rotation: 0,
      size: { x: 3.4, y: 2.4, z: 3 },
      style: { color: '#111827', accentColor: '#94a3b8' },
      locked: false,
    },
    cashier_counter: {
      kind: 'cashier_counter',
      position: defaultPosition,
      rotation: 0,
      size: { x: 2.4, y: 1.12, z: 0.95 },
      style: { color: '#111827', accentColor: '#38bdf8' },
      locked: false,
    },
    entrance: {
      kind: 'entrance',
      position: defaultPosition,
      rotation: 0,
      size: { x: 2.2, y: 0.12, z: 0.55 },
      style: { color: '#f43f5e', accentColor: '#fb7185', glowColor: '#fb7185' },
      locked: false,
    },
    shelf: {
      kind: 'shelf',
      position: defaultPosition,
      rotation: 0,
      size: { x: 2.8, y: 2.2, z: 0.95 },
      style: { color: '#080b13', accentColor: '#60a5fa', variant: '2-bay' },
      locked: false,
    },
  };

  const template = baseObject[kind];
  return {
    id: options.id ?? `${kind}-${Date.now().toString(36)}-${currentCount}`,
    floorNumber,
    label: options.label ?? nextObjectLabel(kind, currentCount),
    ...template,
    ...options,
    position: normalizeVec2(options.position, template.position),
    size: normalizeVec3(options.size, template.size),
    rotation: toNumber(options.rotation, template.rotation),
    style: {
      ...(template.style ?? {}),
      ...(options.style ?? {}),
    },
  };
}

export function addMetadataObject(metadata: SceneLayoutMetadata, object: SceneMetadataObject): SceneLayoutMetadata {
  return {
    ...metadata,
    sceneObjects: [...metadata.sceneObjects, object],
  };
}

export function buildLayoutPayload(layout: StockroomLayout, metadata: SceneLayoutMetadata) {
  const stairFloor1 = metadata.sceneObjects.find((object) => object.kind === 'stairs' && object.floorNumber === 1);
  const stairFloor2 = metadata.sceneObjects.find((object) => object.kind === 'stairs' && object.floorNumber === 2);

  return {
    layoutId: layout.id,
    name: layout.name,
    staircaseFloor1Anchor: stairFloor1?.position ?? layout.staircaseFloor1Anchor,
    staircaseFloor2Anchor: stairFloor2?.position ?? layout.staircaseFloor2Anchor,
    cameraSettings: layout.cameraSettings ?? {},
    metadata: {
      ...layout.metadata,
      sceneVersion: metadata.sceneVersion,
      sceneObjects: metadata.sceneObjects,
      cameraPresets: metadata.cameraPresets,
      snapGrid: metadata.snapGrid,
      appearance: metadata.appearance,
    },
  };
}

export function getFloorByNumber(bootstrap: StockroomBootstrap | null, floorNumber: number) {
  return bootstrap?.floors.find((floor) => floor.floorNumber === floorNumber) ?? null;
}

function pointWithinZone(zone: StockroomZone, point: Vec2) {
  return point.x >= zone.positionX
    && point.x <= zone.positionX + zone.width
    && point.y >= zone.positionY
    && point.y <= zone.positionY + zone.depth;
}

function distanceToSegment(point: Vec2, start: Vec2, end: Vec2) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;

  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / ((dx * dx) + (dy * dy))));
  const projected = {
    x: start.x + (t * dx),
    y: start.y + (t * dy),
  };

  return Math.hypot(point.x - projected.x, point.y - projected.y);
}

export function resolveShelfAssociations(
  bootstrap: StockroomBootstrap,
  floorNumber: number,
  position: Vec2,
): { floor: StockroomFloor | null; zone: StockroomZone | null; aisle: StockroomAisle | null } {
  const floor = getFloorByNumber(bootstrap, floorNumber);
  if (!floor) {
    return { floor: null, zone: null, aisle: null };
  }

  const floorZones = bootstrap.zones.filter((zone) => zone.floorId === floor.id);
  const zone = floorZones.find((candidate) => pointWithinZone(candidate, position))
    ?? floorZones.sort((left, right) => {
      const leftDistance = Math.hypot(position.x - (left.positionX + (left.width / 2)), position.y - (left.positionY + (left.depth / 2)));
      const rightDistance = Math.hypot(position.x - (right.positionX + (right.width / 2)), position.y - (right.positionY + (right.depth / 2)));
      return leftDistance - rightDistance;
    })[0]
    ?? null;

  const floorAisles = bootstrap.aisles.filter((aisle) => aisle.floorId === floor.id);
  const aisleCandidates = zone ? floorAisles.filter((aisle) => aisle.zoneId === zone.id) : floorAisles;
  const aisle = aisleCandidates.sort((left, right) => {
    const leftDistance = distanceToSegment(position, { x: left.startX, y: left.startY }, { x: left.endX, y: left.endY });
    const rightDistance = distanceToSegment(position, { x: right.startX, y: right.startY }, { x: right.endX, y: right.endY });
    return leftDistance - rightDistance;
  })[0] ?? null;

  return { floor, zone, aisle };
}

export function buildShelfPayload(bootstrap: StockroomBootstrap, shelf: StockroomShelf, entity: SceneEntity) {
  const associations = resolveShelfAssociations(bootstrap, entity.floorNumber, entity.position);

  return {
    id: shelf.id,
    layoutId: shelf.layoutId,
    floorId: associations.floor?.id ?? shelf.floorId,
    zoneId: associations.zone?.id ?? shelf.zoneId,
    aisleId: associations.aisle?.id ?? shelf.aisleId,
    code: shelf.code,
    name: entity.label || shelf.name,
    shelfType: shelf.shelfType,
    positionX: entity.position.x,
    positionY: entity.position.y,
    rotation: snapRotation(entity.rotation),
    width: entity.size.x,
    depth: entity.size.z,
    height: entity.size.y,
    accessSide: shelf.accessSide,
    metadata: {
      ...(shelf.metadata ?? {}),
      sceneVariant: entity.style.variant ?? shelf.metadata?.sceneVariant ?? '2-bay',
    },
  };
}

export function buildZonePayload(zone: StockroomZone, entity: SceneEntity) {
  return {
    id: zone.id,
    layoutId: zone.layoutId,
    floorId: zone.floorId,
    code: zone.code,
    name: entity.label || zone.name,
    positionX: entity.position.x - (entity.size.x / 2),
    positionY: entity.position.y - (entity.size.z / 2),
    width: entity.size.x,
    depth: entity.size.z,
    colorHex: entity.style.zoneColor ?? zone.colorHex,
    metadata: zone.metadata ?? {},
  };
}
