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
                color={located ? '#fef3c7' : selected ? '#1e3a5f' : color}
                emissive={located ? LOCATED_EMISSIVE : selected ? SELECTED_EMISSIVE : emissive}
                emissiveIntensity={located ? 0.7 : selected ? 0.34 : 0.02}
                metalness={0.08}
                opacity={locked ? Math.min(opacity, 0.68) : opacity}
                roughness={0.58}
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
            color="#cbd5e1"
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
    const width = Number(object.dimensions?.width || 18);
    const depth = Number(object.dimensions?.depth || 14);
    const upperWidth = Math.min(width * 0.58, 10);
    const upperDepth = Math.min(depth * 0.52, 7);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width, 0.18, depth]} color="#1f1f1f" located={located} locked={locked} position={[0, -0.09, 0]} selected={selected} />
                    <Block args={[upperWidth, 0.2, upperDepth]} color="#2c2c2c" located={located} locked={locked} opacity={0.92} position={[3.7, FLOOR_HEIGHT, -3.1]} selected={selected} />
                    {[
                        [0.4, FLOOR_HEIGHT / 2, -6.1],
                        [7.1, FLOOR_HEIGHT / 2, -6.1],
                        [0.4, FLOOR_HEIGHT / 2, -0.35],
                        [7.1, FLOOR_HEIGHT / 2, -0.35],
                    ].map((position) => (
                        <Block key={position.join('-')} args={[0.28, FLOOR_HEIGHT, 0.28]} color="#4b5563" located={located} locked={locked} position={position} selected={selected} />
                    ))}
                    <Label position={[-5.7, 0.05, 5.4]}>FLOOR 1</Label>
                    <Label position={[3.7, FLOOR_HEIGHT + 0.18, -5.9]}>FLOOR 2</Label>
                </>
            )}
        </TransformableObject>
    );
}

