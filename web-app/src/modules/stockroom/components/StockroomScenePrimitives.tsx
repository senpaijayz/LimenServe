import { ContactShadows, Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { CatmullRomCurve3, Group, Vector3 } from 'three';
import type { SceneEntity, StockroomItemDetails, Vec2 } from '../types';

export interface SceneThemePalette {
  background: string;
  floorSurface: string;
  floorUnderlay: string;
  floorEdge: string;
  grid: string;
  wall: string;
  shelf: string;
  shelfSecondary: string;
  shelfAccent: string;
  door: string;
  routeCore: string;
  routeGlow: string;
  routeHalo: string;
  targetCore: string;
  targetGlow: string;
  shadow: string;
}

export const VIEWER_SCENE_THEME: SceneThemePalette = {
  background: '#f7f5f0',
  floorSurface: '#edf1f4',
  floorUnderlay: '#d9e0e8',
  floorEdge: '#cfd7e1',
  grid: '#d2dae4',
  wall: '#11161f',
  shelf: '#0b1017',
  shelfSecondary: '#202736',
  shelfAccent: '#4f5d75',
  door: '#e6edf7',
  routeCore: '#33d6ff',
  routeGlow: '#67e8f9',
  routeHalo: '#a5f3fc',
  targetCore: '#ff4242',
  targetGlow: '#ff7a7a',
  shadow: '#e2e8f0',
};

export const ADMIN_SCENE_THEME: SceneThemePalette = {
  background: '#355888',
  floorSurface: '#6d7b8f',
  floorUnderlay: '#607085',
  floorEdge: '#516279',
  grid: '#55657e',
  wall: '#0c121b',
  shelf: '#0b0f18',
  shelfSecondary: '#232b3b',
  shelfAccent: '#5d6c86',
  door: '#d7e3f1',
  routeCore: '#2dd4ff',
  routeGlow: '#74efff',
  routeHalo: '#bbfbff',
  targetCore: '#ff2d3f',
  targetGlow: '#ff6b7a',
  shadow: '#1e293b',
};

function useSmoothScale(groupRef: RefObject<Group | null>, active: boolean) {
  const targetScale = useMemo(() => new Vector3(1.04, 1.04, 1.04), []);
  const normalScale = useMemo(() => new Vector3(1, 1, 1), []);

  useFrame((_state, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.scale.lerp(active ? targetScale : normalScale, 1 - Math.exp(-delta * 11));
  });
}

function resolveZoneColor(entity: SceneEntity) {
  if (entity.style.zoneColor) {
    return entity.style.zoneColor;
  }

  return entity.position.x <= entity.size.x ? '#dcc9b3' : '#d3ccec';
}

export function buildCurvedRoute(points: Vec2[], elevation = 0.18) {
  if (points.length < 2) {
    return points.map((point) => [point.x, elevation, point.y] as [number, number, number]);
  }

  const curve = new CatmullRomCurve3(
    points.map((point) => new Vector3(point.x, elevation, point.y)),
    false,
    'catmullrom',
    0.2,
  );

  return curve.getPoints(Math.max(points.length * 12, 36)).map((point) => (
    [point.x, point.y, point.z] as [number, number, number]
  ));
}

export function FloorStage({
  width,
  depth,
  palette,
  gridDivisions,
  theme,
  children,
  onPlaneMove,
  onPlaneUp,
}: {
  width: number;
  depth: number;
  palette: SceneThemePalette;
  gridDivisions: number;
  theme: 'viewer' | 'admin';
  children: ReactNode;
  onPlaneMove?: (event: any) => void;
  onPlaneUp?: () => void;
}) {
  const centerX = width / 2;
  const centerZ = depth / 2;

  return (
    <group>
      <mesh receiveShadow position={[centerX, -0.18, centerZ]}>
        <boxGeometry args={[width + 3.6, 0.28, depth + 3.1]} />
        <meshStandardMaterial color={palette.floorUnderlay} roughness={0.98} metalness={0.02} />
      </mesh>

      <mesh receiveShadow position={[centerX, -0.035, centerZ]}>
        <boxGeometry args={[width + 0.8, 0.12, depth + 0.8]} />
        <meshStandardMaterial color={palette.floorEdge} roughness={0.95} metalness={0.02} />
      </mesh>

      <mesh receiveShadow position={[centerX, 0, centerZ]}>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshStandardMaterial color={palette.floorSurface} roughness={0.92} metalness={0.04} />
      </mesh>

      <gridHelper
        args={[Math.max(width, depth), gridDivisions, palette.grid, palette.grid]}
        position={[centerX, theme === 'admin' ? 0.05 : 0.041, centerZ]}
      />

      <mesh
        rotation-x={-Math.PI / 2}
        position={[centerX, 0.045, centerZ]}
        onPointerMove={onPlaneMove}
        onPointerUp={() => onPlaneUp?.()}
      >
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {children}

      <ContactShadows
        position={[centerX, -0.03, centerZ]}
        opacity={theme === 'admin' ? 0.42 : 0.2}
        scale={Math.max(width, depth) * 1.2}
        blur={2.1}
        far={24}
        color={palette.shadow}
      />
    </group>
  );
}

export function RouteRibbon({
  points,
  palette,
}: {
  points: Array<[number, number, number]>;
  palette: SceneThemePalette;
}) {
  if (points.length < 2) {
    return null;
  }

  return (
    <>
      <Line points={points} color={palette.routeHalo} lineWidth={11} transparent opacity={0.12} />
      <Line points={points} color={palette.routeGlow} lineWidth={7.2} transparent opacity={0.34} />
      <Line points={points} color={palette.routeCore} lineWidth={3.3} />
    </>
  );
}

export function TargetBeacon({
  targetSlot,
  details,
  palette,
}: {
  targetSlot: StockroomItemDetails['targetSlot'];
  details: StockroomItemDetails | null | undefined;
  palette: SceneThemePalette;
}) {
  if (!targetSlot) {
    return null;
  }

  const elevation = 0.16 + (details?.location.level.elevation ?? 0.42);

  return (
    <group position={[targetSlot.x, elevation, targetSlot.y]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, 0]}>
        <ringGeometry args={[0.32, 0.58, 40]} />
        <meshBasicMaterial color={palette.targetGlow} transparent opacity={0.48} />
      </mesh>
      <mesh position={[0, -0.11, 0]}>
        <cylinderGeometry args={[0.52, 0.52, 0.03, 42]} />
        <meshStandardMaterial color="#ffffff" roughness={0.14} metalness={0.22} transparent opacity={0.42} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[0.42, 0.14, 0.42]} />
        <meshStandardMaterial color={palette.targetCore} emissive={palette.targetGlow} emissiveIntensity={0.92} metalness={0.12} roughness={0.46} />
      </mesh>
      <mesh position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.08, 28, 28]} />
        <meshBasicMaterial color="#fff5f5" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

