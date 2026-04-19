import { ContactShadows, Line, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  Color,
  Group,
  InstancedMesh,
  Object3D,
  Vector3,
} from 'three';
import type { SceneEntity, StockroomItemDetails, Vec2 } from '../types';

export interface SceneThemePalette {
  background: string;
  stage: string;
  stageEdge: string;
  floorBase: string;
  floorTint: string;
  floorLine: string;
  ceiling: string;
  ceilingTrim: string;
  wallPanel: string;
  wallTrim: string;
  glass: string;
  glassGlow: string;
  metal: string;
  metalSoft: string;
  wood: string;
  woodDark: string;
  counterBase: string;
  counterTop: string;
  lightWarm: string;
  lightCool: string;
  shelfGlow: string;
  routeCore: string;
  routeGlow: string;
  routeHalo: string;
  targetCore: string;
  targetGlow: string;
  selection: string;
  label: string;
  zoneLeft: string;
  zoneRight: string;
  zoneLabel: string;
  shadow: string;
}

export const VIEWER_SCENE_THEME: SceneThemePalette = {
  background: '#020617', // slate-950
  stage: '#0f172a', // charcoal
  stageEdge: '#1e293b', // navy
  floorBase: '#121926',
  floorTint: '#1e293b',
  floorLine: '#334155',
  ceiling: '#020617',
  ceilingTrim: '#1e293b',
  wallPanel: '#0f172a',
  wallTrim: '#334155',
  glass: '#cbd5e1',
  glassGlow: '#f97316', // automotive warm orange
  metal: '#475569',
  metalSoft: '#64748b',
  wood: '#94a3b8',
  woodDark: '#64748b',
  counterBase: '#1e293b',
  counterTop: '#334155',
  lightWarm: '#ffd1a4',
  lightCool: '#e2e8f0',
  shelfGlow: '#ea580c', // warm orange
  routeCore: '#f97316',
  routeGlow: '#fb923c',
  routeHalo: '#fdba74',
  targetCore: '#ea580c',
  targetGlow: '#f97316',
  selection: '#f97316',
  label: '#f8fafc',
  zoneLeft: '#f97316',
  zoneRight: '#ea580c',
  zoneLabel: '#ffffff',
  shadow: '#050a12',
};

export const ADMIN_SCENE_THEME: SceneThemePalette = {
  background: '#050b1d',
  stage: '#111827',
  stageEdge: '#1f2937',
  floorBase: '#1f2937',
  floorTint: '#374151',
  floorLine: '#4b5563',
  ceiling: '#030712',
  ceilingTrim: '#1f2937',
  wallPanel: '#111827',
  wallTrim: '#4b5563',
  glass: '#9ca3af',
  glassGlow: '#38bdf8', // Keep admin glowing cyan so it's distinct
  metal: '#374151',
  metalSoft: '#4b5563',
  wood: '#9ca3af',
  woodDark: '#6b7280',
  counterBase: '#1f2937',
  counterTop: '#374151',
  lightWarm: '#ffd1a4',
  lightCool: '#e2e8f0',
  shelfGlow: '#0ea5e9',
  routeCore: '#38bdf8',
  routeGlow: '#7dd3fc',
  routeHalo: '#bae6fd',
  targetCore: '#0284c7',
  targetGlow: '#0ea5e9',
  selection: '#38bdf8',
  label: '#ffffff',
  zoneLeft: '#38bdf8',
  zoneRight: '#0ea5e9',
  zoneLabel: '#ffffff',
  shadow: '#030610',
};

const DUMMY = new Object3D();
const DEG_TO_RAD = Math.PI / 180;

function hashCode(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function createSeededRandom(seed: number) {
  let current = seed % 2147483647;
  if (current <= 0) {
    current += 2147483646;
  }

  return () => {
    current = (current * 16807) % 2147483647;
    return (current - 1) / 2147483646;
  };
}

function rotationToRadians(rotation: number) {
  return (-rotation || 0) * DEG_TO_RAD;
}

function useSmoothScale(groupRef: RefObject<Group | null>, active: boolean, scale = 1.04) {
  const activeScale = useMemo(() => new Vector3(scale, scale, scale), [scale]);
  const idleScale = useMemo(() => new Vector3(1, 1, 1), []);

  useFrame((_state, delta) => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.scale.lerp(active ? activeScale : idleScale, 1 - Math.exp(-delta * 10));
  });
}

function resolveZoneColor(entity: SceneEntity, palette: SceneThemePalette) {
  if (entity.style.zoneColor) {
    return entity.style.zoneColor;
  }

  return entity.position.x < entity.size.x ? palette.zoneLeft : palette.zoneRight;
}