function WallsObject({ object, onTransformingChange }) {
    const width = Number(object.dimensions?.width || 18);
    const depth = Number(object.dimensions?.depth || 14);
    const height = Math.max(1, Math.min(Number(object.dimensions?.height || FLOOR_HEIGHT), FLOOR_HEIGHT));
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width + 0.2, height, 0.24]} color="#cbd5e1" located={located} locked={locked} opacity={0.72} position={[0, height / 2, -halfDepth - 0.1]} selected={selected} />
                    <Block args={[0.24, height, depth + 0.2]} color="#cbd5e1" located={located} locked={locked} opacity={0.72} position={[-halfWidth - 0.1, height / 2, 0]} selected={selected} />
                    <Block args={[0.24, height, depth + 0.2]} color="#cbd5e1" located={located} locked={locked} opacity={0.72} position={[halfWidth + 0.1, height / 2, 0]} selected={selected} />
                    <Block args={[width * 0.38, height, 0.24]} color="#cbd5e1" located={located} locked={locked} opacity={0.72} position={[-width * 0.32, height / 2, halfDepth + 0.1]} selected={selected} />
                    <Block args={[width * 0.38, height, 0.24]} color="#cbd5e1" located={located} locked={locked} opacity={0.72} position={[width * 0.32, height / 2, halfDepth + 0.1]} selected={selected} />
                    <Block args={[10, 1.15, 0.18]} color="#d1d5db" located={located} locked={locked} opacity={0.54} position={[3.7, FLOOR_HEIGHT + 0.72, 0.45]} selected={selected} />
                    <Block args={[0.18, 1.15, 7]} color="#d1d5db" located={located} locked={locked} opacity={0.54} position={[-1.35, FLOOR_HEIGHT + 0.72, -3.1]} selected={selected} />
                    <Block args={[0.18, 1.15, 7]} color="#d1d5db" located={located} locked={locked} opacity={0.54} position={[8.75, FLOOR_HEIGHT + 0.72, -3.1]} selected={selected} />
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
    const width = Number(object.dimensions?.width || 3.2);
    const depth = Number(object.dimensions?.depth || 0.9);
    const height = Number(object.dimensions?.height || (0.72 + layers * 0.46));
    const shelfLevels = Array.from({ length: layers }, (_, index) => 0.26 + ((height - 0.48) / Math.max(1, layers - 1)) * index);
    const frameColor = '#4A5568';
    const accentColor = '#3182CE';
    const slotWidth = width / binCount;
    const slotPositions = Array.from({ length: binCount }, (_, index) => (-width / 2) + slotWidth / 2 + index * slotWidth);
    const shelfLocations = productLocations.filter((location) => (
        location.shelfObjectId === object.id
        || (normalizeAisle(location.aisle) === normalizeAisle(object.aisle) && Number(location.shelfNumber) === Number(object.shelfNumber))
    ));

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    {[
                        [-width / 2, height / 2, -depth / 2],
                        [width / 2, height / 2, -depth / 2],
                        [-width / 2, height / 2, depth / 2],
                        [width / 2, height / 2, depth / 2],
                    ].map((position) => (
                        <Block key={position.join('-')} args={[0.12, height, 0.12]} color={frameColor} located={located} locked={locked} position={position} selected={selected} />
                    ))}
                    {shelfLevels.map((level) => (
                        <group key={level}>
                            <Block
                                args={[width + 0.35, 0.12, depth + 0.18]}
                                color={accentColor}
                                located={located}
                                locked={locked}
                                position={[0, level, 0]}
                                selected={selected}
                            />
                            {slotPositions.map((x, index) => (
                                <Block
                                    key={`${level}-${index}`}
                                    args={[Math.max(slotWidth * 0.72, 0.12), 0.12, 0.22]}
                                    color={index % 2 === 0 ? '#93c5fd' : '#60a5fa'}
                                    located={locatedProduct?.shelfObjectId === object.id && Number(locatedProduct.binNumber) === index + 1}
                                    locked={locked}
                                    position={[x, level + 0.17, -depth / 3]}
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
                    <Block args={[width + 0.4, 0.18, depth + 0.22]} color="#111827" located={located} locked={locked} position={[0, 0.09, 0]} selected={selected} />
                    <Label position={[0, height + 0.18, depth / 2 + 0.28]} rotation={[-0.5, 0, 0]}>
                        {`Aisle ${object.aisle}-${object.shelfNumber}`}
                    </Label>
                </>
            )}
        </TransformableObject>
    );
}

function StairsObject({ object, onTransformingChange }) {
    const width = Number(object.dimensions?.width || 2.3);
    const depth = Number(object.dimensions?.depth || 5.4);
    const height = Number(object.dimensions?.height || FLOOR_HEIGHT);
    const stepCount = 11;
    const steps = Array.from({ length: stepCount }, (_, index) => ({
        depth: depth / stepCount,
        height: 0.18 + index * (height / stepCount),
        position: [0, 0.09 + index * (height / (stepCount * 2)), depth / 2 - index * (depth / stepCount)],
        width,
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
                    <Block args={[0.1, height * 0.62, depth]} color="#78350f" located={located} locked={locked} position={[-width / 2 - 0.1, height * 0.35, 0.12]} selected={selected} />
                    <Block args={[0.1, height * 0.62, depth]} color="#78350f" located={located} locked={locked} position={[width / 2 + 0.1, height * 0.35, 0.12]} selected={selected} />
                    <Label position={[0, height + 0.18, -depth / 2]}>STAIRS</Label>
                </>
            )}
        </TransformableObject>
    );
}

function CounterComputerObject({ object, onTransformingChange }) {
    const width = Number(object.dimensions?.width || 2.8);
    const depth = Number(object.dimensions?.depth || 1.15);
    const height = Number(object.dimensions?.height || 1.45);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width, height * 0.66, depth]} color="#7c2d12" located={located} locked={locked} position={[0, height * 0.33, 0]} selected={selected} />
                    <Block args={[width + 0.15, 0.16, depth + 0.12]} color="#d6d3d1" located={located} locked={locked} position={[0, height * 0.73, 0]} selected={selected} />
                    <Block args={[width * 0.34, height * 0.42, 0.08]} color="#0f172a" emissive="#172554" located={located} locked={locked} position={[width * 0.2, height + 0.03, -depth * 0.16]} selected={selected} />
                    <Block args={[width * 0.16, 0.08, depth * 0.24]} color="#1e293b" located={located} locked={locked} position={[width * 0.2, height * 0.79, depth * 0.26]} selected={selected} />
                    <Block args={[width * 0.22, 0.05, depth * 0.3]} color="#334155" located={located} locked={locked} position={[-width * 0.16, height * 0.78, depth * 0.2]} selected={selected} />
                    <Label position={[0, height + 0.28, depth / 2 + 0.2]} rotation={[-0.62, 0, 0]}>START</Label>
                </>
            )}
        </TransformableObject>
    );
}

