import { CameraControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
import { Plane, Vector3 } from 'three';
import type { SceneEntity, SceneModel, StockroomFloor, StockroomItemDetails, Vec2 } from '../types';
import { DEFAULT_SNAP_GRID, snapPosition, snapRotation } from '../utils/sceneModel';
import {
  ADMIN_SCENE_THEME,
  buildCurvedRoute,
  FloorStage,
  RouteRibbon,
  SceneEntityMesh,
  TargetBeacon,
  VIEWER_SCENE_THEME,
} from './StockroomScenePrimitives';

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
}: StockroomSceneProps & { controlsRef: MutableRefObject<CameraControls | null> }) {
  const floor = useMemo(
    () => bootstrap?.floors.find((entry) => entry.floorNumber === currentFloor) ?? bootstrap?.floors[0] ?? null,
    [bootstrap, currentFloor],
  );
  const palette = theme === 'admin' ? ADMIN_SCENE_THEME : VIEWER_SCENE_THEME;
  const activeEntities = scene.entitiesByFloor[currentFloor] ?? [];
  const targetShelfId = selectedItemDetails?.targetShelfId ?? null;
  const targetSlot = selectedItemDetails?.targetFloor === currentFloor ? selectedItemDetails.targetSlot : null;
  const routePoints = useMemo(
    () => buildCurvedRoute(selectedItemDetails?.segmentsByFloor?.[String(currentFloor)] ?? [], 0.18),
    [currentFloor, selectedItemDetails],
  );
  const floorWidth = floor?.width ?? 18;
  const floorDepth = floor?.depth ?? 16;
  const gridDivisions = Math.max(Math.round(Math.max(floorWidth, floorDepth) * 2), 18);
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const scratch = useMemo(() => new Vector3(), []);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!controlsRef.current) {
      return;
    }

    const focusTarget = targetSlot
      ? { x: targetSlot.x, y: targetSlot.y }
      : selectedEntityKey
        ? activeEntities.find((entry) => entry.entityKey === selectedEntityKey)?.position
        : { x: floorWidth / 2, y: floorDepth / 2 };

    if (!focusTarget) {
      return;
    }

    const isFlat = viewMode === '2d';
    const offset = isFlat
      ? [0, Math.max(floorWidth, floorDepth) * 1.5, 0.001]
      : [Math.max(floorWidth * 0.66, 11), Math.max(floorWidth, floorDepth) * 1.18, Math.max(floorDepth * 0.82, 12)];

    controlsRef.current.setLookAt(
      focusTarget.x + offset[0],
      offset[1],
      focusTarget.y + offset[2],
      focusTarget.x,
      0,
      focusTarget.y,
      true,
    );
  }, [activeEntities, controlsRef, currentFloor, floorDepth, floorWidth, selectedEntityKey, targetSlot, viewMode]);

  const handlePointerDown = useCallback((entity: SceneEntity, event: any) => {
    event.stopPropagation();
    onEntitySelect?.(entity);

    if (!editable || entity.locked) {
      return;
    }

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

    const release = () => handlePlaneUp();
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, [dragState, handlePlaneUp]);

  useEffect(() => {
    if (controlsRef.current) {
      controlsRef.current.enabled = !dragState;
    }
  }, [controlsRef, dragState]);

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 16, 34]} />
      <ambientLight intensity={theme === 'admin' ? 0.9 : 1.15} />
      <hemisphereLight args={['#ffffff', '#cbd5e1', theme === 'admin' ? 0.7 : 0.9]} />
      <directionalLight
        position={[floorWidth * 0.65, Math.max(floorWidth, floorDepth) * 1.25, floorDepth * 0.5]}
        intensity={theme === 'admin' ? 1.45 : 1.18}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={40}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
      />
      <spotLight
        position={[floorWidth * 0.38, 18, floorDepth * 0.24]}
        intensity={0.48}
        angle={0.44}
        penumbra={0.7}
        color={theme === 'admin' ? '#dbeafe' : '#f8fafc'}
      />

      <FloorStage
        width={floorWidth}
        depth={floorDepth}
        palette={palette}
        gridDivisions={gridDivisions}
        theme={theme}
        onPlaneMove={handlePlaneMove}
        onPlaneUp={handlePlaneUp}
      >
        {activeEntities.map((entity) => (
          <group
            key={entity.entityKey}
            onPointerEnter={(event) => event.stopPropagation()}
            onPointerDown={(event) => handlePointerDown(entity, event)}
          >
            <SceneEntityMesh
              entity={entity}
              selected={selectedEntityKey === entity.entityKey}
              targetShelf={targetShelfId === entity.id || targetShelfId === entity.linkedResourceId}
              editable={editable}
              palette={palette}
              onActivate={() => {
                if (entity.kind !== 'stairs') {
                  return;
                }

                if (editable) {
                  onEntitySelect?.(entity);
                  return;
                }

                onFloorSwitch?.(entity.floorNumber === 1 ? 2 : 1);
              }}
            />
          </group>
        ))}

        <RouteRibbon points={routePoints} palette={palette} />
        <TargetBeacon targetSlot={targetSlot} details={selectedItemDetails} palette={palette} />
      </FloorStage>

      <CameraControls
        ref={controlsRef}
        makeDefault
        minPolarAngle={viewMode === '2d' ? 0 : 0.28}
        maxPolarAngle={viewMode === '2d' ? 0.01 : 1.18}
        minDistance={4}
        maxDistance={44}
        truckSpeed={theme === 'admin' ? 3.8 : 2.4}
        dollySpeed={0.64}
        smoothTime={0.22}
      />
    </>
  );
}

const StockroomScene = forwardRef<StockroomSceneHandle, StockroomSceneProps>(function StockroomScene(props, ref) {
  const controlsRef = useRef<CameraControls | null>(null);
  const palette = props.theme === 'admin' ? ADMIN_SCENE_THEME : VIEWER_SCENE_THEME;

  useImperativeHandle(ref, () => ({
    zoomIn: () => controlsRef.current?.dolly(-4, true),
    zoomOut: () => controlsRef.current?.dolly(4, true),
    resetCamera: () => controlsRef.current?.reset(true),
  }), []);

  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-[28px]">
      <Canvas
        shadows
        dpr={[1, 1.7]}
        camera={{ position: [18, 18, 18], fov: 32 }}
        gl={{ antialias: true }}
        onPointerMissed={() => props.onEntitySelect?.(null)}
        style={{ background: palette.background }}
      >
        <SceneViewport {...props} controlsRef={controlsRef} />
      </Canvas>
    </div>
  );
});

export default StockroomScene;