function FloorSurface({
  width,
  depth,
  palette,
}: {
  width: number;
  depth: number;
  palette: SceneThemePalette;
}) {
  const tileColumns = Math.max(Math.floor(width * 1.6), 18);
  const tileRows = Math.max(Math.floor(depth * 1.6), 18);
  const accentStrips = useMemo(
    () => [width * 0.18, width * 0.5, width * 0.82].map((x, index) => ({
      x,
      width: index === 1 ? 0.14 : 0.1,
    })),
    [width],
  );

  return (
    <group>
      <mesh receiveShadow position={[width / 2, -0.22, depth / 2]}>
        <boxGeometry args={[width + 4.6, 0.54, depth + 4.2]} />
        <meshStandardMaterial color={palette.stage} roughness={0.98} metalness={0.02} />
      </mesh>

      <mesh receiveShadow position={[width / 2, -0.05, depth / 2]}>
        <boxGeometry args={[width + 1.2, 0.18, depth + 1.2]} />
        <meshStandardMaterial color={palette.stageEdge} roughness={0.85} metalness={0.12} />
      </mesh>

      <mesh receiveShadow position={[width / 2, 0, depth / 2]}>
        <boxGeometry args={[width, 0.08, depth]} />
        <meshPhysicalMaterial
          color={palette.floorBase}
          roughness={0.16}
          metalness={0.08}
          reflectivity={0.65}
          clearcoat={0.92}
          clearcoatRoughness={0.12}
        />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position={[width / 2, 0.045, depth / 2]}>
        <planeGeometry args={[width, depth, tileColumns, tileRows]} />
        <meshBasicMaterial color={palette.floorLine} transparent opacity={0.22} wireframe />
      </mesh>

      {accentStrips.map((strip) => (
        <mesh
          key={`strip-${strip.x}`}
          position={[strip.x, 0.02, depth * 0.52]}
          rotation-x={-Math.PI / 2}
        >
          <planeGeometry args={[strip.width, depth * 0.72]} />
          <meshBasicMaterial color={palette.glassGlow} transparent opacity={0.08} />
        </mesh>
      ))}

      <gridHelper
        args={[Math.max(width, depth), Math.max(tileColumns, tileRows), palette.floorLine, palette.floorLine]}
        position={[width / 2, 0.04, depth / 2]}
      />
    </group>
  );
}

