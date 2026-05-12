import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Environment, Grid, Html, Line, OrbitControls, Text, TransformControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import {
    FLOOR_HEIGHT,
    getCounterObject,
    getShelfBinWorldPosition,
    getShelfObjectByLocation,
    getStairsObject,
    normalizeAisle,
} from '../data/locatorScene';
import { useLocator3DStore } from '../store/useLocator3DStore';

const SELECTED_EDGE = '#0ea5e9';
const SELECTED_EMISSIVE = '#38bdf8';
const LOCKED_EDGE = '#f59e0b';
const LOCATED_EDGE = '#facc15';
const LOCATED_EMISSIVE = '#fde047';

const CAMERA_TARGETS = {
    1: {
        lookAt: [0, 1.45, 0],
        position: [10.5, 8.4, 10.5],
    },
    2: {
        lookAt: [1.8, FLOOR_HEIGHT + 1.25, -2.8],
        position: [10.5, FLOOR_HEIGHT + 7.2, 10.5],
    },
};

function Block({
    args,
    color,
    emissive = '#000000',
    locked,
    opacity = 1,
    position,
    receiveShadow = true,
    rotation,
    located,
    selected,
}) {
    const edgeColor = located ? LOCATED_EDGE : locked ? LOCKED_EDGE : SELECTED_EDGE;
    const active = selected || located;

    return (
        <mesh castShadow receiveShadow={receiveShadow} position={position} rotation={rotation}>
            <boxGeometry args={args} />
            <meshStandardMaterial
                color={located ? '#fef3c7' : selected ? '#dbeafe' : color}
                emissive={located ? LOCATED_EMISSIVE : selected ? SELECTED_EMISSIVE : emissive}
                emissiveIntensity={located ? 0.7 : selected ? 0.42 : 0.02}
                metalness={0.04}
                opacity={locked ? Math.min(opacity, 0.68) : opacity}
                roughness={0.68}
                transparent={opacity < 1 || locked}
            />
            {(active || locked) && <Edges color={edgeColor} scale={active ? 1.045 : 1.015} threshold={12} />}
        </mesh>
    );
}

function Label({ children, position, rotation = [-Math.PI / 2, 0, 0] }) {
    return (
        <Text
            anchorX="center"
            anchorY="middle"
            color="#475569"
            fontSize={0.32}
            fontWeight={700}
            letterSpacing={0}
            position={position}
            rotation={rotation}
        >
            {children}
        </Text>
    );
}

function LockBadge({ position }) {
    return (
        <Html center position={position}>
            <div className="rounded-full border border-amber-300 bg-amber-100/95 px-2 py-1 text-[10px] font-black tracking-[0.18em] text-amber-800 shadow-lg">
                LOCKED
            </div>
        </Html>
    );
}

function TransformableObject({ children, object, onTransformingChange }) {
    const groupRef = useRef();
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const selectObject = useLocator3DStore((state) => state.selectObject);
    const toggleFloorFocus = useLocator3DStore((state) => state.toggleFloorFocus);
    const updateObjectTransform = useLocator3DStore((state) => state.updateObjectTransform);
    const selected = selectedObjectId === object.id;
    const located = locatedProduct?.shelfObjectId === object.id;
    const transformMode = activeTool === 'rotate' ? 'rotate' : 'translate';
    const canTransform = selected && isDesignMode && !object.isLocked;

    useEffect(() => {
        if (!groupRef.current?.position?.set || !groupRef.current?.rotation?.set) {
            return;
        }

        groupRef.current.position.set(...object.position);
        groupRef.current.rotation.set(...(object.rotation ?? [0, 0, 0]));
    }, [object.position, object.rotation]);

    const handleObjectChange = () => {
        if (!groupRef.current?.position || !groupRef.current?.rotation) {
            return;
        }

        updateObjectTransform(object.id, {
            position: [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z],
            rotation: [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z],
        });
    };

    const handleClick = (event) => {
        event.stopPropagation?.();

        if (object.isLocked) {
            return;
        }

        selectObject(object.id);

        if (object.type === 'stairs') {
            toggleFloorFocus();
        }
    };

    return (
        <>
            <group
                data-testid={`locator-object-${object.id}`}
                name={object.id}
                onClick={handleClick}
                position={object.position}
                ref={groupRef}
                rotation={object.rotation}
            >
                {children({ located, locked: object.isLocked, selected })}
                {object.isLocked && <LockBadge position={[0, (object.dimensions?.height ?? 1) + 0.45, 0]} />}
            </group>
            {canTransform && (
                <TransformControls
                    mode={transformMode}
                    object={groupRef}
                    onMouseDown={() => onTransformingChange(true)}
                    onMouseUp={() => {
                        onTransformingChange(false);
                        handleObjectChange();
                    }}
                    onObjectChange={handleObjectChange}
                    rotationSnap={Math.PI / 12}
                    showX
                    showY
                    showZ
                    size={0.82}
                    translationSnap={0.5}
                />
            )}
        </>
    );
}