function ZoneOverlay({ entity, selected }: { entity: SceneEntity; selected: boolean }) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected);
  const zoneColor = resolveZoneColor(entity);

  return (
    <group ref={groupRef} position={[entity.position.x, 0.06, entity.position.y]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[entity.size.x, entity.size.z]} />
        <meshStandardMaterial
          color={zoneColor}
          transparent
          opacity={selected ? 0.48 : entity.style.opacity ?? 0.3}
          roughness={0.85}
          metalness={0.02}
        />
      </mesh>
    </group>
  );
}

function ShelfBody({
  entity,
  selected,
  target,
  palette,
  showLabel,
}: {
  entity: SceneEntity;
  selected: boolean;
  target: boolean;
  palette: SceneThemePalette;
  showLabel: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected || target);
  const dividerCount = entity.style.variant === '3-bay' ? 2 : 1;
  const emissiveIntensity = target ? 0.42 : selected ? 0.18 : 0.02;

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial
          color={entity.style.color || palette.shelf}
          emissive={target ? palette.targetGlow : palette.shelfSecondary}
          emissiveIntensity={emissiveIntensity}
          roughness={0.88}
          metalness={0.08}
        />
      </mesh>

      <mesh position={[0, entity.size.y * 0.47, 0]} castShadow>
        <boxGeometry args={[entity.size.x * 0.96, 0.08, entity.size.z * 0.94]} />
        <meshStandardMaterial color={palette.shelfSecondary} roughness={0.76} />
      </mesh>

      <mesh position={[0, -entity.size.y * 0.47, 0]} receiveShadow>
        <boxGeometry args={[entity.size.x * 0.96, 0.08, entity.size.z * 0.94]} />
        <meshStandardMaterial color="#090d12" roughness={0.94} />
      </mesh>

      {Array.from({ length: dividerCount }).map((_, index) => {
        const x = -entity.size.x / 2 + ((index + 1) * entity.size.x) / (dividerCount + 1);
        return (
          <mesh key={`${entity.entityKey}-divider-${index}`} position={[x, 0, 0]} castShadow>
            <boxGeometry args={[0.07, entity.size.y * 0.94, entity.size.z * 0.9]} />
            <meshStandardMaterial color="#242b38" roughness={0.92} />
          </mesh>
        );
      })}

      {showLabel ? (
        <Text position={[0, entity.size.y / 2 + 0.24, 0]} fontSize={0.18} color="#e2e8f0" anchorX="center" anchorY="middle">
          {entity.label}
        </Text>
      ) : null}
    </group>
  );
}