function StoreShell({
  width,
  depth,
  palette,
  theme,
}: {
  width: number;
  depth: number;
  palette: SceneThemePalette;
  theme: 'viewer' | 'admin';
}) {
  const wallThickness = 0.16;
  const wallHeight = 4.1;
  const ceilingDepth = depth * 0.72;
  const lightRows = useMemo(() => {
    const xPositions = [width * 0.18, width * 0.38, width * 0.58, width * 0.78];
    const zPositions = [depth * 0.22, depth * 0.42, depth * 0.6];
    return zPositions.flatMap((z) => xPositions.map((x) => ({ x, z })));
  }, [depth, width]);

  return (
    <group>
      <mesh position={[width / 2, wallHeight / 2, 0.08]} receiveShadow castShadow>
        <boxGeometry args={[width, wallHeight, wallThickness]} />
        <meshPhysicalMaterial color={palette.wallPanel} roughness={0.62} metalness={0.04} />
      </mesh>

      <mesh position={[0.08, wallHeight / 2, depth / 2]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, wallHeight, depth]} />
        <meshPhysicalMaterial color={palette.wallPanel} roughness={0.58} metalness={0.04} />
      </mesh>

      <mesh position={[width - 0.08, wallHeight * 0.38, depth * 0.3]} receiveShadow castShadow>
        <boxGeometry args={[wallThickness, wallHeight * 0.76, depth * 0.52]} />
        <meshPhysicalMaterial
          color={palette.wallPanel}
          roughness={0.56}
          metalness={0.04}
          transparent
          opacity={theme === 'admin' ? 0.54 : 0.32}
        />
      </mesh>

      <mesh position={[width * 0.12, wallHeight / 2, depth - 0.08]} receiveShadow castShadow>
        <boxGeometry args={[width * 0.24, wallHeight, wallThickness]} />
        <meshPhysicalMaterial color={palette.wallPanel} roughness={0.6} metalness={0.04} />
      </mesh>
      <mesh position={[width * 0.88, wallHeight / 2, depth - 0.08]} receiveShadow castShadow>
        <boxGeometry args={[width * 0.24, wallHeight, wallThickness]} />
        <meshPhysicalMaterial color={palette.wallPanel} roughness={0.6} metalness={0.04} />
      </mesh>

      <mesh position={[width / 2, wallHeight - 0.16, depth - 0.08]} receiveShadow>
        <boxGeometry args={[width * 0.52, 0.28, wallThickness]} />
        <meshStandardMaterial color={palette.wallTrim} roughness={0.42} metalness={0.48} />
      </mesh>

      <mesh position={[width / 2, wallHeight - 0.18, ceilingDepth / 2]} receiveShadow>
        <boxGeometry args={[width, 0.2, ceilingDepth]} />
        <meshStandardMaterial color={palette.ceiling} roughness={0.72} metalness={0.06} />
      </mesh>

      {lightRows.map((light) => (
        <group key={`ceiling-light-${light.x}-${light.z}`}>
          <mesh position={[light.x, wallHeight - 0.28, light.z]}>
            <boxGeometry args={[2.4, 0.06, 0.74]} />
            <meshStandardMaterial
              color={palette.lightCool}
              emissive={palette.glassGlow}
              emissiveIntensity={1.4}
              roughness={0.14}
              metalness={0.08}
            />
          </mesh>
          <mesh position={[light.x, wallHeight - 0.21, light.z]}>
            <boxGeometry args={[2.56, 0.04, 0.9]} />
            <meshBasicMaterial color={palette.glassGlow} transparent opacity={0.12} />
          </mesh>
        </group>
      ))}

      <mesh position={[width / 2, 2.35, depth - 0.18]}>
        <boxGeometry args={[width * 0.56, 3.2, 0.04]} />
        <meshPhysicalMaterial
          color={palette.glass}
          transparent
          opacity={0.18}
          transmission={0.88}
          roughness={0.06}
          metalness={0.05}
        />
      </mesh>

      <mesh position={[width * 0.44, 1.64, depth - 0.15]} castShadow>
        <boxGeometry args={[1.2, 2.9, 0.06]} />
        <meshPhysicalMaterial
          color={palette.glass}
          transparent
          opacity={0.26}
          transmission={0.9}
          roughness={0.04}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[width * 0.56, 1.64, depth - 0.15]} castShadow>
        <boxGeometry args={[1.2, 2.9, 0.06]} />
        <meshPhysicalMaterial
          color={palette.glass}
          transparent
          opacity={0.26}
          transmission={0.9}
          roughness={0.04}
          metalness={0.04}
        />
      </mesh>

      <mesh position={[width / 2, 0.06, depth - 0.44]}>
        <boxGeometry args={[3.2, 0.08, 1.18]} />
        <meshPhysicalMaterial
          color={palette.floorTint}
          roughness={0.3}
          metalness={0.06}
          clearcoat={0.64}
          clearcoatRoughness={0.12}
        />
      </mesh>

      <mesh position={[width / 2, 2.62, 0.1]}>
        <boxGeometry args={[width * 0.42, 0.26, 0.14]} />
        <meshStandardMaterial color={palette.wallTrim} emissive={palette.ceilingTrim} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

