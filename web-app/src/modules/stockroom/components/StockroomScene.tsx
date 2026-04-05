import {
  ContactShadows,
  Line,
  Text,
  CameraControls,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  type MutableRefObject,
  type RefObject,
  useRef,
  useState,
} from 'react';
import type { Group } from 'three';
import { Plane, Vector3 } from 'three';
import type { SceneEntity, SceneModel, StockroomFloor, StockroomItemDetails, Vec2 } from '../types';
import { DEFAULT_SNAP_GRID, snapPosition, snapRotation } from '../utils/sceneModel';

export interface StockroomSceneHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetCamera: () => void;
}

interface StockroomSceneProps {
  bootstrap: { floors: StockroomFloor[] } | null;
  scene: SceneModel;
  currentFloor: number;
  selectedItemDetails?: StockroomItemDetails | null;
  selectedEntityKey?: string | null;
  editable?: boolean;
  theme?: 'viewer' | 'admin';
  viewMode?: '3d' | '2d';
  onEntitySelect?: (entity: SceneEntity | null) => void;
  onEntityPreview?: (entityKey: string, patch: Partial<SceneEntity>) => void;
  onEntityCommit?: (entity: SceneEntity) => void;
  onFloorSwitch?: (nextFloor: number) => void;
}

type DragState = {
  entityKey: string;
  offset: Vec2;
};

const LIGHT_THEME = {
  background: '#f7f8fc',
  floor: '#eef2f7',
  grid: '#d7dee8',
};

const DARK_THEME = {
  background: '#345888',
  floor: '#677487',
  grid: '#55657e',
};

function buildRoutePoints(points: Vec2[] = [], elevation = 0.2) {
  return points.map((point) => [point.x, elevation, point.y] as [number, number, number]);
}

function useSmoothSelection(groupRef: RefObject<Group | null>, selected: boolean) {
  useFrame((_state, delta) => {
    if (!groupRef.current) {
      return;
    }

    const target = selected ? 1.03 : 1;
    groupRef.current.scale.lerp(new Vector3(target, target, target), 1 - Math.exp(-delta * 10));
  });
}

function ZoneMesh({ entity, isSelected }: { entity: SceneEntity; isSelected: boolean }) {
  const groupRef = useRef<Group | null>(null);
  useSmoothSelection(groupRef, isSelected);
  const color = entity.style.zoneColor || '#d9c5b2';

  return (
    <group ref={groupRef} position={[entity.position.x, 0.03, entity.position.y]}>
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[entity.size.x, entity.size.z]} />
        <meshStandardMaterial color={color} transparent opacity={isSelected ? 0.52 : entity.style.opacity ?? 0.35} />
      </mesh>
    </group>
  );
}

function ShelfMesh({
  entity,
  isSelected,
  isTarget,
  showLabel,
}: {
  entity: SceneEntity;
  isSelected: boolean;
  isTarget: boolean;
  showLabel: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  useSmoothSelection(groupRef, isSelected || isTarget);
  const accent = isTarget ? '#ef4444' : entity.style.accentColor || '#60a5fa';
  const dividerCount = entity.style.variant === '3-bay' ? 2 : 1;

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial
          color={entity.style.color || '#0a0f19'}
          emissive={accent}
          emissiveIntensity={isSelected ? 0.18 : isTarget ? 0.28 : 0.04}
          roughness={entity.style.roughness ?? 0.82}
          metalness={entity.style.metalness ?? 0.08}
        />
      </mesh>
      {Array.from({ length: dividerCount }).map((_, index) => {
        const x = -entity.size.x / 2 + ((index + 1) * entity.size.x) / (dividerCount + 1);
        return (
          <mesh key={`${entity.id}-divider-${index}`} position={[x, 0, 0]} castShadow>
            <boxGeometry args={[0.08, entity.size.y * 0.96, entity.size.z * 0.92]} />
            <meshStandardMaterial color="#1f2937" roughness={0.9} />
          </mesh>
        );
      })}
      {showLabel && (
        <Text
          position={[0, entity.size.y / 2 + 0.18, 0]}
          fontSize={0.22}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
        >
          {entity.label}
        </Text>
      )}
    </group>
  );
}