function EntranceDoorObject({ object, onTransformingChange }) {
    const width = Number(object.dimensions?.width || 1.7);
    const depth = Number(object.dimensions?.depth || 0.16);
    const height = Number(object.dimensions?.height || 2.35);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width, height, depth]} color="#b45309" located={located} locked={locked} position={[0, height / 2, 0]} selected={selected} />
                    <Block args={[width + 0.3, height + 0.2, depth * 0.7]} color="#78350f" located={located} locked={locked} position={[0, height / 2 + 0.1, -depth * 0.55]} selected={selected} />
                    <Block args={[width * 0.8, height * 0.86, depth * 0.75]} color="#fef3c7" located={located} locked={locked} opacity={0.38} position={[0, height / 2, depth * 0.12]} selected={selected} />
                    <Block args={[0.12, 0.12, 0.12]} color="#111827" located={located} locked={locked} position={[width * 0.36, height * 0.5, depth]} selected={selected} />
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

function MovingPathDot({ points, sequence }) {
    const dotRef = useRef();
    const animationStartRef = useRef(null);
    const vectors = useMemo(() => points.map((point) => new THREE.Vector3(...point)), [points]);

    useEffect(() => {
        animationStartRef.current = null;
    }, [points, sequence]);

    useFrame(({ clock }) => {
        if (!dotRef.current || vectors.length < 2) {
            return;
        }

        if (animationStartRef.current === null) {
            animationStartRef.current = clock.elapsedTime;
        }

        const totalSegments = vectors.length - 1;
        const progress = ((clock.elapsedTime - animationStartRef.current) * 0.32) % 1;
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
    const pathAnimationRequest = useLocator3DStore((state) => state.pathAnimationRequest);
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
            <MovingPathDot points={points} sequence={pathAnimationRequest} />
        </group>
    );
}

function CameraRig({ controlsRef }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const cameraFocusRequest = useLocator3DStore((state) => state.cameraFocusRequest);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const { camera } = useThree();
    const activeTargetRef = useRef(null);
    const isAnimatingRef = useRef(true);
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

    useEffect(() => {
        activeTargetRef.current = target;
        isAnimatingRef.current = true;
    }, [target]);

    useFrame(() => {
        if (!isAnimatingRef.current || !activeTargetRef.current) {
            return;
        }

        camera.position.lerp(activeTargetRef.current.position, 0.065);

        if (controlsRef.current?.target) {
            controlsRef.current.target.lerp(activeTargetRef.current.lookAt, 0.085);
            controlsRef.current.update();
        }

        if (camera.position.distanceTo(activeTargetRef.current.position) < 0.04) {
            isAnimatingRef.current = false;
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
            <color args={['#0b1120']} attach="background" />
            <ambientLight intensity={0.38} />
            <hemisphereLight args={['#93c5fd', '#111827', 0.48]} />
            <directionalLight castShadow intensity={1.28} position={[7, 11, 6]} shadow-mapSize={[2048, 2048]} />
            <spotLight angle={0.42} intensity={1.35} penumbra={0.55} position={[-7, 9, 7]} />
            <pointLight color="#38bdf8" intensity={0.45} position={[-4, 4, 3]} />
            <Grid
                cellColor="#334155"
                cellSize={1}
                cellThickness={0.42}
                fadeDistance={24}
                fadeStrength={1.2}
                infiniteGrid
                position={[0, 0.012, 0]}
                sectionColor="#475569"
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
                        : 'border-white/10 bg-slate-950/80 text-slate-300'
                }`}
                >
                    {isDesignMode ? 'Design Mode / 0.5 Snap' : 'View Mode'}
                </div>
            </Html>
            <ContactShadows blur={2.8} far={16} frames={1} opacity={0.38} position={[0, 0.015, 0]} scale={20} />
            <Environment preset="city" />
            <EffectComposer multisampling={2}>
                <Bloom intensity={locatedProduct ? 0.58 : 0.26} luminanceThreshold={0.48} mipmapBlur />
            </EffectComposer>
            <CameraRig controlsRef={controlsRef} />
            <OrbitControls
                dampingFactor={0.08}
                enabled={!isTransforming}
                enablePan
                enableDamping
                makeDefault
                maxDistance={80}
                minDistance={1.2}
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
            camera={{ fov: 46, position: CAMERA_TARGETS[1].position }}
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