function ProductInstances({
  seedKey,
  width,
  depth,
  levels,
  bays,
  ambient = false,
}: {
  seedKey: string;
  width: number;
  depth: number;
  levels: number;
  bays: number;
  ambient?: boolean;
}) {
  const count = levels * bays * (ambient ? 4 : 7);
  const meshRef = useRef<InstancedMesh | null>(null);

  useLayoutEffect(() => {
    if (!meshRef.current) {
      return;
    }

    const random = createSeededRandom(hashCode(seedKey));
    const color = new Color();
    const tones = ['#f8fafc', '#cbd5e1', '#d97706', '#94a3b8', '#1e293b', '#b45309', '#e2e8f0']; // Whites, Slate grays, Warning oranges
    let instance = 0;

    for (let levelIndex = 0; levelIndex < levels; levelIndex += 1) {
      const shelfY = -1 + ((levelIndex + 1) / (levels + 1)) * 2;
      for (let bayIndex = 0; bayIndex < bays; bayIndex += 1) {
        const bayCenter = -width / 2 + ((bayIndex + 0.5) * width) / bays;
        const itemsPerBay = ambient ? 4 : 7;
        for (let itemIndex = 0; itemIndex < itemsPerBay; itemIndex += 1) {
          const itemWidth = 0.16 + random() * 0.18;
          const itemHeight = 0.14 + random() * 0.32;
          const itemDepth = 0.18 + random() * 0.16;

          DUMMY.position.set(
            bayCenter + (random() - 0.5) * ((width / bays) - 0.36),
            shelfY + itemHeight * 0.18,
            (random() - 0.5) * (depth - 0.26),
          );
          DUMMY.rotation.set((random() - 0.5) * 0.04, (random() - 0.5) * 0.34, (random() - 0.5) * 0.05);
          DUMMY.scale.set(itemWidth, itemHeight, itemDepth);
          DUMMY.updateMatrix();
          meshRef.current.setMatrixAt(instance, DUMMY.matrix);
          color.set(tones[Math.floor(random() * tones.length)]);
          meshRef.current.setColorAt(instance, color);
          instance += 1;
        }
      }
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [ambient, bays, count, depth, levels, seedKey, width]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial vertexColors roughness={0.48} metalness={0.06} />
    </instancedMesh>
  );
}

function ShelfVisual({
  seedKey,
  width,
  height,
  depth,
  rotation,
  position,
  palette,
  selected,
  target,
  showLabel,
  label,
  variant,
  ambient = false,
}: {
  seedKey: string;
  width: number;
  height: number;
  depth: number;
  rotation: number;
  position: [number, number, number];
  palette: SceneThemePalette;
  selected: boolean;
  target: boolean;
  showLabel: boolean;
  label: string;
  variant?: '2-bay' | '3-bay';
  ambient?: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  const levels = height >= 2.3 ? 4 : 3;
  const bays = variant === '3-bay' || width >= 3.2 ? 3 : 2;
  const glowStrength = ambient ? 0.08 : target ? 0.58 : selected ? 0.22 : 0.12;
  useSmoothScale(groupRef, selected || target, 1.045);

  return (
    <group ref={groupRef} position={position} rotation-y={rotationToRadians(rotation)}>
      <mesh position={[0, -height / 2 + 0.06, 0]} receiveShadow castShadow>
        <boxGeometry args={[width + 0.08, 0.12, depth + 0.08]} />
        <meshStandardMaterial color={palette.metalSoft} roughness={0.48} metalness={0.52} />
      </mesh>

      {[-1, 1].flatMap((xSide) => [-1, 1].map((zSide) => (
        <mesh
          key={`${seedKey}-post-${xSide}-${zSide}`}
          position={[
            xSide * (width / 2 - 0.08),
            0,
            zSide * (depth / 2 - 0.06),
          ]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.08, height, 0.08]} />
          <meshStandardMaterial color={palette.metal} roughness={0.34} metalness={0.9} />
        </mesh>
      )))}

      <mesh position={[0, 0, -depth / 2 + 0.04]} receiveShadow castShadow>
        <boxGeometry args={[width - 0.08, height - 0.12, 0.06]} />
        <meshStandardMaterial color={palette.metalSoft} roughness={0.5} metalness={0.36} />
      </mesh>

      {Array.from({ length: levels }).map((_, levelIndex) => {
        const y = -height / 2 + 0.22 + (levelIndex * (height - 0.38)) / Math.max(levels - 1, 1);
        return (
          <Fragment key={`${seedKey}-shelf-${levelIndex}`}>
            <mesh position={[0, y, 0]} castShadow receiveShadow>
              <boxGeometry args={[width - 0.02, 0.09, depth]} />
              <meshStandardMaterial color={palette.wood} roughness={0.68} metalness={0.04} />
            </mesh>
            <mesh position={[0, y + 0.04, depth / 2 - 0.04]}>
              <boxGeometry args={[width - 0.18, 0.015, 0.03]} />
              <meshStandardMaterial
                color={palette.lightCool}
                emissive={palette.shelfGlow}
                emissiveIntensity={ambient ? 0.18 : 0.45}
                roughness={0.12}
              />
            </mesh>
          </Fragment>
        );
      })}

      {Array.from({ length: bays - 1 }).map((_, index) => {
        const x = -width / 2 + ((index + 1) * width) / bays;
        return (
          <mesh key={`${seedKey}-divider-${index}`} position={[x, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.06, height - 0.22, depth - 0.1]} />
            <meshStandardMaterial color={palette.metalSoft} roughness={0.46} metalness={0.42} />
          </mesh>
        );
      })}

      <mesh position={[0, height / 2 + 0.04, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.1, 0.14, depth + 0.08]} />
        <meshStandardMaterial
          color={ambient ? palette.metalSoft : palette.metal}
          emissive={target ? palette.targetGlow : palette.shelfGlow}
          emissiveIntensity={glowStrength}
          roughness={0.28}
          metalness={0.84}
        />
      </mesh>

      <mesh position={[0, height / 2 + 0.22, depth / 2 + 0.04]} castShadow>
        <boxGeometry args={[Math.max(width * 0.72, 1.4), 0.18, 0.06]} />
        <meshStandardMaterial
          color="#f4fbff"
          emissive={target ? palette.targetGlow : palette.shelfGlow}
          emissiveIntensity={ambient ? 0.16 : target ? 0.62 : 0.22}
          roughness={0.16}
          metalness={0.08}
        />
      </mesh>

      <ProductInstances
        seedKey={seedKey}
        width={width}
        depth={depth}
        levels={levels}
        bays={bays}
        ambient={ambient}
      />

      {showLabel ? (
        <Text
          position={[0, height / 2 + 0.34, depth / 2 + 0.08]}
          fontSize={0.17}
          color={target ? palette.targetCore : palette.label}
          anchorX="center"
          anchorY="middle"
          maxWidth={width * 0.84}
        >
          {label}
        </Text>
      ) : null}
    </group>
  );
}

function SupplementalShelfClusters({
  width,
  depth,
  entities,
  palette,
}: {
  width: number;
  depth: number;
  entities: SceneEntity[];
  palette: SceneThemePalette;
}) {
  const supplemental = useMemo(() => {
    const occupied = entities.filter((entity) => entity.kind !== 'zone_overlay');
    const liveShelfCount = occupied.filter((entity) => entity.kind === 'shelf').length;
    if (liveShelfCount >= 8) {
      return [];
    }

    const candidates = [
      { x: width * 0.26, z: depth * 0.26, rotation: 0, shelfWidth: 2.8 },
      { x: width * 0.46, z: depth * 0.26, rotation: 0, shelfWidth: 2.8 },
      { x: width * 0.66, z: depth * 0.26, rotation: 0, shelfWidth: 2.8 },
      { x: width * 0.26, z: depth * 0.44, rotation: 0, shelfWidth: 3.2 },
      { x: width * 0.46, z: depth * 0.44, rotation: 0, shelfWidth: 3.2 },
      { x: width * 0.66, z: depth * 0.44, rotation: 0, shelfWidth: 3.2 },
      { x: width * 0.24, z: depth * 0.62, rotation: 90, shelfWidth: 2.8 },
      { x: width * 0.78, z: depth * 0.62, rotation: 90, shelfWidth: 2.8 },
    ];

    const isFree = (candidate: { x: number; z: number; shelfWidth: number }) => occupied.every((entity) => {
      const dx = candidate.x - entity.position.x;
      const dz = candidate.z - entity.position.y;
      const distance = Math.hypot(dx, dz);
      const entityRadius = Math.max(entity.size.x, entity.size.z) * 0.58;
      return distance > Math.max(candidate.shelfWidth, 2.4) + entityRadius;
    });

    const needed = Math.max(0, 8 - liveShelfCount);
    return candidates.filter(isFree).slice(0, needed);
  }, [depth, entities, width]);

  if (!supplemental.length) {
    return null;
  }

  return (
    <group>
      {supplemental.map((shelf, index) => (
        <ShelfVisual
          key={`supplemental-shelf-${shelf.x}-${shelf.z}`}
          seedKey={`ambient-${index}`}
          width={shelf.shelfWidth}
          height={2.34}
          depth={0.96}
          rotation={shelf.rotation}
          position={[shelf.x, 2.34 / 2, shelf.z]}
          palette={palette}
          selected={false}
          target={false}
          showLabel={false}
          label={`Ambient Shelf ${index + 1}`}
          variant={shelf.shelfWidth > 3 ? '3-bay' : '2-bay'}
          ambient
        />
      ))}
    </group>
  );
}

export function FloorStage({
  width,
  depth,
  palette,
  theme,
  ambientEntities = [],
  children,
  onPlaneMove,
  onPlaneUp,
}: {
  width: number;
  depth: number;
  palette: SceneThemePalette;
  theme: 'viewer' | 'admin';
  ambientEntities?: SceneEntity[];
  children: ReactNode;
  onPlaneMove?: (event: any) => void;
  onPlaneUp?: () => void;
}) {
  return (
    <group>
      <FloorSurface width={width} depth={depth} palette={palette} />
      <StoreShell width={width} depth={depth} palette={palette} theme={theme} />
      <SupplementalShelfClusters width={width} depth={depth} entities={ambientEntities} palette={palette} />

      <mesh
        rotation-x={-Math.PI / 2}
        position={[width / 2, 0.04, depth / 2]}
        onPointerMove={onPlaneMove}
        onPointerUp={() => onPlaneUp?.()}
      >
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      {children}

      <ContactShadows
        position={[width / 2, -0.01, depth / 2]}
        opacity={theme === 'admin' ? 0.48 : 0.32}
        scale={Math.max(width, depth) * 1.26}
        blur={2.8}
        far={32}
        color={palette.shadow}
      />
    </group>
  );
}

export function buildCurvedRoute(points: Vec2[], elevation = 0.14) {
  if (points.length < 2) {
    return points.map((point) => [point.x, elevation, point.y] as [number, number, number]);
  }

  const samples: Array<[number, number, number]> = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const start = index === 0 ? current : points[index - 1];
    const end = index === points.length - 2 ? next : points[index + 2];

    for (let step = 0; step < 16; step += 1) {
      const t = step / 16;
      const t2 = t * t;
      const t3 = t2 * t;
      const x = 0.5 * (
        (2 * current.x)
        + (-start.x + next.x) * t
        + ((2 * start.x) - (5 * current.x) + (4 * next.x) - end.x) * t2
        + (-start.x + (3 * current.x) - (3 * next.x) + end.x) * t3
      );
      const z = 0.5 * (
        (2 * current.y)
        + (-start.y + next.y) * t
        + ((2 * start.y) - (5 * current.y) + (4 * next.y) - end.y) * t2
        + (-start.y + (3 * current.y) - (3 * next.y) + end.y) * t3
      );
      samples.push([x, elevation, z]);
    }
  }

  const last = points[points.length - 1];
  samples.push([last.x, elevation, last.y]);
  return samples;
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
    <group>
      <Line points={points} color={palette.routeHalo} lineWidth={14} transparent opacity={0.12} />
      <Line points={points} color={palette.routeGlow} lineWidth={8} transparent opacity={0.32} />
      <Line points={points} color={palette.routeCore} lineWidth={3.4} />
    </group>
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
  const groupRef = useRef<Group | null>(null);

  useFrame(({ clock }) => {
    if (!groupRef.current) {
      return;
    }

    const pulse = 1 + Math.sin(clock.elapsedTime * 3.4) * 0.08;
    groupRef.current.scale.setScalar(pulse);
  });

  if (!targetSlot) {
    return null;
  }

  const elevation = 0.16 + (details?.location.level.elevation ?? 0.34);

  return (
    <group ref={groupRef} position={[targetSlot.x, elevation, targetSlot.y]}>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.12, 0]}>
        <ringGeometry args={[0.34, 0.58, 40]} />
        <meshBasicMaterial color={palette.targetGlow} transparent opacity={0.42} />
      </mesh>
      <mesh position={[0, -0.1, 0]}>
        <cylinderGeometry args={[0.52, 0.52, 0.04, 42]} />
        <meshStandardMaterial color="#ffffff" roughness={0.18} metalness={0.28} transparent opacity={0.28} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[0.44, 0.16, 0.44]} />
        <meshStandardMaterial
          color={palette.targetCore}
          emissive={palette.targetGlow}
          emissiveIntensity={1.22}
          roughness={0.26}
          metalness={0.08}
        />
      </mesh>
      <pointLight color={palette.targetGlow} intensity={1.7} distance={4.6} decay={2} position={[0, 0.3, 0]} />
    </group>
  );
}

