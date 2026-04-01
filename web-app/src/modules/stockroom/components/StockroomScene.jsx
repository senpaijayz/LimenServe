import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls, TransformControls } from '@react-three/drei';
import * as THREE from 'three';

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToGrid(value, grid = 0.1) {
  return Math.round(value / grid) * grid;
}

function planToWorld(floor, point, yOffset = 0.25) {
  const width = toNumber(floor?.width, 28);
  const depth = toNumber(floor?.depth, 18);
  const elevation = toNumber(floor?.elevation, 0);

  return new THREE.Vector3(
    toNumber(point?.x, 0) - (width / 2),
    (elevation * 0.35) + yOffset,
    toNumber(point?.y, 0) - (depth / 2),
  );
}

function worldToPlan(floor, object3D) {
  return {
    x: object3D.position.x + (toNumber(floor?.width, 28) / 2),
    y: object3D.position.z + (toNumber(floor?.depth, 18) / 2),
  };
}

function clampPlanPoint(floor, point, paddingX = 0, paddingY = 0) {
  const width = toNumber(floor?.width, 28);
  const depth = toNumber(floor?.depth, 18);

  return {
    x: Math.min(Math.max(point.x, paddingX), width - paddingX),
    y: Math.min(Math.max(point.y, paddingY), depth - paddingY),
  };
}

function makeEntityKey(type, id) {
  return `${type}:${id}`;
}

function RouteLines({ floor, routePoints }) {
  const points = useMemo(() => (
    (routePoints ?? []).map((point) => planToWorld(floor, point, 0.32))
  ), [floor, routePoints]);

  if (points.length < 2) {
    return null;
  }

  return <Line points={points} color="#f97316" lineWidth={3} />;
}

function CameraRig({ activeFloor, floors, controlsRef }) {
  const { camera } = useThree();
  const targetPosition = useRef(new THREE.Vector3());
  const targetLookAt = useRef(new THREE.Vector3());

  useEffect(() => {
    const floor = floors.find((candidate) => candidate.floorNumber === activeFloor) ?? floors[0];
    if (!floor) {
      return;
    }

    const elevation = toNumber(floor.elevation, 0) * 0.35;
    targetPosition.current.set(0, elevation + 15, 17);
    targetLookAt.current.set(0, elevation, 0);
  }, [activeFloor, floors]);

  useFrame(() => {
    camera.position.lerp(targetPosition.current, 0.08);
    if (controlsRef.current) {
      controlsRef.current.target.lerp(targetLookAt.current, 0.08);
      controlsRef.current.update();
    } else {
      camera.lookAt(targetLookAt.current);
    }
  });

  return null;
}

function EditableTransform({
  enabled,
  children,
  onObjectChange,
  onMouseUp,
}) {
  if (!enabled) {
    return children;
  }

  return (
    <TransformControls
      mode="translate"
      space="world"
      showY={false}
      onObjectChange={onObjectChange}
      onMouseUp={onMouseUp}
      onTouchEnd={onMouseUp}
    >
      {children}
    </TransformControls>
  );
}

function ShelfMesh({
  shelf,
  floor,
  editable,
  selected,
  highlighted,
  children,
  onSelect,
  onCommit,
}) {
  const groupRef = useRef(null);
  const pendingPoint = useRef(null);
  const elevation = toNumber(floor.elevation, 0) * 0.35;
  const fixedY = elevation + (toNumber(shelf.height, 2) / 2) * 0.35;
  const width = toNumber(shelf.width, 2.2);
  const depth = toNumber(shelf.depth, 0.9);

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(
      toNumber(shelf.positionX, 0) - (toNumber(floor.width, 28) / 2),
      fixedY,
      toNumber(shelf.positionY, 0) - (toNumber(floor.depth, 18) / 2),
    );
  }, [fixedY, floor.depth, floor.width, shelf.positionX, shelf.positionY]);

  const handleObjectChange = () => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.y = fixedY;
    const clamped = clampPlanPoint(
      floor,
      worldToPlan(floor, groupRef.current),
      width / 2,
      depth / 2,
    );
    const snapped = {
      x: roundToGrid(clamped.x, 0.1),
      y: roundToGrid(clamped.y, 0.1),
    };

    groupRef.current.position.x = snapped.x - (toNumber(floor.width, 28) / 2);
    groupRef.current.position.z = snapped.y - (toNumber(floor.depth, 18) / 2);
    pendingPoint.current = snapped;
  };

  const handleCommit = () => {
    if (!pendingPoint.current || !onCommit) {
      return;
    }

    onCommit({
      type: 'shelf',
      id: shelf.id,
      floorId: shelf.floorId,
      floorNumber: floor.floorNumber,
      positionX: pendingPoint.current.x,
      positionY: pendingPoint.current.y,
    });
    pendingPoint.current = null;
  };

  const color = highlighted ? '#f97316' : selected ? '#2563eb' : '#0f172a';

  return (
    <EditableTransform enabled={editable && selected} onObjectChange={handleObjectChange} onMouseUp={handleCommit}>
      <group
        ref={groupRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.({
            type: 'shelf',
            id: shelf.id,
            floorId: shelf.floorId,
            floorNumber: floor.floorNumber,
          });
        }}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[width, toNumber(shelf.height, 2) * 0.35, depth]} />
          <meshStandardMaterial color={color} transparent opacity={editable || selected ? 0.98 : 0.96} />
        </mesh>
        {children}
      </group>
    </EditableTransform>
  );
}