function WallMesh({ entity, isSelected }: { entity: SceneEntity; isSelected: boolean }) {
  const groupRef = useRef<Group | null>(null);
  useSmoothSelection(groupRef, isSelected);

  return (
    <group
      ref={groupRef}
      position={[entity.position.x, entity.size.y / 2, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
    >
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial color={entity.style.color || '#0b1020'} emissive={isSelected ? '#38bdf8' : '#000000'} emissiveIntensity={isSelected ? 0.1 : 0} roughness={0.92} />
      </mesh>
    </group>
  );
}

function DoorMesh({ entity, isSelected }: { entity: SceneEntity; isSelected: boolean }) {
  return (
    <group position={[entity.position.x, entity.size.y / 2, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh castShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial color={entity.style.color || '#dbeafe'} emissive={isSelected ? '#38bdf8' : '#0ea5e9'} emissiveIntensity={isSelected ? 0.18 : 0.06} />
      </mesh>
    </group>
  );
}

function StairsMesh({ entity, isSelected, onClick }: { entity: SceneEntity; isSelected: boolean; onClick?: () => void }) {
  const steps = 6;
  const stepDepth = entity.size.z / steps;
  const stepHeight = entity.size.y / steps;

  return (
    <group
      position={[entity.position.x, 0, entity.position.y]}
      rotation-y={(-entity.rotation * Math.PI) / 180}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      {Array.from({ length: steps }).map((_, index) => {
        const height = stepHeight * (index + 1);
        const z = (-entity.size.z / 2) + (stepDepth * index) + (stepDepth / 2);
        return (
          <mesh key={`${entity.id}-step-${index}`} position={[0, height / 2, z]} castShadow receiveShadow>
            <boxGeometry args={[entity.size.x, height, stepDepth]} />
            <meshStandardMaterial color={entity.style.color || '#d8b382'} emissive={isSelected ? '#f59e0b' : '#f6d0a0'} emissiveIntensity={isSelected ? 0.22 : 0.05} roughness={0.88} />
          </mesh>
        );
      })}
    </group>
  );
}

function RoomMesh({ entity, isSelected, tone = '#0f172a' }: { entity: SceneEntity; isSelected: boolean; tone?: string }) {
  return (
    <group position={[entity.position.x, entity.size.y / 2, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial color={entity.style.color || tone} emissive={isSelected ? '#38bdf8' : '#000000'} emissiveIntensity={isSelected ? 0.08 : 0} roughness={0.96} />
      </mesh>
      <Text position={[0, entity.size.y / 2 + 0.12, 0]} fontSize={0.22} color="#f8fafc" anchorX="center" anchorY="middle">
        {entity.label}
      </Text>
    </group>
  );
}

function CounterMesh({ entity, isSelected }: { entity: SceneEntity; isSelected: boolean }) {
  return (
    <group position={[entity.position.x, entity.size.y / 2, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial color={entity.style.color || '#0f172a'} emissive={isSelected ? '#38bdf8' : '#2563eb'} emissiveIntensity={isSelected ? 0.16 : 0.08} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, entity.size.z / 2 + 0.03]}>
        <boxGeometry args={[entity.size.x * 0.92, entity.size.y * 0.2, 0.06]} />
        <meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function EntranceMesh({ entity, isSelected }: { entity: SceneEntity; isSelected: boolean }) {
  return (
    <group position={[entity.position.x, 0.08, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh>
        <boxGeometry args={[entity.size.x, entity.size.y, entity.size.z]} />
        <meshStandardMaterial color={entity.style.color || '#ef4444'} emissive={isSelected ? '#fb7185' : '#ef4444'} emissiveIntensity={isSelected ? 0.5 : 0.28} />
      </mesh>
    </group>
  );
}

function SelectionOutline({ entity }: { entity: SceneEntity }) {
  return (
    <group position={[entity.position.x, 0.06, entity.position.y]} rotation-y={(-entity.rotation * Math.PI) / 180}>
      <mesh rotation-x={-Math.PI / 2}>
        <ringGeometry args={[Math.max(entity.size.x, entity.size.z) * 0.34, Math.max(entity.size.x, entity.size.z) * 0.42, 48]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.8} />
      </mesh>
    </group>
  );
}

function EntityRenderer({
  entity,
  selected,
  isTargetShelf,
  editable,
  onClick,
  onStairClick,
}: {
  entity: SceneEntity;
  selected: boolean;
  isTargetShelf: boolean;
  editable: boolean;
  onClick?: (entity: SceneEntity) => void;
  onStairClick?: (entity: SceneEntity) => void;
}) {
  const handleClick = (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    onClick?.(entity);
  };

  const sharedProps = {
    onClick: handleClick,
  };

  return (
    <group {...sharedProps}>
      {entity.kind === 'zone_overlay' && <ZoneMesh entity={entity} isSelected={selected} />}
      {entity.kind === 'shelf' && <ShelfMesh entity={entity} isSelected={selected} isTarget={isTargetShelf} showLabel={editable} />}
      {entity.kind === 'wall' && <WallMesh entity={entity} isSelected={selected} />}
      {entity.kind === 'door' && <DoorMesh entity={entity} isSelected={selected} />}
      {entity.kind === 'stairs' && <StairsMesh entity={entity} isSelected={selected} onClick={() => onStairClick?.(entity)} />}
      {entity.kind === 'comfort_room' && <RoomMesh entity={entity} isSelected={selected} />}
      {entity.kind === 'cashier_counter' && <CounterMesh entity={entity} isSelected={selected} />}
      {entity.kind === 'entrance' && <EntranceMesh entity={entity} isSelected={selected} />}
      {selected && <SelectionOutline entity={entity} />}
    </group>
  );
}

function SceneViewport({
  bootstrap,
  scene,
  currentFloor,
  selectedItemDetails,
  selectedEntityKey,
  editable = false,
  theme = 'viewer',
  viewMode = '3d',
  onEntitySelect,
  onEntityPreview,
  onEntityCommit,
  onFloorSwitch,
  controlsRef,
}: StockroomSceneProps & { controlsRef: MutableRefObject<any> }) {
  const floor = useMemo(
    () => bootstrap?.floors.find((entry) => entry.floorNumber === currentFloor) ?? bootstrap?.floors[0] ?? null,
    [bootstrap, currentFloor],
  );
  const themePalette = theme === 'admin' ? DARK_THEME : LIGHT_THEME;
  const activeEntities = scene.entitiesByFloor[currentFloor] ?? [];
  const targetShelfId = selectedItemDetails?.targetShelfId ?? null;
  const targetSlot = selectedItemDetails?.targetFloor === currentFloor ? selectedItemDetails.targetSlot : null;
  const routePoints = buildRoutePoints(selectedItemDetails?.segmentsByFloor?.[String(currentFloor)] ?? [], 0.16);
  const floorWidth = floor?.width ?? 18;
  const floorDepth = floor?.depth ?? 16;
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const scratch = useMemo(() => new Vector3(), []);

  useEffect(() => {
    const nextTarget = targetSlot
      ? { x: targetSlot.x, y: targetSlot.y }
      : selectedEntityKey
        ? activeEntities.find((entry) => entry.entityKey === selectedEntityKey)?.position
        : { x: floorWidth / 2, y: floorDepth / 2 };

    if (!controlsRef.current) {
      return;
    }

    const is2d = viewMode === '2d';
    const offset = is2d
      ? [0, Math.max(floorWidth, floorDepth) * 1.45, 0.01]
      : [Math.max(floorWidth * 0.42, 9), Math.max(floorWidth, floorDepth) * 1.05, Math.max(floorDepth * 0.58, 10)];

    controlsRef.current.setLookAt(
      nextTarget.x + offset[0],
      offset[1],
      nextTarget.y + offset[2],
      nextTarget.x,
      0,
      nextTarget.y,
      true,
    );
  }, [controlsRef, floorDepth, floorWidth, selectedEntityKey, targetSlot, viewMode, currentFloor, activeEntities]);

  const handlePointerDown = useCallback((entity: SceneEntity, event: any) => {
    if (!editable) {
      onEntitySelect?.(entity);
      return;
    }

    event.stopPropagation();
    onEntitySelect?.(entity);
    setDragState({
      entityKey: entity.entityKey,
      offset: {
        x: entity.position.x - event.point.x,
        y: entity.position.y - event.point.z,
      },
    });
  }, [editable, onEntitySelect]);

  const handlePlaneMove = useCallback((event: any) => {
    if (!dragState) {
      return;
    }

    event.stopPropagation();
    event.ray.intersectPlane(dragPlane, scratch);
    const nextPoint = snapPosition({
      x: scratch.x + dragState.offset.x,
      y: scratch.z + dragState.offset.y,
    }, scene.metadata.snapGrid || DEFAULT_SNAP_GRID);
    onEntityPreview?.(dragState.entityKey, { position: nextPoint });
  }, [dragPlane, dragState, onEntityPreview, scene.metadata.snapGrid, scratch]);

  const handlePlaneUp = useCallback(() => {
    if (!dragState) {
      return;
    }

    const entity = activeEntities.find((entry) => entry.entityKey === dragState.entityKey);
    if (entity) {
      onEntityCommit?.({
        ...entity,
        position: snapPosition(entity.position, scene.metadata.snapGrid || DEFAULT_SNAP_GRID),
        rotation: snapRotation(entity.rotation),
      });
    }
    setDragState(null);
  }, [activeEntities, dragState, onEntityCommit, scene.metadata.snapGrid]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const handleWindowPointerUp = () => {
      handlePlaneUp();
    };

    window.addEventListener('pointerup', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp);
    };
  }, [dragState, handlePlaneUp]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !dragState;
    }
  }, [controlsRef, dragState]);

  const overlayColor = theme === 'admin' ? '#0f172a' : '#ffffff';

  return (
    <>
      <color attach="background" args={[themePalette.background]} />
      <ambientLight intensity={theme === 'admin' ? 0.72 : 0.95} />
      <directionalLight
        position={[8, 16, 10]}
        intensity={theme === 'admin' ? 1.25 : 1.05}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight position={[floorWidth * 0.4, 18, floorDepth * 0.3]} intensity={0.45} angle={0.42} penumbra={0.5} color="#dbeafe" />

      <group>
        <mesh receiveShadow rotation-x={-Math.PI / 2} position={[floorWidth / 2, 0, floorDepth / 2]}>
          <planeGeometry args={[floorWidth, floorDepth]} />
          <meshStandardMaterial color={themePalette.floor} roughness={0.95} metalness={0.03} />
        </mesh>

        <gridHelper args={[Math.max(floorWidth, floorDepth), Math.max(floorWidth, floorDepth), themePalette.grid, themePalette.grid]} position={[floorWidth / 2, 0.01, floorDepth / 2]} />

        <mesh
          rotation-x={-Math.PI / 2}
          position={[floorWidth / 2, 0.02, floorDepth / 2]}
          onPointerMove={handlePlaneMove}
          onPointerUp={handlePlaneUp}
        >
          <planeGeometry args={[floorWidth, floorDepth]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>

        {activeEntities.map((entity) => (
          <group
            key={entity.entityKey}
            onPointerEnter={(event) => {
              event.stopPropagation();
            }}
            onPointerDown={(event) => handlePointerDown(entity, event)}
          >
            <EntityRenderer
              entity={entity}
              selected={selectedEntityKey === entity.entityKey}
              isTargetShelf={targetShelfId === entity.id || targetShelfId === entity.linkedResourceId}
              editable={editable}
              onClick={(selectedEntity) => onEntitySelect?.(selectedEntity)}
              onStairClick={(stair) => {
                if (editable) {
                  onEntitySelect?.(stair);
                  return;
                }
                onFloorSwitch?.(stair.floorNumber === 1 ? 2 : 1);
              }}
            />
          </group>
        ))}

        {routePoints.length > 1 && (
          <>
            <Line points={routePoints} color="#38bdf8" lineWidth={6} transparent opacity={0.18} />
            <Line points={routePoints} color="#67e8f9" lineWidth={2.6} />
          </>
        )}

        {targetSlot && (
          <group position={[targetSlot.x, 0.18 + (selectedItemDetails?.location.level.elevation ?? 0.45), targetSlot.y]}>
            <mesh castShadow>
              <boxGeometry args={[0.42, 0.14, 0.42]} />
              <meshStandardMaterial color="#ef4444" emissive="#f87171" emissiveIntensity={0.8} />
            </mesh>
            <mesh position={[0, -0.08, 0]}>
              <cylinderGeometry args={[0.36, 0.36, 0.02, 32]} />
              <meshBasicMaterial color="#fecaca" transparent opacity={0.7} />
            </mesh>
          </group>
        )}

        <ContactShadows position={[floorWidth / 2, -0.001, floorDepth / 2]} opacity={theme === 'admin' ? 0.42 : 0.24} scale={Math.max(floorWidth, floorDepth) * 1.12} blur={1.8} far={18} color={overlayColor} />
      </group>

      <CameraControls
        ref={controlsRef}
        makeDefault
        minPolarAngle={viewMode === '2d' ? 0 : 0.28}
        maxPolarAngle={viewMode === '2d' ? 0.02 : 1.18}
        minDistance={4}
        maxDistance={42}
        truckSpeed={theme === 'admin' ? 3.5 : 2.2}
        dollySpeed={0.65}
        smoothTime={0.25}
      />
    </>
  );
}

const StockroomScene = forwardRef<StockroomSceneHandle, StockroomSceneProps>(function StockroomScene(props, ref) {
  const controlsRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => controlsRef.current?.dolly(-4, true),
    zoomOut: () => controlsRef.current?.dolly(4, true),
    resetCamera: () => controlsRef.current?.reset(true),
  }), []);

  const themePalette = props.theme === 'admin' ? DARK_THEME : LIGHT_THEME;

  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-[28px]">
      <Canvas
        shadows
        dpr={[1, 1.75]}
        camera={{ position: [16, 16, 18], fov: 32 }}
        gl={{ antialias: true }}
        onPointerMissed={() => props.onEntitySelect?.(null)}
        style={{ background: themePalette.background }}
      >
        <SceneViewport {...props} controlsRef={controlsRef} />
      </Canvas>
    </div>
  );
});

export default StockroomScene;