function ZoneOverlay({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.02);
  const zoneColor = resolveZoneColor(entity, palette);

  return (
    <group ref={groupRef} position={[entity.position.x, 0.06, entity.position.y]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[entity.size.x, entity.size.z]} />
        <meshStandardMaterial
          color={zoneColor}
          transparent
          opacity={selected ? 0.3 : entity.style.opacity ?? 0.16}
          roughness={0.92}
          metalness={0.02}
        />
      </mesh>
      <Text
        position={[0, 0.03, 0]}
        rotation-x={-Math.PI / 2}
        fontSize={0.34}
        color={palette.zoneLabel}
        anchorX="center"
        anchorY="middle"
        maxWidth={entity.size.x * 0.72}
      >
        {entity.label}
      </Text>
    </group>
  );
}

function ShelfUnit({
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
  return (
    <ShelfVisual
      seedKey={entity.entityKey}
      width={entity.size.x}
      height={entity.size.y}
      depth={entity.size.z}
      rotation={entity.rotation}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      palette={palette}
      selected={selected}
      target={target}
      showLabel={showLabel}
      label={entity.label}
      variant={entity.style.variant}
    />
  );
}

function CounterUnit({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.03);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshPhysicalMaterial
          color={palette.counterBase}
          roughness={0.36}
          metalness={0.04}
          clearcoat={0.42}
          clearcoatRoughness={0.12}
        />
      </mesh>
      <mesh position={[0, entity.size.y / 2 + 0.08, 0]} castShadow receiveShadow>
        <boxGeometry args={[entity.size.x + 0.14, 0.16, entity.size.z + 0.18]} />
        <meshPhysicalMaterial color={palette.counterTop} roughness={0.54} metalness={0.06} />
      </mesh>
      <mesh position={[0, entity.size.y * 0.12, entity.size.z / 2 + 0.05]}>
        <boxGeometry args={[entity.size.x * 0.82, 0.16, 0.04]} />
        <meshStandardMaterial color="#f0fbff" emissive={palette.shelfGlow} emissiveIntensity={0.8} roughness={0.18} />
      </mesh>
      <mesh position={[-entity.size.x * 0.16, entity.size.y / 2 + 0.44, -0.18]} castShadow>
        <boxGeometry args={[0.72, 0.5, 0.08]} />
        <meshStandardMaterial color="#101928" roughness={0.28} metalness={0.22} />
      </mesh>
      <mesh position={[entity.size.x * 0.12, entity.size.y / 2 + 0.45, 0.04]} castShadow>
        <boxGeometry args={[0.62, 0.44, 0.08]} />
        <meshStandardMaterial color="#111827" roughness={0.28} metalness={0.22} />
      </mesh>
      <mesh position={[entity.size.x * 0.28, entity.size.y / 2 + 0.12, -entity.size.z * 0.18]}>
        <cylinderGeometry args={[0.08, 0.08, 0.24, 16]} />
        <meshStandardMaterial color={palette.metal} roughness={0.26} metalness={0.88} />
      </mesh>
      <Text
        position={[0, entity.size.y / 2 + 0.32, entity.size.z / 2 + 0.08]}
        fontSize={0.16}
        color={palette.label}
        anchorX="center"
        anchorY="middle"
      >
        {entity.label}
      </Text>
    </group>
  );
}