function ZoneMesh({
  zone,
  floor,
  editable,
  selected,
  onSelect,
  onCommit,
}) {
  const groupRef = useRef(null);
  const pendingPoint = useRef(null);
  const elevation = toNumber(floor.elevation, 0) * 0.35;
  const width = toNumber(zone.width, 0);
  const depth = toNumber(zone.depth, 0);
  const fixedY = elevation + 0.01;

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(
      toNumber(zone.positionX, 0) - (toNumber(floor.width, 28) / 2) + (width / 2),
      fixedY,
      toNumber(zone.positionY, 0) - (toNumber(floor.depth, 18) / 2) + (depth / 2),
    );
  }, [depth, fixedY, floor.depth, floor.width, width, zone.positionX, zone.positionY]);

  const handleObjectChange = () => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.y = fixedY;
    const clamped = clampPlanPoint(
      floor,
      worldToPlan(floor, groupRef.current),
      width / 2,
      depth / 2,
    );
    const snapped = {
      x: roundToGrid(clamped.x, 0.1),
      y: roundToGrid(clamped.y, 0.1),
    };

    groupRef.current.position.x = snapped.x - (toNumber(floor.width, 28) / 2);
    groupRef.current.position.z = snapped.y - (toNumber(floor.depth, 18) / 2);
    pendingPoint.current = snapped;
  };

  const handleCommit = () => {
    if (!pendingPoint.current || !onCommit) {
      return;
    }

    onCommit({
      type: 'zone',
      id: zone.id,
      floorId: zone.floorId,
      floorNumber: floor.floorNumber,
      positionX: roundToGrid(pendingPoint.current.x - (width / 2), 0.1),
      positionY: roundToGrid(pendingPoint.current.y - (depth / 2), 0.1),
    });
    pendingPoint.current = null;
  };

  return (
    <EditableTransform enabled={editable && selected} onObjectChange={handleObjectChange} onMouseUp={handleCommit}>
      <group
        ref={groupRef}
        onClick={(event) => {
          event.stopPropagation();
          onSelect?.({
            type: 'zone',
            id: zone.id,
            floorId: zone.floorId,
            floorNumber: floor.floorNumber,
          });
        }}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[width, depth]} />
          <meshStandardMaterial
            color={selected ? '#2563eb' : (zone.colorHex || '#93c5fd')}
            transparent
            opacity={selected ? 0.28 : 0.12}
          />
        </mesh>
      </group>
    </EditableTransform>
  );
}

function SlotMarker({ slot, shelf, floor, visible }) {
  if (!visible) {
    return null;
  }

  const elevation = toNumber(floor.elevation, 0) * 0.35;
  const shelfWidth = toNumber(shelf.width, 2.2);
  const slotWidth = toNumber(slot.width, 0.52);

  return (
    <mesh
      position={[
        toNumber(shelf.positionX, 0) - (toNumber(floor.width, 28) / 2) - (shelfWidth / 2) + toNumber(slot.positionX, 0) + (slotWidth / 2),
        elevation + 1.3,
        toNumber(shelf.positionY, 0) - (toNumber(floor.depth, 18) / 2),
      ]}
    >
      <boxGeometry args={[slotWidth, 0.28, toNumber(shelf.depth, 0.9) + 0.18]} />
      <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={0.45} transparent opacity={0.95} />
    </mesh>
  );
}