function FloorObject({ object, onTransformingChange }) {
    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[18, 0.18, 14]} color="#d6dbe2" located={located} locked={locked} position={[0, -0.09, 0]} selected={selected} />
                    <Block args={[10, 0.2, 7]} color="#cbd5e1" located={located} locked={locked} opacity={0.82} position={[3.7, FLOOR_HEIGHT, -3.1]} selected={selected} />
                    {[
                        [0.4, FLOOR_HEIGHT / 2, -6.1],
                        [7.1, FLOOR_HEIGHT / 2, -6.1],
                        [0.4, FLOOR_HEIGHT / 2, -0.35],
                        [7.1, FLOOR_HEIGHT / 2, -0.35],
                    ].map((position) => (
                        <Block key={position.join('-')} args={[0.28, FLOOR_HEIGHT, 0.28]} color="#94a3b8" located={located} locked={locked} position={position} selected={selected} />
                    ))}
                    <Label position={[-5.7, 0.05, 5.4]}>FLOOR 1</Label>
                    <Label position={[3.7, FLOOR_HEIGHT + 0.18, -5.9]}>FLOOR 2</Label>
                </>
            )}
        </TransformableObject>
    );
}

function WallsObject({ object, onTransformingChange }) {
    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[18.2, 3.2, 0.24]} color="#e2e8f0" located={located} locked={locked} position={[0, 1.55, -7.1]} selected={selected} />
                    <Block args={[0.24, 3.2, 14.2]} color="#e2e8f0" located={located} locked={locked} position={[-9.1, 1.55, 0]} selected={selected} />
                    <Block args={[0.24, 3.2, 14.2]} color="#e2e8f0" located={located} locked={locked} position={[9.1, 1.55, 0]} selected={selected} />
                    <Block args={[6.8, 3.2, 0.24]} color="#e2e8f0" located={located} locked={locked} position={[-5.7, 1.55, 7.1]} selected={selected} />
                    <Block args={[6.8, 3.2, 0.24]} color="#e2e8f0" located={located} locked={locked} position={[5.7, 1.55, 7.1]} selected={selected} />
                    <Block args={[10, 1.15, 0.18]} color="#cbd5e1" located={located} locked={locked} opacity={0.62} position={[3.7, FLOOR_HEIGHT + 0.72, 0.45]} selected={selected} />
                    <Block args={[0.18, 1.15, 7]} color="#cbd5e1" located={located} locked={locked} opacity={0.62} position={[-1.35, FLOOR_HEIGHT + 0.72, -3.1]} selected={selected} />
                    <Block args={[0.18, 1.15, 7]} color="#cbd5e1" located={located} locked={locked} opacity={0.62} position={[8.75, FLOOR_HEIGHT + 0.72, -3.1]} selected={selected} />
                </>
            )}
        </TransformableObject>
    );
}

function ProductMarker({ highlighted, location, position }) {
    const markerRef = useRef();

    useFrame(({ clock }) => {
        if (!highlighted || !markerRef.current?.material) {
            return;
        }

        markerRef.current.material.emissiveIntensity = 0.7 + (Math.sin(clock.elapsedTime * 5) * 0.25);
        markerRef.current.scale.setScalar(1 + (Math.sin(clock.elapsedTime * 4) * 0.06));
    });

    return (
        <group position={position}>
            <mesh ref={markerRef} castShadow>
                <boxGeometry args={[0.24, 0.22, 0.22]} />
                <meshStandardMaterial
                    color={highlighted ? '#fde047' : '#fb7185'}
                    emissive={highlighted ? '#facc15' : '#be123c'}
                    emissiveIntensity={highlighted ? 0.8 : 0.25}
                    roughness={0.42}
                />
                {highlighted && <Edges color="#facc15" scale={1.25} threshold={8} />}
            </mesh>
            {highlighted && (
                <Html center position={[0, 0.42, 0]}>
                    <div className="rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 text-[10px] font-black text-yellow-900 shadow-lg">
                        Bin {location.binNumber}
                    </div>
                </Html>
            )}
        </group>
    );
}

