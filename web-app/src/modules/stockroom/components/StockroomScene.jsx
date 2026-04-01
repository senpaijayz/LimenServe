import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';

function worldPoint(floor, point, yOffset = 0.25) {
  const width = Number(floor?.width ?? 28);
  const depth = Number(floor?.depth ?? 18);
  const elevation = Number(floor?.elevation ?? 0);

  return new THREE.Vector3(
    Number(point?.x ?? 0) - (width / 2),
    (elevation * 0.35) + yOffset,
    Number(point?.y ?? 0) - (depth / 2),
  );
}

function RouteLines({ floor, routePoints }) {
  const points = useMemo(() => (
    (routePoints ?? []).map((point) => worldPoint(floor, point, 0.32))
  ), [floor, routePoints]);

  if (points.length < 2) {
    return null;
  }

  return (
    <Line
      points={points}
      color="#f97316"
      lineWidth={3}
    />
  );
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

    const elevation = Number(floor.elevation ?? 0) * 0.35;
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

function ShelfMesh({ shelf, floor, isActiveFloor, isHighlighted, children }) {
  const elevation = Number(floor.elevation ?? 0) * 0.35;
  const color = isHighlighted ? '#f97316' : isActiveFloor ? '#0f172a' : '#94a3b8';

  return (
    <group position={[
      Number(shelf.positionX ?? 0) - (Number(floor.width ?? 28) / 2),
      elevation + (Number(shelf.height ?? 2) / 2) * 0.35,
      Number(shelf.positionY ?? 0) - (Number(floor.depth ?? 18) / 2),
    ]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[
          Number(shelf.width ?? 2.2),
          Number(shelf.height ?? 2) * 0.35,
          Number(shelf.depth ?? 0.9),
        ]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={isActiveFloor ? 0.96 : 0.18}
        />
      </mesh>
      {children}
    </group>
  );
}

function SlotMarker({ slot, shelf, floor, visible }) {
  if (!visible) {
    return null;
  }

  const elevation = Number(floor.elevation ?? 0) * 0.35;
  const shelfWidth = Number(shelf.width ?? 2.2);
  const slotWidth = Number(slot.width ?? 0.52);

  return (
    <mesh
      position={[
        Number(shelf.positionX ?? 0) - (Number(floor.width ?? 28) / 2) - (shelfWidth / 2) + Number(slot.positionX ?? 0) + (slotWidth / 2),
        elevation + 1.3,
        Number(shelf.positionY ?? 0) - (Number(floor.depth ?? 18) / 2),
      ]}
    >
      <boxGeometry args={[slotWidth, 0.28, Number(shelf.depth ?? 0.9) + 0.18]} />
      <meshStandardMaterial color="#facc15" emissive="#f59e0b" emissiveIntensity={0.45} transparent opacity={0.95} />
    </mesh>
  );
}

function Staircase({ floor, active, onClick }) {
  const anchor = floor.floorNumber === 1 ? floor.staircaseFloor1Anchor : floor.staircaseFloor2Anchor;
  const point = worldPoint(floor, anchor, 0.5);

  return (
    <group position={[point.x, point.y, point.z]} onClick={onClick}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[2.2, 1.2, 2.6]} />
        <meshStandardMaterial color={active ? '#ef4444' : '#cbd5e1'} transparent opacity={active ? 0.96 : 0.38} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[1.3, 0.2, 1.3]} />
        <meshStandardMaterial color="#fee2e2" />
      </mesh>
    </group>
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
  onStairClick,
}) {
  const isActiveFloor = floor.floorNumber === currentFloor;
  const elevation = Number(floor.elevation ?? 0) * 0.35;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, elevation, 0]} receiveShadow>
        <planeGeometry args={[Number(floor.width ?? 28), Number(floor.depth ?? 18)]} />
        <meshStandardMaterial color={isActiveFloor ? '#f8fafc' : '#dbeafe'} transparent opacity={isActiveFloor ? 1 : 0.28} />
      </mesh>

      {zones.map((zone) => (
        <mesh
          key={zone.id}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[
            Number(zone.positionX ?? 0) - (Number(floor.width ?? 28) / 2) + (Number(zone.width ?? 0) / 2),
            elevation + 0.01,
            Number(zone.positionY ?? 0) - (Number(floor.depth ?? 18) / 2) + (Number(zone.depth ?? 0) / 2),
          ]}
        >
          <planeGeometry args={[Number(zone.width ?? 0), Number(zone.depth ?? 0)]} />
          <meshStandardMaterial color={zone.colorHex || '#93c5fd'} transparent opacity={isActiveFloor ? 0.08 : 0.03} />
        </mesh>
      ))}

      {aisles.map((aisle) => (
        <Line
          key={aisle.id}
          points={[
            worldPoint(floor, { x: aisle.startX, y: aisle.startY }, 0.08),
            worldPoint(floor, { x: aisle.endX, y: aisle.endY }, 0.08),
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
          isActiveFloor={isActiveFloor}
          isHighlighted={shelf.id === highlightedShelfId}
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
      <Staircase floor={floor} active={isActiveFloor} onClick={onStairClick} />
    </group>
  );
}

function SceneContents({ bootstrap, currentFloor, selectedItemDetails, onStairClick }) {
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
          onStairClick={onStairClick}
        />
      ))}

      <OrbitControls
        ref={controlsRef}
        enablePan
        minDistance={10}
        maxDistance={24}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}

function StockroomScene({ bootstrap, currentFloor, selectedItemDetails, onStairClick }) {
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
        />
      </Canvas>
    </div>
  );
}

export default StockroomScene;