function Staircase({
  floor,
  selected,
  editable,
  onClick,
  onCommit,
}) {
  const groupRef = useRef(null);
  const pendingPoint = useRef(null);
  const anchor = floor.floorNumber === 1 ? floor.staircaseFloor1Anchor : floor.staircaseFloor2Anchor;
  const point = planToWorld(floor, anchor, 0.5);
  const fixedY = point.y;

  useEffect(() => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.set(point.x, point.y, point.z);
  }, [point.x, point.y, point.z]);

  const handleObjectChange = () => {
    if (!groupRef.current) {
      return;
    }

    groupRef.current.position.y = fixedY;
    const clamped = clampPlanPoint(
      floor,
      worldToPlan(floor, groupRef.current),
      1.1,
      1.3,
    );
    const snapped = {
      x: roundToGrid(clamped.x, 0.1),
      y: roundToGrid(clamped.y, 0.1),
    };

    groupRef.current.position.x = snapped.x - (toNumber(floor.width, 28) / 2);
    groupRef.current.position.z = snapped.y - (toNumber(floor.depth, 18) / 2);
    pendingPoint.current = snapped;
  };

  const handleCommit = () => {
    if (!pendingPoint.current || !onCommit) {
      return;
    }

    onCommit({
      type: 'staircase',
      id: floor.floorNumber,
      floorId: floor.id,
      floorNumber: floor.floorNumber,
      positionX: pendingPoint.current.x,
      positionY: pendingPoint.current.y,
    });
    pendingPoint.current = null;
  };

  return (
    <EditableTransform enabled={editable && selected} onObjectChange={handleObjectChange} onMouseUp={handleCommit}>
      <group
        ref={groupRef}
        onClick={(event) => {
          event.stopPropagation();
          onClick?.({
            type: 'staircase',
            id: floor.floorNumber,
            floorId: floor.id,
            floorNumber: floor.floorNumber,
          });
        }}
      >
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.2, 1.2, 2.6]} />
          <meshStandardMaterial color={selected ? '#2563eb' : '#ef4444'} transparent opacity={0.96} />
        </mesh>
        <mesh position={[0, 0.8, 0]}>
          <boxGeometry args={[1.3, 0.2, 1.3]} />
          <meshStandardMaterial color="#fee2e2" />
        </mesh>
      </group>
    </EditableTransform>
  );
}

function FloorLayer({
  floor,
  zones,
  aisles,
  shelves,
  routePoints,
  highlightedShelfId,
  highlightedSlotId,
  selectedItemDetails,
  currentFloor,
  editorMode,
  selectedEntityKey,
  onEntitySelect,
  onEntityCommit,
  onStairClick,
}) {
  const isActiveFloor = floor.floorNumber === currentFloor;
  const elevation = toNumber(floor.elevation, 0) * 0.35;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation, 0]} receiveShadow>
        <planeGeometry args={[toNumber(floor.width, 28), toNumber(floor.depth, 18)]} />
        <meshStandardMaterial color={isActiveFloor ? '#f8fafc' : '#dbeafe'} transparent opacity={isActiveFloor ? 1 : 0.28} />
      </mesh>

      {zones.map((zone) => (
        <ZoneMesh
          key={zone.id}
          zone={zone}
          floor={floor}
          editable={editorMode === 'zone' && isActiveFloor}
          selected={selectedEntityKey === makeEntityKey('zone', zone.id)}
          onSelect={onEntitySelect}
          onCommit={onEntityCommit}
        />
      ))}

      {aisles.map((aisle) => (
        <Line
          key={aisle.id}
          points={[
            planToWorld(floor, { x: aisle.startX, y: aisle.startY }, 0.08),
            planToWorld(floor, { x: aisle.endX, y: aisle.endY }, 0.08),
          ]}
          color={isActiveFloor ? '#38bdf8' : '#cbd5e1'}
          lineWidth={2}
        />
      ))}

      {shelves.map((shelf) => (
        <ShelfMesh
          key={shelf.id}
          shelf={shelf}
          floor={floor}
          editable={editorMode === 'shelf' && isActiveFloor}
          selected={selectedEntityKey === makeEntityKey('shelf', shelf.id)}
          highlighted={shelf.id === highlightedShelfId}
          onSelect={onEntitySelect}
          onCommit={onEntityCommit}
        >
          {selectedItemDetails?.location?.slot && (
            <SlotMarker
              slot={selectedItemDetails.location.slot}
              shelf={shelf}
              floor={floor}
              visible={shelf.id === highlightedShelfId && selectedItemDetails.location.slot.id === highlightedSlotId}
            />
          )}
        </ShelfMesh>
      ))}

      <RouteLines floor={floor} routePoints={routePoints} />
      <Staircase
        floor={floor}
        editable={editorMode === 'staircase' && isActiveFloor}
        selected={selectedEntityKey === makeEntityKey('staircase', floor.floorNumber)}
        onClick={onStairClick}
        onCommit={onEntityCommit}
      />
    </group>
  );
}

