import { OrbitControls } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing';
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
import { Plane, Vector3, type PerspectiveCamera } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
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
  type SceneThemePalette,
} from './StockroomScenePrimitives';
import StockroomPlanView from './StockroomPlanView';

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

function getFloorRecord(bootstrap: { floors: StockroomFloor[] } | null, currentFloor: number) {
  return bootstrap?.floors.find((entry) => entry.floorNumber === currentFloor) ?? bootstrap?.floors[0] ?? null;
}

function getFocusPosition(
  activeEntities: SceneEntity[],
  selectedEntityKey: string | null | undefined,
  selectedItemDetails: StockroomItemDetails | null | undefined,
  floorWidth: number,
  floorDepth: number,
) {
  if (
    selectedItemDetails
    && selectedItemDetails.targetFloor === selectedItemDetails.currentFloor
    && selectedItemDetails.targetSlot
  ) {
    return {
      x: selectedItemDetails.targetSlot.x,
      y: selectedItemDetails.targetSlot.y,
      elevation: 0.7 + (selectedItemDetails.location.level.elevation ?? 0.36),
    };
  }

  const selectedEntity = selectedEntityKey
    ? activeEntities.find((entity) => entity.entityKey === selectedEntityKey)
    : null;

  if (selectedEntity) {
    return {
      x: selectedEntity.position.x,
      y: selectedEntity.position.y,
      elevation: Math.max(0.82, selectedEntity.size.y * 0.42),
    };
  }

  return {
    x: floorWidth / 2,
    y: floorDepth * 0.48,
    elevation: 0.92,
  };
}

function CameraRig({
  currentFloor,
  floorWidth,
  floorDepth,
  viewMode,
  editable,
  selectedEntityKey,
  selectedItemDetails,
  activeEntities,
  controlsRef,
  cameraRef,
  cameraResetKey,
}: {
  currentFloor: number;
  floorWidth: number;
  floorDepth: number;
  viewMode: '3d' | '2d';
  editable: boolean;
  selectedEntityKey?: string | null;
  selectedItemDetails?: StockroomItemDetails | null;
  activeEntities: SceneEntity[];
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  cameraRef: MutableRefObject<PerspectiveCamera | null>;
  cameraResetKey: number;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new Vector3(floorWidth / 2, 0.9, floorDepth / 2));
  const desiredCameraRef = useRef(new Vector3());

  useEffect(() => {
    cameraRef.current = camera as PerspectiveCamera;
  }, [camera, cameraRef]);

  useEffect(() => {
    const focus = getFocusPosition(activeEntities, selectedEntityKey, selectedItemDetails, floorWidth, floorDepth);
    const span = Math.max(floorWidth, floorDepth);
    const focusHeight = editable ? focus.elevation + 0.12 : focus.elevation;
    targetRef.current.set(focus.x, focusHeight, focus.y);

    if (viewMode === '2d') {
      desiredCameraRef.current.set(focus.x, span * 1.78, focus.y + 0.001);
      return;
    }

    const horizontalOffset = editable ? span * 0.82 : span * 0.76;
    const depthOffset = editable ? span * 0.92 : span * 0.84;
    const heightOffset = editable ? span * 0.8 : span * 0.72;
    const floorBias = currentFloor > 1 ? 0.12 : 0;

    desiredCameraRef.current.set(
      focus.x + horizontalOffset,
      heightOffset + floorBias,
      focus.y + depthOffset,
    );
  }, [
    activeEntities,
    cameraResetKey,
    currentFloor,
    editable,
    floorDepth,
    floorWidth,
    selectedEntityKey,
    selectedItemDetails,
    viewMode,
  ]);

  useFrame((_state, delta) => {
    if (!controlsRef.current || !cameraRef.current) {
      return;
    }

    const easing = 1 - Math.exp(-delta * 4.8);
    controlsRef.current.target.lerp(targetRef.current, easing);
    cameraRef.current.position.lerp(desiredCameraRef.current, easing);
    controlsRef.current.update();
  });

  return null;
}