function StaircaseUnit({
  entity,
  selected,
  palette,
  onActivate,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
  onActivate?: () => void;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.04);
  const steps = 9;
  const stepDepth = entity.size.z / steps;
  const stepHeight = entity.size.y / steps;

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, 0, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
      onClick={(event) => {
        event.stopPropagation();
        onActivate?.();
      }}
    >
      <mesh position={[0, 0.06, 0]} receiveShadow castShadow>
        <boxGeometry args={[entity.size.x + 0.12, 0.12, entity.size.z + 0.12]} />
        <meshStandardMaterial color={palette.metalSoft} roughness={0.44} metalness={0.42} />
      </mesh>

      {Array.from({ length: steps }).map((_, index) => {
        const height = stepHeight * (index + 1);
        const z = -entity.size.z / 2 + (index * stepDepth) + (stepDepth / 2);
        return (
          <mesh key={`${entity.entityKey}-step-${index}`} position={[0, height / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[entity.size.x, height, stepDepth * 0.94]} />
            <meshStandardMaterial
              color={index % 2 === 0 ? palette.wood : palette.woodDark}
              roughness={0.72}
              metalness={0.03}
            />
          </mesh>
        );
      })}

      <mesh position={[-entity.size.x / 2 + 0.08, entity.size.y * 0.56, 0]} castShadow>
        <boxGeometry args={[0.06, entity.size.y * 1.02, entity.size.z]} />
        <meshStandardMaterial color={palette.metal} roughness={0.28} metalness={0.86} />
      </mesh>
      <mesh position={[entity.size.x / 2 - 0.08, entity.size.y * 0.56, 0]} castShadow>
        <boxGeometry args={[0.06, entity.size.y * 1.02, entity.size.z]} />
        <meshStandardMaterial color={palette.metal} roughness={0.28} metalness={0.86} />
      </mesh>
      <mesh position={[-entity.size.x / 2 + 0.16, entity.size.y * 0.74, 0]} castShadow>
        <boxGeometry args={[0.04, entity.size.y * 0.58, entity.size.z]} />
        <meshPhysicalMaterial color={palette.glass} transparent opacity={0.26} transmission={0.92} roughness={0.08} />
      </mesh>
      <mesh position={[entity.size.x / 2 - 0.16, entity.size.y * 0.74, 0]} castShadow>
        <boxGeometry args={[0.04, entity.size.y * 0.58, entity.size.z]} />
        <meshPhysicalMaterial color={palette.glass} transparent opacity={0.26} transmission={0.92} roughness={0.08} />
      </mesh>

      <Text
        position={[0, entity.size.y + 0.3, 0]}
        fontSize={0.16}
        color={palette.label}
        anchorX="center"
        anchorY="middle"
      >
        {entity.label}
      </Text>
    </group>
  );
}