function SceneContents({
  bootstrap,
  currentFloor,
  selectedItemDetails,
  onStairClick,
  editorMode,
  selectedEntityKey,
  onEntitySelect,
  onEntityCommit,
}) {
  const controlsRef = useRef(null);
  const floors = useMemo(() => (
    (bootstrap?.floors ?? []).map((floor) => ({
      ...floor,
      staircaseFloor1Anchor: bootstrap?.activeLayout?.staircaseFloor1Anchor,
      staircaseFloor2Anchor: bootstrap?.activeLayout?.staircaseFloor2Anchor,
    }))
  ), [bootstrap]);

  const routeSegmentsByFloor = selectedItemDetails?.segmentsByFloor ?? {};
  const highlightedShelfId = selectedItemDetails?.targetShelfId ?? null;
  const highlightedSlotId = selectedItemDetails?.targetSlotId ?? null;

  return (
    <>
      <ambientLight intensity={0.9} />
      <directionalLight position={[8, 18, 10]} intensity={1.4} castShadow />
      <pointLight position={[-10, 12, -8]} intensity={0.5} />
      <CameraRig activeFloor={currentFloor} floors={floors} controlsRef={controlsRef} />

      {floors.map((floor) => (
        <FloorLayer
          key={floor.id}
          floor={floor}
          zones={(bootstrap?.zones ?? []).filter((zone) => zone.floorId === floor.id)}
          aisles={(bootstrap?.aisles ?? []).filter((aisle) => aisle.floorId === floor.id)}
          shelves={(bootstrap?.shelves ?? []).filter((shelf) => shelf.floorId === floor.id)}
          routePoints={routeSegmentsByFloor[String(floor.floorNumber)] ?? []}
          highlightedShelfId={highlightedShelfId}
          highlightedSlotId={highlightedSlotId}
          selectedItemDetails={selectedItemDetails}
          currentFloor={currentFloor}
          editorMode={editorMode}
          selectedEntityKey={selectedEntityKey}
          onEntitySelect={onEntitySelect}
          onEntityCommit={onEntityCommit}
          onStairClick={onStairClick}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        minDistance={10}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}

function StockroomScene({
  bootstrap,
  currentFloor,
  selectedItemDetails,
  onStairClick,
  editorMode = null,
  selectedEntityKey = null,
  onEntitySelect = null,
  onEntityCommit = null,
}) {
  if (!bootstrap?.floors?.length) {
    return (
      <div className="h-[520px] rounded-2xl border border-primary-200 bg-primary-100/70" />
    );
  }

  return (
    <div className="h-[520px] overflow-hidden rounded-2xl border border-primary-200 bg-[radial-gradient(circle_at_top,_rgba(37,99,235,0.18),_transparent_42%),linear-gradient(180deg,_#eff6ff_0%,_#f8fafc_58%,_#eef2ff_100%)]">
      <Canvas shadows camera={{ position: [0, 15, 17], fov: 42 }}>
        <SceneContents
          bootstrap={bootstrap}
          currentFloor={currentFloor}
          selectedItemDetails={selectedItemDetails}
          onStairClick={onStairClick}
          editorMode={editorMode}
          selectedEntityKey={selectedEntityKey}
          onEntitySelect={onEntitySelect}
          onEntityCommit={onEntityCommit}
        />
      </Canvas>
    </div>
  );
}

export default StockroomScene;