function ShelfObject({ object, onTransformingChange }) {
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const layers = object.layerCount ?? (object.type === 'shelf-4-layer' ? 4 : 2);
    const binCount = object.binCount ?? 6;
    const shelfLevels = Array.from({ length: layers }, (_, index) => 0.28 + index * 0.46);
    const height = 0.72 + layers * 0.46;
    const frameColor = layers >= 4 ? '#1d4ed8' : '#0f766e';
    const slotWidth = 3.2 / binCount;
    const slotPositions = Array.from({ length: binCount }, (_, index) => -1.6 + slotWidth / 2 + index * slotWidth);
    const shelfLocations = productLocations.filter((location) => (
        location.shelfObjectId === object.id
        || (normalizeAisle(location.aisle) === normalizeAisle(object.aisle) && Number(location.shelfNumber) === Number(object.shelfNumber))
    ));

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    {[
                        [-1.65, height / 2, -0.48],
                        [1.65, height / 2, -0.48],
                        [-1.65, height / 2, 0.48],
                        [1.65, height / 2, 0.48],
                    ].map((position) => (
                        <Block key={position.join('-')} args={[0.12, height, 0.12]} color="#475569" located={located} locked={locked} position={position} selected={selected} />
                    ))}
                    {shelfLevels.map((level) => (
                        <group key={level}>
                            <Block
                                args={[3.55, 0.12, 1.08]}
                                color={frameColor}
                                located={located}
                                locked={locked}
                                position={[0, level, 0]}
                                selected={selected}
                            />
                            {slotPositions.map((x, index) => (
                                <Block
                                    key={`${level}-${index}`}
                                    args={[Math.max(slotWidth * 0.72, 0.12), 0.12, 0.22]}
                                    color={index % 2 === 0 ? '#bae6fd' : '#bfdbfe'}
                                    located={locatedProduct?.shelfObjectId === object.id && Number(locatedProduct.binNumber) === index + 1}
                                    locked={locked}
                                    position={[x, level + 0.17, -0.33]}
                                    selected={selected}
                                />
                            ))}
                        </group>
                    ))}
                    {shelfLocations.map((location, index) => {
                        const safeBin = Math.min(binCount, Math.max(1, Number(location.binNumber || 1)));
                        const markerLevel = shelfLevels[index % shelfLevels.length] ?? shelfLevels[0];

                        return (
                            <ProductMarker
                                highlighted={locatedProduct?.productId === location.productId}
                                key={location.productId}
                                location={location}
                                position={[slotPositions[safeBin - 1], markerLevel + 0.28, 0.18]}
                            />
                        );
                    })}
                    <Block args={[3.6, 0.18, 1.12]} color="#111827" located={located} locked={locked} position={[0, 0.09, 0]} selected={selected} />
                    <Label position={[0, height + 0.18, 0.7]} rotation={[-0.5, 0, 0]}>
                        {`Aisle ${object.aisle}-${object.shelfNumber}`}
                    </Label>
                </>
            )}
        </TransformableObject>
    );
}

function StairsObject({ object, onTransformingChange }) {
    const steps = Array.from({ length: 11 }, (_, index) => ({
        depth: 0.52,
        height: 0.18 + index * 0.39,
        position: [0, 0.09 + index * 0.205, 2.55 - index * 0.48],
        width: 2.35,
    }));

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    {steps.map((step, index) => (
                        <Block
                            key={index}
                            args={[step.width, step.height, step.depth]}
                            color="#b45309"
                            located={located}
                            locked={locked}
                            position={step.position}
                            selected={selected}
                        />
                    ))}
                    <Block args={[0.1, 2.7, 5.5]} color="#78350f" located={located} locked={locked} position={[-1.25, 1.55, 0.12]} selected={selected} />
                    <Block args={[0.1, 2.7, 5.5]} color="#78350f" located={located} locked={locked} position={[1.25, 1.55, 0.12]} selected={selected} />
                    <Label position={[0, FLOOR_HEIGHT + 0.18, -2.75]}>STAIRS</Label>
                </>
            )}
        </TransformableObject>
    );
}

function CounterComputerObject({ object, onTransformingChange }) {
    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[2.8, 0.95, 1.15]} color="#991b1b" located={located} locked={locked} position={[0, 0.48, 0]} selected={selected} />
                    <Block args={[2.95, 0.16, 1.28]} color="#f8fafc" located={located} locked={locked} position={[0, 1.03, 0]} selected={selected} />
                    <Block args={[0.95, 0.62, 0.08]} color="#0f172a" emissive="#172554" located={located} locked={locked} position={[0.55, 1.48, -0.18]} selected={selected} />
                    <Block args={[0.45, 0.08, 0.28]} color="#1e293b" located={located} locked={locked} position={[0.55, 1.13, 0.3]} selected={selected} />
                    <Block args={[0.62, 0.05, 0.34]} color="#334155" located={located} locked={locked} position={[-0.45, 1.12, 0.23]} selected={selected} />
                    <Label position={[0, 1.68, 0.78]} rotation={[-0.62, 0, 0]}>START</Label>
                </>
            )}
        </TransformableObject>
    );
}