function BlockObject({
  entity,
  selected,
  color,
  emissive,
  labelColor = '#f8fafc',
  showLabel = false,
}: {
  entity: SceneEntity;
  selected: boolean;
  color: string;
  emissive?: string;
  labelColor?: string;
  showLabel?: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial
          color={entity.style.color || color}
          emissive={selected ? emissive || '#38bdf8' : '#000000'}
          emissiveIntensity={selected ? 0.14 : 0}
          roughness={0.9}
          metalness={0.06}
        />
      </mesh>
      {showLabel ? (
        <Text position={[0, entity.size.y / 2 + 0.2, 0]} fontSize={0.16} color={labelColor} anchorX="center" anchorY="middle">
          {entity.label}
        </Text>
      ) : null}
    </group>
  );
}

function Staircase({
  entity,
  selected,
  onActivate,
}: {
  entity: SceneEntity;
  selected: boolean;
  onActivate?: () => void;
}) {
  const steps = 7;
  const stepDepth = entity.size.z / steps;
  const stepHeight = entity.size.y / steps;
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, 0, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
      onClick={(event) => {
        event.stopPropagation();
        onActivate?.();
      }}
    >
      {Array.from({ length: steps }).map((_, index) => {
        const height = stepHeight * (index + 1);
        const z = (-entity.size.z / 2) + stepDepth * index + stepDepth / 2;
        return (
          <mesh key={`${entity.entityKey}-step-${index}`} position={[0, height / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[entity.size.x, height, stepDepth]} />
            <meshStandardMaterial color="#d9b78e" roughness={0.86} metalness={0.04} />
          </mesh>
        );
      })}

      <mesh position={[0, entity.size.y * 0.42, entity.size.z * 0.08]}>
        <boxGeometry args={[entity.size.x * 0.12, entity.size.y * 0.84, entity.size.z * 0.96]} />
        <meshStandardMaterial color="#4b5563" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Entrance({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, 0.06, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
    >
      <mesh>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial
          color={entity.style.color || palette.targetCore}
          emissive={selected ? palette.targetGlow : palette.targetCore}
          emissiveIntensity={selected ? 0.58 : 0.28}
          roughness={0.36}
        />
      </mesh>
    </group>
  );
}

export function SelectionMarker({ entity }: { entity: SceneEntity }) {
  const radius = Math.max(entity.size.x, entity.size.z) * 0.34;

  return (
    <group position={[entity.position.x, 0.08, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius, radius + 0.09, 48]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.78} />
      </mesh>
    </group>
  );
}

export function SceneEntityMesh({
  entity,
  selected,
  targetShelf,
  editable,
  palette,
  onActivate,
}: {
  entity: SceneEntity;
  selected: boolean;
  targetShelf: boolean;
  editable: boolean;
  palette: SceneThemePalette;
  onActivate?: () => void;
}) {
  return (
    <>
      {entity.kind === 'zone_overlay' ? <ZoneOverlay entity={entity} selected={selected} /> : null}
      {entity.kind === 'shelf' ? (
        <ShelfBody entity={entity} selected={selected} target={targetShelf} palette={palette} showLabel={editable} />
      ) : null}
      {entity.kind === 'wall' ? <BlockObject entity={entity} selected={selected} color={palette.wall} /> : null}
      {entity.kind === 'door' ? <BlockObject entity={entity} selected={selected} color={palette.door} emissive="#7dd3fc" /> : null}
      {entity.kind === 'comfort_room' ? <BlockObject entity={entity} selected={selected} color="#111827" showLabel={editable} /> : null}
      {entity.kind === 'cashier_counter' ? <BlockObject entity={entity} selected={selected} color="#161d28" emissive="#fb7185" showLabel={editable} /> : null}
      {entity.kind === 'entrance' ? <Entrance entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'stairs' ? <Staircase entity={entity} selected={selected} onActivate={onActivate} /> : null}
      {selected ? <SelectionMarker entity={entity} /> : null}
    </>
  );
}