function DoorUnit({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.02);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
    >
      <mesh castShadow>
        <boxGeometry args={[entity.size.x + 0.08, entity.size.y + 0.08, 0.08]} />
        <meshStandardMaterial color={palette.metal} roughness={0.32} metalness={0.82} />
      </mesh>
      <mesh position={[-entity.size.x * 0.18, 0, 0.01]} castShadow>
        <boxGeometry args={[Math.max(entity.size.x * 0.42, 0.34), entity.size.y - 0.1, Math.max(entity.size.z * 0.18, 0.05)]} />
        <meshPhysicalMaterial
          color={palette.glass}
          transparent
          opacity={0.26}
          transmission={0.96}
          roughness={0.04}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[entity.size.x * 0.18, 0, 0.01]} castShadow>
        <boxGeometry args={[Math.max(entity.size.x * 0.42, 0.34), entity.size.y - 0.1, Math.max(entity.size.z * 0.18, 0.05)]} />
        <meshPhysicalMaterial
          color={palette.glass}
          transparent
          opacity={0.26}
          transmission={0.96}
          roughness={0.04}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0, Math.max(entity.size.z * 0.14, 0.03)]}>
        <boxGeometry args={[entity.size.x + 0.18, entity.size.y + 0.14, 0.03]} />
        <meshStandardMaterial
          color={palette.glassGlow}
          emissive={palette.glassGlow}
          emissiveIntensity={selected ? 0.44 : 0.12}
          roughness={0.16}
          metalness={0.32}
        />
      </mesh>
    </group>
  );
}

