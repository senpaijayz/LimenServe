export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface StockroomLayout {
  id: string;
  storeId: string | null;
  name: string;
  versionNumber: number;
  status: string;
  staircaseFloor1Anchor: Vec2;
  staircaseFloor2Anchor: Vec2;
  cameraSettings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  publishedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface StockroomFloor {
  id: string;
  layoutId: string;
  floorNumber: number;
  name: string;
  width: number;
  depth: number;
  elevation: number;
  entryAnchor: Vec2;
  metadata: Record<string, unknown>;
}

export interface StockroomZone {
  id: string;
  layoutId: string;
  floorId: string;
  code: string;
  name: string;
  positionX: number;
  positionY: number;
  width: number;
  depth: number;
  colorHex: string;
  metadata: Record<string, unknown>;
}

export interface StockroomAisle {
  id: string;
  layoutId: string;
  floorId: string;
  zoneId: string;
  code: string;
  name: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  walkwayWidth: number;
  metadata: Record<string, unknown>;
}

export type StockroomShelfType = '2_level' | '4_level';

export interface StockroomShelf {
  id: string;
  layoutId: string;
  floorId: string;
  zoneId: string;
  aisleId: string;
  code: string;
  name: string;
  shelfType: StockroomShelfType;
  positionX: number;
  positionY: number;
  rotation: number;
  width: number;
  depth: number;
  height: number;
  accessSide: string;
  metadata: Record<string, unknown>;
}

export interface StockroomShelfLevel {
  id: string;
  shelfId: string;
  levelNumber: number;
  elevation: number;
  metadata: Record<string, unknown>;
}

export interface StockroomShelfSlot {
  id: string;
  shelfLevelId: string;
  slotNumber: number;
  slotLabel: string;
  positionX: number;
  width: number;
  metadata: Record<string, unknown>;
}

export interface StockroomSearchResult {
  productId: string;
  sku: string;
  name: string;
  modelName?: string | null;
  category?: string | null;
  sourceCategory?: string | null;
  classification?: Record<string, unknown> | null;
  brand?: string | null;
  partCode?: string | null;
  keywords: string[];
  quantity: number;
  matchedBy?: string | null;
  floor: { id: string; floorNumber: number; name: string };
  zone: { id: string; code: string; name: string };
  aisle: { id: string; code: string; name: string };
  shelf: { id: string; code: string; name: string; shelfType: string; positionX: number; positionY: number; width: number };
  level: { id: string; levelNumber: number; elevation: number };
  slot: { id: string; slotNumber: number; slotLabel: string; positionX: number; width: number };
  layoutId?: string | null;
  itemLocationId?: string | null;
}

export interface StockroomBootstrap {
  store: { id?: string; code?: string; name?: string } | null;
  activeLayout: StockroomLayout | null;
  floors: StockroomFloor[];
  zones: StockroomZone[];
  aisles: StockroomAisle[];
  shelves: StockroomShelf[];
  shelfLevels: StockroomShelfLevel[];
  shelfSlots: StockroomShelfSlot[];
  itemLocations: StockroomSearchResult[];
  permissions: {
    canManage: boolean;
    role: string;
  };
}

export interface StockroomItemDetails {
  item: {
    productId: string;
    sku: string;
    name: string;
    category?: string | null;
    sourceCategory?: string | null;
    classification?: Record<string, unknown> | null;
    partCode?: string | null;
    keywords: string[];
    quantity: number;
  };
  location: {
    floor: StockroomFloor;
    zone: StockroomZone;
    aisle: StockroomAisle;
    shelf: StockroomShelf;
    level: StockroomShelfLevel;
    slot: StockroomShelfSlot;
  };
  currentFloor: number;
  targetFloor: number;
  requiresFloorChange: boolean;
  steps: string[];
  segmentsByFloor: Record<string, Vec2[]>;
  targetShelfId: string;
  targetSlotId: string;
  targetSlot: {
    floorNumber: number;
    x: number;
    y: number;
    levelNumber: number;
    slotNumber: number;
  } | null;
}

export interface StockroomLayoutSummary {
  id: string;
  name: string;
  versionNumber: number;
  status: string;
  publishedAt?: string | null;
  updatedAt?: string | null;
}

export interface StockroomMasterItem {
  productId: string;
  sku: string;
  name: string;
  category?: string | null;
  sourceCategory?: string | null;
  classification?: Record<string, unknown> | null;
  modelName?: string | null;
  brand?: string | null;
  partCode?: string | null;
  keywords: string[];
  isActive: boolean;
  locationId?: string | null;
  floorId?: string | null;
  zoneId?: string | null;
  aisleId?: string | null;
  shelfId?: string | null;
  shelfLevelId?: string | null;
  shelfSlotId?: string | null;
}

export type SceneObjectKind =
  | 'shelf'
  | 'wall'
  | 'door'
  | 'stairs'
  | 'comfort_room'
  | 'cashier_counter'
  | 'entrance'
  | 'zone_overlay';

export type SceneEntitySource = 'canonical' | 'metadata';

export interface SceneObjectStyle {
  color?: string;
  accentColor?: string;
  opacity?: number;
  metalness?: number;
  roughness?: number;
  lineColor?: string;
  glowColor?: string;
  labelColor?: string;
  zoneColor?: string;
  variant?: '2-bay' | '3-bay';
}

export interface SceneMetadataObject {
  id: string;
  kind: Exclude<SceneObjectKind, 'zone_overlay'>;
  floorNumber: number;
  label: string;
  position: Vec2;
  rotation: number;
  size: Vec3;
  style?: SceneObjectStyle;
  linkedResourceId?: string | null;
  locked?: boolean;
}

export interface SceneCameraPreset {
  position: [number, number, number];
  target: [number, number, number];
}

export interface SceneAppearance {
  viewerBackground: string;
  adminBackground: string;
  canvasBorder: string;
  shadowColor: string;
}

export interface SceneLayoutMetadata {
  sceneVersion: number;
  sceneObjects: SceneMetadataObject[];
  cameraPresets: Record<string, SceneCameraPreset>;
  snapGrid: number;
  appearance: SceneAppearance;
}

export interface SceneEntity {
  id: string;
  entityKey: string;
  kind: SceneObjectKind;
  source: SceneEntitySource;
  floorNumber: number;
  floorId?: string | null;
  position: Vec2;
  rotation: number;
  size: Vec3;
  label: string;
  style: SceneObjectStyle;
  linkedResourceId?: string | null;
  resourceType?: 'shelf' | 'zone' | null;
  locked?: boolean;
}

export interface SceneModel {
  metadata: SceneLayoutMetadata;
  entities: SceneEntity[];
  entitiesByFloor: Record<number, SceneEntity[]>;
}

export type SceneEntityPatch = Partial<Pick<SceneEntity, 'position' | 'rotation' | 'size' | 'label' | 'floorNumber' | 'style'>>;

export interface AdminStatsCard {
  id: string;
  label: string;
  total: number;
}