function EntranceDoorObject({ object, onTransformingChange }) {
    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[1.7, 2.35, 0.16]} color="#f59e0b" located={located} locked={locked} position={[0, 1.17, 0]} selected={selected} />
                    <Block args={[2, 2.55, 0.1]} color="#92400e" located={located} locked={locked} position={[0, 1.27, -0.09]} selected={selected} />
                    <Block args={[1.38, 2.04, 0.12]} color="#fef3c7" located={located} locked={locked} opacity={0.38} position={[0, 1.17, 0.02]} selected={selected} />
                    <Block args={[0.12, 0.12, 0.12]} color="#111827" located={located} locked={locked} position={[0.62, 1.16, 0.15]} selected={selected} />
                </>
            )}
        </TransformableObject>
    );
}

function LocatorObject({ object, onTransformingChange }) {
    if (object.type === 'floor') {
        return <FloorObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (object.type === 'walls') {
        return <WallsObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (object.type === 'shelf-2-layer' || object.type === 'shelf-4-layer') {
        return <ShelfObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (object.type === 'stairs') {
        return <StairsObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (object.type === 'counter-computer') {
        return <CounterComputerObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (object.type === 'entrance-door') {
        return <EntranceDoorObject object={object} onTransformingChange={onTransformingChange} />;
    }

    return null;
}

function buildPathPoints(sceneObjects, locatedProduct) {
    if (!locatedProduct) {
        return [];
    }

    const counter = getCounterObject(sceneObjects);
    const stairs = getStairsObject(sceneObjects);
    const shelf = getShelfObjectByLocation(locatedProduct, sceneObjects);
    const target = locatedProduct.targetPosition || getShelfBinWorldPosition(shelf, locatedProduct.binNumber);

    if (!counter || !shelf) {
        return [];
    }

    const start = [
        counter.position[0],
        counter.position[1] + 1.25,
        counter.position[2],
    ];

    if (Number(locatedProduct.floor) === 2 && stairs) {
        return [
            start,
            [stairs.position[0], 1.05, stairs.position[2] + 2.2],
            [stairs.position[0], FLOOR_HEIGHT + 0.95, stairs.position[2] - 2.2],
            target,
        ];
    }

    return [start, target];
}

function MovingPathDot({ points }) {
    const dotRef = useRef();
    const vectors = useMemo(() => points.map((point) => new THREE.Vector3(...point)), [points]);

    useFrame(({ clock }) => {
        if (!dotRef.current || vectors.length < 2) {
            return;
        }

        const totalSegments = vectors.length - 1;
        const progress = (clock.elapsedTime * 0.32) % 1;
        const segmentProgress = progress * totalSegments;
        const segmentIndex = Math.min(totalSegments - 1, Math.floor(segmentProgress));
        const localProgress = segmentProgress - segmentIndex;
        dotRef.current.position.lerpVectors(vectors[segmentIndex], vectors[segmentIndex + 1], localProgress);
    });

    if (vectors.length < 2) {
        return null;
    }

    return (
        <mesh ref={dotRef}>
            <sphereGeometry args={[0.16, 18, 18]} />
            <meshStandardMaterial color="#dcfce7" emissive="#22c55e" emissiveIntensity={1.1} />
        </mesh>
    );
}

function LocatorPath() {
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const points = useMemo(() => buildPathPoints(sceneObjects, locatedProduct), [locatedProduct, sceneObjects]);

    if (points.length < 2) {
        return null;
    }

    return (
        <group>
            <Line
                color="#22c55e"
                lineWidth={5}
                opacity={0.88}
                points={points}
                transparent
            />
            <Line
                color="#bbf7d0"
                lineWidth={1.5}
                opacity={0.9}
                points={points}
                transparent
            />
            <MovingPathDot points={points} />
        </group>
    );
}

function CameraRig({ controlsRef }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const cameraFocusRequest = useLocator3DStore((state) => state.cameraFocusRequest);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const { camera } = useThree();
    const target = useMemo(() => {
        if (locatedProduct?.targetPosition) {
            const [x, y, z] = locatedProduct.targetPosition;

            return {
                lookAt: new THREE.Vector3(x, y, z),
                position: new THREE.Vector3(x + 5.2, y + 3.8, z + 5.2),
            };
        }

        const focusedObject = cameraFocusRequest?.objectId
            ? sceneObjects.find((object) => object.id === cameraFocusRequest.objectId)
            : null;

        if (focusedObject) {
            const [x, y, z] = focusedObject.position;
            const height = Number(focusedObject.dimensions?.height || 1);

            return {
                lookAt: new THREE.Vector3(x, y + (height / 2), z),
                position: new THREE.Vector3(x + 5.8, y + height + 3.6, z + 5.8),
            };
        }

        return {
            lookAt: new THREE.Vector3(...CAMERA_TARGETS[activeFloor].lookAt),
            position: new THREE.Vector3(...CAMERA_TARGETS[activeFloor].position),
        };
    }, [activeFloor, cameraFocusRequest, locatedProduct, sceneObjects]);

    useFrame(() => {
        camera.position.lerp(target.position, 0.055);

        if (controlsRef.current?.target) {
            controlsRef.current.target.lerp(target.lookAt, 0.075);
            controlsRef.current.update();
        }
    });

    return null;
}

function SceneContents() {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const controlsRef = useRef();
    const [isTransforming, setIsTransforming] = useState(false);

    return (
        <>
            <color args={['#eef3f8']} attach="background" />
            <ambientLight intensity={0.55} />
            <hemisphereLight args={['#e0f2fe', '#475569', 0.55]} />
            <directionalLight castShadow intensity={1.1} position={[7, 10, 6]} shadow-mapSize={[2048, 2048]} />
            <spotLight angle={0.42} intensity={0.85} penumbra={0.5} position={[-7, 9, 7]} />
            <Grid
                cellColor="#cbd5e1"
                cellSize={1}
                cellThickness={0.45}
                fadeDistance={24}
                fadeStrength={1.2}
                infiniteGrid
                position={[0, 0.012, 0]}
                sectionColor="#94a3b8"
                sectionSize={4}
                sectionThickness={0.9}
            />
            {isDesignMode && (
                <>
                    <Grid
                        cellColor="#38bdf8"
                        cellSize={0.5}
                        cellThickness={0.7}
                        fadeDistance={20}
                        fadeStrength={1.4}
                        infiniteGrid
                        position={[0, 0.026, 0]}
                        sectionColor="#0284c7"
                        sectionSize={2}
                        sectionThickness={1.2}
                    />
                    <Grid
                        cellColor="#38bdf8"
                        cellSize={0.5}
                        cellThickness={0.65}
                        fadeDistance={16}
                        fadeStrength={1.2}
                        infiniteGrid
                        position={[3.7, FLOOR_HEIGHT + 0.026, -3.1]}
                        sectionColor="#0284c7"
                        sectionSize={2}
                        sectionThickness={1.1}
                    />
                </>
            )}
            {sceneObjects.map((object) => (
                <LocatorObject key={object.id} object={object} onTransformingChange={setIsTransforming} />
            ))}
            <LocatorPath />
            <Html position={[-7.7, activeFloor === 1 ? 3.45 : FLOOR_HEIGHT + 2.25, -6.7]}>
                <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg backdrop-blur ${
                    isDesignMode
                        ? 'border-sky-300 bg-sky-100/95 text-sky-900'
                        : 'border-slate-300 bg-white/90 text-slate-600'
                }`}
                >
                    {isDesignMode ? 'Design Mode / 0.5 Snap' : 'View Mode'}
                </div>
            </Html>
            <ContactShadows blur={2.5} far={16} frames={1} opacity={0.28} position={[0, 0.015, 0]} scale={18} />
            <Environment preset="warehouse" />
            <EffectComposer multisampling={2}>
                <Bloom intensity={locatedProduct ? 0.48 : 0.2} luminanceThreshold={0.55} mipmapBlur />
            </EffectComposer>
            <CameraRig controlsRef={controlsRef} />
            <OrbitControls
                dampingFactor={0.08}
                enabled={!isTransforming}
                enableDamping
                maxDistance={34}
                maxPolarAngle={Math.PI / 2.08}
                minDistance={7}
                ref={controlsRef}
                target={CAMERA_TARGETS[activeFloor].lookAt}
            />
        </>
    );
}

export default function Locator3DScene() {
    const clearSelection = useLocator3DStore((state) => state.clearSelection);

    return (
        <Canvas
            camera={{ fov: 42, position: CAMERA_TARGETS[1].position }}
            dpr={[1, 1.75]}
            gl={{ antialias: true, powerPreference: 'high-performance' }}
            onPointerMissed={clearSelection}
            shadows
        >
            <Suspense fallback={null}>
                <SceneContents />
            </Suspense>
        </Canvas>
    );
}