function EntranceUnit({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.03);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, 0.08, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
    >
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[entity.size.x + 0.4, entity.size.z + 0.6]} />
        <meshBasicMaterial color={palette.targetGlow} transparent opacity={selected ? 0.28 : 0.12} />
      </mesh>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, Math.max(entity.size.y, 0.12), entity.size.z]} />
        <meshStandardMaterial
          color={palette.targetCore}
          emissive={palette.targetGlow}
          emissiveIntensity={selected ? 1.05 : 0.56}
          roughness={0.24}
          metalness={0.06}
        />
      </mesh>
    </group>
  );
}

function RoomUnit({
  entity,
  selected,
  palette,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.03);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshPhysicalMaterial color={palette.wallPanel} roughness={0.68} metalness={0.04} clearcoat={0.05} />
      </mesh>
      <mesh position={[0, entity.size.y / 2 + 0.04, 0]} castShadow>
        <boxGeometry args={[entity.size.x + 0.08, 0.1, entity.size.z + 0.08]} />
        <meshStandardMaterial color={palette.wallTrim} roughness={0.26} metalness={0.28} />
      </mesh>
      <Text
        position={[0, entity.size.y / 2 + 0.28, 0]}
        fontSize={0.15}
        color={palette.label}
        anchorX="center"
        anchorY="middle"
      >
        {entity.label}
      </Text>
    </group>
  );
}

function WallUnit({
  entity,
  selected,
  palette,
  editable,
}: {
  entity: SceneEntity;
  selected: boolean;
  palette: SceneThemePalette;
  editable: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothScale(groupRef, selected, 1.02);
  const label = entity.label.toLowerCase();
  const cutaway = !editable && (label.includes('south') || label.includes('east'));
  const softened = !editable && !cutaway && (label.includes('west') || label.includes('north'));
  const height = entity.size.y * (cutaway ? 0.34 : softened ? 0.74 : 1);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, height / 2, entity.position.y]}
      rotation-y={rotationToRadians(entity.rotation)}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, height, entity.size.z]} />
        <meshPhysicalMaterial
          color={cutaway ? palette.wallTrim : palette.wallPanel}
          roughness={0.7}
          metalness={0.02}
          transparent={cutaway || softened}
          opacity={cutaway ? 0.14 : softened ? 0.58 : 1}
        />
      </mesh>
      <mesh position={[0, height / 2 - 0.04, 0]}>
        <boxGeometry args={[entity.size.x + 0.04, 0.08, entity.size.z + 0.04]} />
        <meshStandardMaterial
          color={palette.ceilingTrim}
          emissive={palette.ceilingTrim}
          emissiveIntensity={cutaway ? 0.2 : selected ? 0.36 : 0.08}
        />
      </mesh>
    </group>
  );
}

function SelectionMarker({ entity, palette }: { entity: SceneEntity; palette: SceneThemePalette }) {
  const radius = Math.max(entity.size.x, entity.size.z) * 0.38;

  return (
    <group position={[entity.position.x, 0.1, entity.position.y]} rotation-y={rotationToRadians(entity.rotation)}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[radius, radius + 0.09, 48]} />
        <meshBasicMaterial color={palette.selection} transparent opacity={0.88} />
      </mesh>
      <pointLight color={palette.selection} intensity={0.84} distance={3.8} decay={2} position={[0, 0.25, 0]} />
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
  const showShelfLabel = editable || entity.kind === 'shelf';

  return (
    <>
      {entity.kind === 'zone_overlay' ? <ZoneOverlay entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'shelf' ? <ShelfUnit entity={entity} selected={selected} target={targetShelf} palette={palette} showLabel={showShelfLabel} /> : null}
      {entity.kind === 'cashier_counter' ? <CounterUnit entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'stairs' ? <StaircaseUnit entity={entity} selected={selected} palette={palette} onActivate={onActivate} /> : null}
      {entity.kind === 'door' ? <DoorUnit entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'entrance' ? <EntranceUnit entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'comfort_room' ? <RoomUnit entity={entity} selected={selected} palette={palette} /> : null}
      {entity.kind === 'wall' ? <WallUnit entity={entity} selected={selected} palette={palette} editable={editable} /> : null}
      {selected ? <SelectionMarker entity={entity} palette={palette} /> : null}
    </>
  );
}