function SceneLighting({
  floorWidth,
  floorDepth,
  palette,
  theme,
}: {
  floorWidth: number;
  floorDepth: number;
  palette: SceneThemePalette;
  theme: 'viewer' | 'admin';
}) {
  const accentLights = useMemo(() => {
    const xPositions = [floorWidth * 0.18, floorWidth * 0.38, floorWidth * 0.58, floorWidth * 0.78];
    const zPositions = [floorDepth * 0.22, floorDepth * 0.42, floorDepth * 0.6];
    return zPositions.flatMap((z) => xPositions.map((x) => ({ x, z })));
  }, [floorDepth, floorWidth]);

  return (
    <>
      <color attach="background" args={[palette.background]} />
      <fog attach="fog" args={[palette.background, 18, 42]} />
      <ambientLight intensity={0.72} />
      <hemisphereLight args={[palette.lightCool, '#04101f', 0.86]} />

      <directionalLight
        position={[floorWidth * 0.94, Math.max(floorWidth, floorDepth) * 1.18, floorDepth * 0.18]}
        intensity={theme === 'admin' ? 1.2 : 1.08}
        color={palette.lightWarm}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={1}
        shadow-camera-far={56}
        shadow-camera-left={-28}
        shadow-camera-right={28}
        shadow-camera-top={28}
        shadow-camera-bottom={-28}
        shadow-bias={-0.00018}
      />

      <directionalLight
        position={[-floorWidth * 0.36, floorWidth * 0.9, -floorDepth * 0.26]}
        intensity={0.34}
        color={palette.glassGlow}
      />

      <pointLight
        position={[floorWidth * 0.56, 7.2, floorDepth * 0.78]}
        intensity={0.34}
        distance={24}
        decay={2}
        color={palette.glassGlow}
      />

      {accentLights.map((light) => (
        <spotLight
          key={`spot-${light.x}-${light.z}`}
          position={[light.x, 5.6, light.z]}
          angle={0.56}
          penumbra={0.72}
          intensity={0.34}
          distance={16}
          color={palette.lightCool}
          target-position={[light.x, 0, light.z]}
        />
      ))}
    </>
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
  cameraRef,
  cameraResetKey,
}: StockroomSceneProps & {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  cameraRef: MutableRefObject<PerspectiveCamera | null>;
  cameraResetKey: number;
}) {
  const floor = useMemo(() => getFloorRecord(bootstrap, currentFloor), [bootstrap, currentFloor]);
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
  const dragPlane = useMemo(() => new Plane(new Vector3(0, 1, 0), 0), []);
  const scratch = useMemo(() => new Vector3(), []);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const handleEntityDown = useCallback((entity: SceneEntity, event: any) => {
    event.stopPropagation();
    onEntitySelect?.(entity);

    if (entity.kind === 'stairs' && !editable) {
      onFloorSwitch?.(entity.floorNumber === 1 ? 2 : 1);
      return;
    }

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
  }, [editable, onEntitySelect, onFloorSwitch]);

  const handlePlaneMove = useCallback((event: any) => {
    if (!dragState) {
      return;
    }

    event.stopPropagation();
    event.ray.intersectPlane(dragPlane, scratch);
    const nextPosition = snapPosition({
      x: scratch.x + dragState.offset.x,
      y: scratch.z + dragState.offset.y,
    }, scene.metadata.snapGrid || DEFAULT_SNAP_GRID);

    onEntityPreview?.(dragState.entityKey, { position: nextPosition });
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
    if (!controlsRef.current) {
      return;
    }

    controlsRef.current.enabled = !dragState;
  }, [controlsRef, dragState]);

  return (
    <>
      <SceneLighting floorWidth={floorWidth} floorDepth={floorDepth} palette={palette} theme={theme} />
      <CameraRig
        currentFloor={currentFloor}
        floorWidth={floorWidth}
        floorDepth={floorDepth}
        viewMode={viewMode}
        editable={editable}
        selectedEntityKey={selectedEntityKey}
        selectedItemDetails={selectedItemDetails}
        activeEntities={activeEntities}
        controlsRef={controlsRef}
        cameraRef={cameraRef}
        cameraResetKey={cameraResetKey}
      />

      <FloorStage
        width={floorWidth}
        depth={floorDepth}
        palette={palette}
        theme={theme}
        ambientEntities={activeEntities}
        onPlaneMove={handlePlaneMove}
        onPlaneUp={handlePlaneUp}
      >
        {activeEntities.map((entity) => (
          <group
            key={entity.entityKey}
            onPointerDown={(event) => handleEntityDown(entity, event)}
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

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.07}
        rotateSpeed={0.58}
        zoomSpeed={0.78}
        panSpeed={0.58}
        enablePan={editable}
        minDistance={8}
        maxDistance={46}
        minPolarAngle={0.42}
        maxPolarAngle={viewMode === '2d' ? 0.01 : 1.28}
      />
    </>
  );
}

const StockroomScene = forwardRef<StockroomSceneHandle, StockroomSceneProps>(function StockroomScene(
  props,
  ref,
) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [cameraResetKey, setCameraResetKey] = useState(0);
  const palette = props.theme === 'admin' ? ADMIN_SCENE_THEME : VIEWER_SCENE_THEME;

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (props.viewMode === '2d') {
        setZoomLevel((current) => Math.min(current + 0.2, 2.5));
        return;
      }

      if (!cameraRef.current || !controlsRef.current) {
        return;
      }

      const offset = cameraRef.current.position.clone().sub(controlsRef.current.target);
      cameraRef.current.position.copy(controlsRef.current.target.clone().add(offset.multiplyScalar(0.86)));
      controlsRef.current.update();
    },
    zoomOut: () => {
      if (props.viewMode === '2d') {
        setZoomLevel((current) => Math.max(current - 0.2, 0.72));
        return;
      }

      if (!cameraRef.current || !controlsRef.current) {
        return;
      }

      const offset = cameraRef.current.position.clone().sub(controlsRef.current.target);
      cameraRef.current.position.copy(controlsRef.current.target.clone().add(offset.multiplyScalar(1.15)));
      controlsRef.current.update();
    },
    resetCamera: () => {
      if (props.viewMode === '2d') {
        setZoomLevel(1);
        return;
      }

      setCameraResetKey((current) => current + 1);
    },
  }), [props.viewMode]);

  useEffect(() => {
    setZoomLevel(1);
  }, [props.currentFloor, props.viewMode]);

  if (props.viewMode === '2d') {
    return (
      <StockroomPlanView
        {...props}
        zoomLevel={zoomLevel}
      />
    );
  }

  return (
    <div className="h-full min-h-[460px] w-full overflow-hidden rounded-[30px] border border-white/10 bg-[#040915]">
      <Canvas
        shadows
        dpr={[1, 2]}
        camera={{ position: [18, 13.6, 17.8], fov: 34 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onPointerMissed={() => props.onEntitySelect?.(null)}
        style={{ background: palette.background }}
      >
        <SceneViewport
          {...props}
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          cameraResetKey={cameraResetKey}
        />
        <EffectComposer disableNormalPass>
          <Bloom
            luminanceThreshold={0.65}
            mipmapBlur
            intensity={0.8}
            levels={6}
          />
          <Vignette eskil={false} offset={0.3} darkness={0.6} />
        </EffectComposer>
      </Canvas>
    </div>
  );
});

export default StockroomScene;
