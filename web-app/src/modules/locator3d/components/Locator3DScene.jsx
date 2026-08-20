import { Component, Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, Edges, Environment, Grid, Html, Line, OrbitControls, TransformControls } from '@react-three/drei';
import { Bloom, EffectComposer } from '@react-three/postprocessing';
import {
    FLOOR_HEIGHT,
    SNAP_STEP,
    getCounterObject,
    isShelfObject,
    normalizeAisle,
} from '../data/locatorScene';
import { useLocator3DStore } from '../store/useLocator3DStore';
import { getLocatorQualityCapabilities, getLocatorQualityProfile } from '../utils/qualityTier';
import { buildObstacleAwarePath } from '../utils/locatorPathfinding';

const SELECTED_EDGE = '#0ea5e9';
const SELECTED_EMISSIVE = '#38bdf8';
const LOCKED_EDGE = '#f59e0b';
const LOCATED_EDGE = '#facc15';
const LOCATED_EMISSIVE = '#fde047';
const SHARED_FLOOR_TYPES = new Set(['floor', 'walls']);
const LocatorQualityContext = createContext(getLocatorQualityProfile('high'));
const LocatorInteractionContext = createContext({ onShelfClick: null });

const CAMERA_TARGETS = {
    1: {
        lookAt: [0, 1.45, 0],
        position: [14, 10.2, 14],
    },
    2: {
        lookAt: [1.8, FLOOR_HEIGHT + 1.25, -2.8],
        position: [14, FLOOR_HEIGHT + 8.8, 14],
    },
};

function buildFloorCameraTarget(activeFloor, floorHeight = FLOOR_HEIGHT) {
    const floorTarget = CAMERA_TARGETS[activeFloor] ?? CAMERA_TARGETS[1];
    const verticalOffset = activeFloor === 2 ? floorHeight - FLOOR_HEIGHT : 0;

    return {
        lookAt: new THREE.Vector3(floorTarget.lookAt[0], floorTarget.lookAt[1] + verticalOffset, floorTarget.lookAt[2]),
        position: new THREE.Vector3(floorTarget.position[0], floorTarget.position[1] + verticalOffset, floorTarget.position[2]),
    };
}

function buildTopDownCameraTarget(activeFloor, floorHeight = FLOOR_HEIGHT) {
    const floorTarget = CAMERA_TARGETS[activeFloor] ?? CAMERA_TARGETS[1];
    const [x, y, z] = floorTarget.lookAt;
    const verticalOffset = activeFloor === 2 ? floorHeight - FLOOR_HEIGHT : 0;

    return {
        lookAt: new THREE.Vector3(x, y + verticalOffset, z),
        position: new THREE.Vector3(x, y + verticalOffset + 18.5, z + 0.01),
    };
}

function buildObjectCameraTarget(object, offset = [5.8, 3.6, 5.8]) {
    if (!object) {
        return null;
    }

    const [x, y, z] = object.position;
    const height = Number(object.dimensions?.height || 1);

    return {
        lookAt: new THREE.Vector3(x, y + (height / 2), z),
        position: new THREE.Vector3(x + offset[0], y + height + offset[1], z + offset[2]),
    };
}

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
    const xrayMode = useLocator3DStore((state) => state.xrayMode);
    const edgeColor = located ? LOCATED_EDGE : locked ? LOCKED_EDGE : SELECTED_EDGE;
    const active = selected || located;

    return (
        <mesh castShadow receiveShadow={receiveShadow} position={position} rotation={rotation}>
            <boxGeometry args={args} />
            <meshStandardMaterial
                color={located ? '#fff7a8' : selected ? '#1e3a5f' : color}
                emissive={located ? LOCATED_EMISSIVE : selected ? SELECTED_EMISSIVE : emissive}
                emissiveIntensity={located ? 1.05 : selected ? 0.34 : 0.02}
                metalness={located ? 0.18 : 0.1}
                depthWrite={!xrayMode}
                opacity={xrayMode && !active ? 0.18 : locked ? Math.min(opacity, 0.68) : opacity}
                roughness={located ? 0.38 : 0.56}
                transparent={xrayMode || opacity < 1 || locked}
            />
            {(active || locked) && <Edges color={edgeColor} scale={active ? 1.045 : 1.015} threshold={12} />}
        </mesh>
    );
}

function Label({ children, position, rotation = [0, 0, 0], testId, tone = 'default' }) {
    const showLabels = useLocator3DStore((state) => state.showLabels);
    const quality = useContext(LocatorQualityContext);

    if (!showLabels || !quality.labels) {
        return null;
    }

    return (
        <Html
            center
            data-testid={testId}
            distanceFactor={8}
            position={position}
            rotation={rotation}
            zIndexRange={[20, 0]}
        >
            <div className={`whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-black tracking-[0.08em] shadow-lg backdrop-blur ${
                tone === 'floor'
                    ? 'border-slate-500/40 bg-slate-950/78 text-slate-300'
                    : 'border-sky-200/30 bg-slate-950/82 text-sky-100'
            }`}
            >
                {children}
            </div>
        </Html>
    );
}

function LockBadge({ position }) {
    return (
        <Html center position={position}>
            <div className="pointer-events-none rounded-full border border-amber-300 bg-amber-100/95 px-2 py-1 text-[10px] font-black tracking-[0.18em] text-amber-800 shadow-lg">
                LOCKED
            </div>
        </Html>
    );
}

function objectVisibleOnFloor(object, activeFloor) {
    const floor = Number(activeFloor) === 2 ? 2 : 1;

    if (object.type === 'stairs') {
        return true;
    }

    if (SHARED_FLOOR_TYPES.has(object.type)) {
        return true;
    }

    if (object.type === 'wall') {
        return Number(object.floor || 1) === floor;
    }

    if (Array.isArray(object.floors)) {
        return object.floors.map(Number).includes(floor);
    }

    return Number(object.floor || 1) === floor;
}

function useSceneFloorHeight() {
    return useLocator3DStore((state) => {
        const floor = state.sceneObjects.find((object) => object.type === 'floor');
        const height = Number(floor?.dimensions?.height);
        return Number.isFinite(height) && height > 0 ? height : FLOOR_HEIGHT;
    });
}

function HighlightHalo({ object }) {
    const haloRef = useRef();
    const quality = useContext(LocatorQualityContext);
    const width = Number(object.dimensions?.width || 1);
    const height = Number(object.dimensions?.height || 1);
    const depth = Number(object.dimensions?.depth || 1);

    useFrame(({ clock }) => {
        if (!quality.bloom || !haloRef.current) {
            return;
        }

        const pulse = 1 + (Math.sin(clock.elapsedTime * 3.2) * 0.035);
        haloRef.current.scale.setScalar(pulse);

        if (haloRef.current.material) {
            haloRef.current.material.opacity = 0.18 + (Math.sin(clock.elapsedTime * 3.2) * 0.045);
        }

    });

    return (
        <mesh data-testid={`locator-highlight-${object.id}`} position={[0, height / 2, 0]} ref={haloRef}>
            <boxGeometry args={[width + 0.58, height + 0.54, depth + 0.58]} />
            <meshBasicMaterial color="#fde047" depthWrite={false} opacity={0.2} transparent wireframe />
        </mesh>
    );
}

function ObjectInfoBadge({ object }) {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const quality = useContext(LocatorQualityContext);

    if (!quality.labels || isDesignMode || selectedObjectId !== object.id) {
        return null;
    }

    const height = Number(object.dimensions?.height || 1);
    const isShelf = isShelfObject(object);
    const matchingLocations = productLocations.filter((location) => (
        location.shelfObjectId === object.id
        || (normalizeAisle(location.aisle) === normalizeAisle(object.aisle) && Number(location.shelfNumber) === Number(object.shelfNumber))
    ));
    const subtitle = isShelf
        ? `Shelf ${object.shelfNumber || '-'} / ${object.binCount || 0} bins`
        : object.type?.replace(/-/g, ' ') || 'Scene object';

    return (
        <Html center data-testid={`locator-info-${object.id}`} distanceFactor={7} position={[0, height + 0.78, 0]} zIndexRange={[40, 0]}>
            <div className="min-w-[180px] rounded-xl border border-sky-200/30 bg-slate-950/90 p-3 text-left text-white shadow-2xl backdrop-blur">
                <p className="text-[11px] font-black text-slate-100">{object.name || object.id}</p>
                <p className="mt-1 text-[10px] font-bold text-sky-200">{subtitle}</p>
                {isShelf && (
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                        {matchingLocations.length} assigned item{matchingLocations.length === 1 ? '' : 's'}
                    </p>
                )}
            </div>
        </Html>
    );
}

function TransformableObject({ children, object, onTransformingChange }) {
    const groupRef = useRef();
    const dragRef = useRef(null);
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const selectObject = useLocator3DStore((state) => state.selectObject);
    const goToFloor = useLocator3DStore((state) => state.goToFloor);
    const beginObjectTransform = useLocator3DStore((state) => state.beginObjectTransform);
    const commitObjectTransform = useLocator3DStore((state) => state.commitObjectTransform);
    const previewObjectTransform = useLocator3DStore((state) => state.previewObjectTransform);
    const { onShelfClick } = useContext(LocatorInteractionContext);
    const selected = isDesignMode && selectedObjectId === object.id;
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

        previewObjectTransform(object.id, {
            position: [groupRef.current.position.x, groupRef.current.position.y, groupRef.current.position.z],
            rotation: [groupRef.current.rotation.x, groupRef.current.rotation.y, groupRef.current.rotation.z],
        });
    };

    const handleClick = (event) => {
        event.stopPropagation?.();

        if (!isDesignMode) {
            if (object.type === 'stairs') {
                goToFloor(activeFloor === 2 ? 1 : 2);
                return;
            }

            if (isShelfObject(object)) {
                onShelfClick?.(object);
            }
            return;
        }

        // Locked objects stay selectable in Design Mode so the toolbar can
        // unlock them. The lock still blocks transforms and other edits.
        selectObject(object.id, { additive: Boolean(event.shiftKey), allowLocked: true });
    };

    const handlePointerDown = (event) => {
        if (!isDesignMode || activeTool !== 'move' || object.isLocked || !selected) {
            return;
        }

        event.stopPropagation?.();
        event.target?.setPointerCapture?.(event.pointerId);
        const floorY = Number(object.floor) === 2 ? FLOOR_HEIGHT : 0;
        dragRef.current = {
            floor: new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY),
            offset: new THREE.Vector3(object.position[0] - event.point.x, 0, object.position[2] - event.point.z),
        };
        beginObjectTransform(object.id);
        onTransformingChange(true);
    };

    const handlePointerMove = (event) => {
        if (!dragRef.current) {
            return;
        }

        const point = new THREE.Vector3();
        if (!event.ray?.intersectPlane?.(dragRef.current.floor, point)) {
            return;
        }

        previewObjectTransform(object.id, {
            position: [point.x + dragRef.current.offset.x, object.position[1], point.z + dragRef.current.offset.z],
            rotation: object.rotation,
        });
    };

    const finishPointerDrag = (event) => {
        if (!dragRef.current) {
            return;
        }
        event.target?.releasePointerCapture?.(event.pointerId);
        dragRef.current = null;
        onTransformingChange(false);
        commitObjectTransform(object.id);
    };

    return (
        <>
            <group
                data-testid={`locator-object-${object.id}`}
                name={object.id}
                onClick={handleClick}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={finishPointerDrag}
                onPointerOver={(event) => {
                    if (isDesignMode && event.nativeEvent?.target) {
                        event.nativeEvent.target.style.cursor = object.isLocked ? 'not-allowed' : selected ? 'grab' : 'pointer';
                    }
                }}
                position={object.position}
                ref={groupRef}
                rotation={object.rotation}
            >
                {children({ located, locked: object.isLocked, selected })}
                <ResizeHandles object={object} />
                {located && <HighlightHalo object={object} />}
                {object.isLocked && <LockBadge position={[0, (object.dimensions?.height ?? 1) + 0.45, 0]} />}
                <ObjectInfoBadge object={object} />
            </group>
            {canTransform && activeTool === 'rotate' && (
                <TransformControls
                    mode={transformMode}
                    object={groupRef}
                    onMouseDown={() => {
                        beginObjectTransform(object.id);
                        onTransformingChange(true);
                    }}
                    onMouseUp={() => {
                        onTransformingChange(false);
                        commitObjectTransform(object.id);
                    }}
                    onObjectChange={handleObjectChange}
                    rotationSnap={Math.PI / 12}
                    showX={false}
                    showY
                    showZ={false}
                    size={0.82}
                    translationSnap={0.25}
                />
            )}
        </>
    );
}

function FloorObject({ object, onTransformingChange }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const stairsObject = useLocator3DStore((state) => state.sceneObjects.find((candidate) => candidate.type === 'stairs'));
    const floorHeight = useSceneFloorHeight();
    const width = Number(object.dimensions?.width || 18);
    const depth = Number(object.dimensions?.depth || 14);
    const floorY = activeFloor === 2 ? floorHeight : 0;
    const entranceZ = (depth / 2) - 0.72;
    const laneLength = Math.max(1.2, depth * 0.36);
    const laneXs = [-0.3, -0.1, 0.1, 0.3].map((ratio) => width * ratio);
    const floorPanels = useMemo(() => {
        // Stairs run left-to-right along world X, matching the saved width.
        const stairWidth = Number(stairsObject?.dimensions?.width || 6.2) + 0.48;
        const stairDepth = Number(stairsObject?.dimensions?.depth || 2.8) + 0.48;
        const stairX = Number(stairsObject?.position?.[0] || 0);
        const stairZ = Number(stairsObject?.position?.[2] || 0);
        const halfOpeningWidth = Math.min(Math.max(0.5, stairWidth / 2), Math.max(0.5, (width / 2) - 0.12));
        const halfOpeningDepth = Math.min(Math.max(0.5, stairDepth / 2), Math.max(0.5, (depth / 2) - 0.12));
        const openingMinX = Math.max(-width / 2 + 0.08, stairX - halfOpeningWidth);
        const openingMaxX = Math.min(width / 2 - 0.08, stairX + halfOpeningWidth);
        const openingMinZ = Math.max(-depth / 2 + 0.08, stairZ - halfOpeningDepth);
        const openingMaxZ = Math.min(depth / 2 - 0.08, stairZ + halfOpeningDepth);

        if (activeFloor !== 2 || !stairsObject) {
            return [{ depth, width, x: 0, z: 0 }];
        }

        const panels = [
            { depth, width: openingMinX + (width / 2), x: (-width / 2) + ((openingMinX + (width / 2)) / 2), z: 0 },
            { depth, width: (width / 2) - openingMaxX, x: openingMaxX + (((width / 2) - openingMaxX) / 2), z: 0 },
            { depth: openingMinZ + (depth / 2), width: openingMaxX - openingMinX, x: (openingMinX + openingMaxX) / 2, z: (-depth / 2) + ((openingMinZ + (depth / 2)) / 2) },
            { depth: (depth / 2) - openingMaxZ, width: openingMaxX - openingMinX, x: (openingMinX + openingMaxX) / 2, z: openingMaxZ + (((depth / 2) - openingMaxZ) / 2) },
        ];

        return panels.filter((panel) => panel.width > 0.1 && panel.depth > 0.1);
    }, [activeFloor, depth, stairsObject, width]);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    {floorPanels.map((panel, index) => (
                        <group key={`floor-panel-${index}`}>
                            <Block
                                args={[panel.width, 0.18, panel.depth]}
                                color="#1f1f1f"
                                located={located}
                                locked={locked}
                                position={[panel.x, floorY - 0.09, panel.z]}
                                selected={selected}
                            />
                            <mesh position={[panel.x, floorY + 0.012, panel.z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                                <planeGeometry args={[Math.max(0.1, panel.width - 0.55), Math.max(0.1, panel.depth - 0.55)]} />
                                <meshStandardMaterial color="#263246" roughness={0.82} metalness={0.08} />
                            </mesh>
                        </group>
                    ))}
                    <mesh position={[0, floorY + 0.026, entranceZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                        <planeGeometry args={[Math.min(width * 0.36, 5.2), Math.min(depth * 0.16, 1.4)]} />
                        <meshStandardMaterial color="#243b53" roughness={0.72} />
                    </mesh>
                    {laneXs.map((x) => (
                        <mesh key={`lane-${x}`} position={[x, floorY + 0.028, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                            <planeGeometry args={[0.075, laneLength]} />
                            <meshBasicMaterial color="#f8c76a" transparent opacity={0.62} />
                        </mesh>
                    ))}
                    {activeFloor === 1 && (
                        <>
                            <Label position={[-Math.max(1, width / 2 - 1.3), floorY + 0.1, entranceZ]} tone="floor">ENTRANCE</Label>
                            <Label position={[-Math.max(1, width / 2 - 3.6), floorY + 0.18, entranceZ - 1.02]} tone="floor">CHECKOUT</Label>
                            <Label position={[0, floorY + 0.12, entranceZ - 0.1]} tone="floor">CUSTOMER WALKWAY</Label>
                        </>
                    )}
                    <Label position={[-width / 2 + 1.55, floorY + 0.14, -depth / 2 + 0.55]} tone="floor">{`FLOOR ${activeFloor}`}</Label>
                    {activeFloor === 2 && stairsObject && <Label position={[stairsObject.position[0], floorY + 0.16, stairsObject.position[2]]} tone="floor">STAIR OPENING · FLOOR 1</Label>}
                </>
            )}
        </TransformableObject>
    );
}

function WallsObject({ object, onTransformingChange }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const floorHeight = useSceneFloorHeight();
    const width = Number(object.dimensions?.width || 18);
    const depth = Number(object.dimensions?.depth || 14);
    const height = Math.max(0.5, Math.min(Number(object.dimensions?.height || FLOOR_HEIGHT), 8));
    const floorY = activeFloor === 2 ? floorHeight : 0;
    const halfWidth = width / 2;
    const halfDepth = depth / 2;

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width + 0.2, height, 0.24]} color="#cbd5e1" located={located} locked={locked} position={[0, floorY + height / 2, -halfDepth - 0.1]} selected={selected} />
                    <Block args={[0.24, height, depth + 0.2]} color="#cbd5e1" located={located} locked={locked} position={[-halfWidth - 0.1, floorY + height / 2, 0]} selected={selected} />
                    <Block args={[0.24, height, depth + 0.2]} color="#cbd5e1" located={located} locked={locked} position={[halfWidth + 0.1, floorY + height / 2, 0]} selected={selected} />
                    <Block args={[width * 0.38, height, 0.24]} color="#cbd5e1" located={located} locked={locked} position={[-width * 0.32, floorY + height / 2, halfDepth + 0.1]} selected={selected} />
                    <Block args={[width * 0.38, height, 0.24]} color="#cbd5e1" located={located} locked={locked} position={[width * 0.32, floorY + height / 2, halfDepth + 0.1]} selected={selected} />
                </>
            )}
        </TransformableObject>
    );
}

function WallEndpoint({ endpoint, object }) {
    const dragRef = useRef(null);
    const beginObjectTransform = useLocator3DStore((state) => state.beginObjectTransform);
    const commitObjectTransform = useLocator3DStore((state) => state.commitObjectTransform);
    const previewWallEndpoint = useLocator3DStore((state) => state.previewWallEndpoint);

    const getPoint = (event) => {
        const point = new THREE.Vector3();
        return event.ray?.intersectPlane?.(dragRef.current?.floor, point)
            ? [point.x, point.y, point.z]
            : null;
    };

    return (
        <mesh
            onPointerDown={(event) => {
                event.stopPropagation();
                event.target?.setPointerCapture?.(event.pointerId);
                const floorY = Number(object.floor) === 2 ? FLOOR_HEIGHT : 0;
                dragRef.current = { floor: new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY) };
                beginObjectTransform(object.id);
            }}
            onPointerMove={(event) => {
                if (!dragRef.current) return;
                event.stopPropagation();
                const point = getPoint(event);
                if (point) previewWallEndpoint(object.id, endpoint, point);
            }}
            onPointerUp={(event) => {
                event.stopPropagation();
                event.target?.releasePointerCapture?.(event.pointerId);
                dragRef.current = null;
                commitObjectTransform(object.id);
            }}
            position={[endpoint === 'start' ? -Number(object.dimensions?.width || 1) / 2 : Number(object.dimensions?.width || 1) / 2, 0.14, 0]}
        >
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial color="#f8fafc" emissive="#38bdf8" emissiveIntensity={0.8} roughness={0.32} />
        </mesh>
    );
}

function ResizeHandle({ object, signX, signZ }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const floorHeight = useSceneFloorHeight();
    const dragRef = useRef(null);
    const beginObjectTransform = useLocator3DStore((state) => state.beginObjectTransform);
    const commitObjectTransform = useLocator3DStore((state) => state.commitObjectTransform);
    const previewObjectDimensions = useLocator3DStore((state) => state.previewObjectDimensions);
    const width = Number(object.dimensions?.width || 1);
    const depth = Number(object.dimensions?.depth || 1);

    const resizeFromPoint = (event) => {
        const point = new THREE.Vector3();
        if (!event.ray?.intersectPlane?.(dragRef.current?.floor, point)) {
            return;
        }
        const deltaX = point.x - Number(object.position?.[0] || 0);
        const deltaZ = point.z - Number(object.position?.[2] || 0);
        const yaw = Number(object.rotation?.[1] || 0);
        const localX = (Math.cos(yaw) * deltaX) - (Math.sin(yaw) * deltaZ);
        const localZ = (Math.sin(yaw) * deltaX) + (Math.cos(yaw) * deltaZ);
        previewObjectDimensions(object.id, {
            depth: Math.max(0.25, Math.abs(localZ) * 2),
            width: Math.max(0.25, Math.abs(localX) * 2),
        });
    };

    return (
        <mesh
            onPointerDown={(event) => {
                event.stopPropagation();
                event.target?.setPointerCapture?.(event.pointerId);
                const floorY = object.type === 'floor' || object.type === 'walls'
                    ? (activeFloor === 2 ? floorHeight : 0)
                    : (Number(object.floor) === 2 ? FLOOR_HEIGHT : 0);
                dragRef.current = { floor: new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY) };
                beginObjectTransform(object.id);
            }}
            onPointerMove={(event) => {
                if (!dragRef.current) return;
                event.stopPropagation();
                resizeFromPoint(event);
            }}
            onPointerUp={(event) => {
                if (!dragRef.current) return;
                event.stopPropagation();
                event.target?.releasePointerCapture?.(event.pointerId);
                dragRef.current = null;
                commitObjectTransform(object.id);
            }}
            position={[signX * width / 2, (object.type === 'floor' || object.type === 'walls') && activeFloor === 2 ? floorHeight + 0.14 : 0.14, signZ * depth / 2]}
        >
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color="#f8fafc" emissive="#22d3ee" emissiveIntensity={0.92} roughness={0.24} />
        </mesh>
    );
}

function ResizeHandles({ object }) {
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);

    if (!isDesignMode || selectedObjectId !== object.id || object.isLocked || activeTool === 'rotate' || object.type === 'wall' || object.type === 'stairs') {
        return null;
    }

    return (
        <>
            {[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([signX, signZ]) => (
                <ResizeHandle key={`${signX}-${signZ}`} object={object} signX={signX} signZ={signZ} />
            ))}
        </>
    );
}

function WallSegmentObject({ object, onTransformingChange }) {
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const width = Number(object.dimensions?.width || 1);
    const height = Number(object.dimensions?.height || 2.7);
    const depth = Number(object.dimensions?.depth || 0.18);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width, height, depth]} color="#64748b" located={located} locked={locked} opacity={0.9} position={[0, height / 2, 0]} selected={selected} />
                    {selected && isDesignMode && activeTool !== 'rotate' && !locked && (
                        <>
                            <WallEndpoint endpoint="start" object={object} />
                            <WallEndpoint endpoint="end" object={object} />
                            <Label position={[0, height + 0.34, 0]} tone="floor">{`${width.toFixed(2)}m wall`}</Label>
                        </>
                    )}
                </>
            )}
        </TransformableObject>
    );
}

function ProductMarker({ highlighted, location, position }) {
    const markerRef = useRef();
    const showLabels = useLocator3DStore((state) => state.showLabels);
    const isRecentlyReceived = useLocator3DStore((state) => state.isRecentlyReceivedProduct(location.productId || location.sku));
    const quality = useContext(LocatorQualityContext);
    const activeHighlight = highlighted || isRecentlyReceived;

    useFrame(({ clock }) => {
        if (!quality.bloom || !activeHighlight || !markerRef.current?.material) {
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
                    color={activeHighlight ? '#fde047' : '#fb7185'}
                    emissive={activeHighlight ? '#facc15' : '#be123c'}
                    emissiveIntensity={activeHighlight ? 0.8 : 0.25}
                    roughness={0.42}
                />
                {activeHighlight && <Edges color="#facc15" scale={1.25} threshold={8} />}
            </mesh>
            {activeHighlight && showLabels && quality.labels && (
                <Html center position={[0, 0.42, 0]}>
                    <div className="rounded-full border border-yellow-200 bg-yellow-100 px-2 py-1 text-[10px] font-black text-yellow-900 shadow-lg">
                        {isRecentlyReceived ? 'Newly Received' : `Bin ${location.binNumber}`}
                    </div>
                </Html>
            )}
        </group>
    );
}

function ShelfObject({ object, onTransformingChange }) {
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const quality = useContext(LocatorQualityContext);
    const layers = Math.min(12, Math.max(1, Math.round(Number(object.layerCount ?? (object.type === 'shelf-4-layer' ? 4 : 2)))));
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
                                args={[width + 0.1, 0.08, 0.05]}
                                color="#f3c969"
                                located={located}
                                locked={locked}
                                position={[0, level + 0.09, depth / 2 + 0.02]}
                                selected={selected}
                            />
                            <Block
                                args={[width + 0.35, 0.12, depth + 0.18]}
                                color={accentColor}
                                located={located}
                                locked={locked}
                                position={[0, level, 0]}
                                selected={selected}
                            />
                            {quality.tier !== 'low' && slotPositions.map((x, index) => (
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
                    <Block
                        args={[width, height - 0.2, 0.08]}
                        color="#1e293b"
                        located={located}
                        locked={locked}
                        opacity={0.7}
                        position={[0, height / 2, depth / 2 - 0.05]}
                        selected={selected}
                    />
                    <Block
                        args={[width + 0.12, 0.28, depth + 0.08]}
                        color="#111827"
                        located={located}
                        locked={locked}
                        position={[0, height + 0.14, 0]}
                        selected={selected}
                    />
                    <Label position={[0, height + 0.38, depth / 2 + 0.18]} tone="floor">
                        {`AISLE ${normalizeAisle(object.aisle)} · ${object.binCount || 0} BINS`}
                    </Label>
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
                    <Label position={[0, height + 0.18, depth / 2 + 0.28]} rotation={[-0.5, 0, 0]} testId={`locator-label-${object.id}`}>
                        {`Aisle ${object.aisle} Shelf ${object.shelfNumber}`}
                    </Label>
                </>
            )}
        </TransformableObject>
    );
}

function PartsCabinetObject({ object, onTransformingChange }) {
    const width = Number(object.dimensions?.width || 3.2);
    const depth = Number(object.dimensions?.depth || 0.9);
    const height = Number(object.dimensions?.height || 2.35);
    const drawerCount = Math.max(6, Math.min(16, Number(object.binCount || 12)));
    const columns = 4;
    const rows = Math.ceil(drawerCount / columns);
    const drawerWidth = (width - 0.35) / columns;
    const drawerHeight = Math.max(0.16, (height - 0.38) / rows);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <>
                    <Block args={[width, height, depth]} color="#312e81" located={located} locked={locked} position={[0, height / 2, 0]} selected={selected} />
                    {Array.from({ length: drawerCount }, (_, index) => {
                        const column = index % columns;
                        const row = Math.floor(index / columns);
                        return (
                            <Block
                                args={[Math.max(0.18, drawerWidth - 0.08), Math.max(0.1, drawerHeight - 0.08), 0.08]}
                                color={index % 3 === 0 ? '#8b5cf6' : '#6366f1'}
                                key={`drawer-${index}`}
                                located={located}
                                locked={locked}
                                position={[-width / 2 + drawerWidth / 2 + column * drawerWidth, 0.22 + drawerHeight / 2 + row * drawerHeight, depth / 2 + 0.04]}
                                selected={selected}
                            />
                        );
                    })}
                    <Label position={[0, height + 0.28, depth / 2 + 0.16]} tone="floor">SMALL PARTS</Label>
                </>
            )}
        </TransformableObject>
    );
}

function StairsObject({ object, onTransformingChange }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const floorHeight = useSceneFloorHeight();
    const runLength = Number(object.dimensions?.width || 6.2);
    const stairWidth = Number(object.dimensions?.depth || 2.8);
    const height = Number(object.dimensions?.height || FLOOR_HEIGHT);
    const stairBaseY = activeFloor === 2 ? floorHeight - height : 0;
    const stepCount = Math.max(10, Math.min(20, Math.round(runLength * 2.4)));
    const treadDepth = runLength / stepCount;
    const stepHeight = height / stepCount;
    const stepColor = '#a8b8cb';
    const riserColor = '#7d91a8';
    const sideColor = '#52677f';
    const railLength = Math.hypot(runLength, height);
    const railAngle = Math.atan2(height, runLength);

    return (
        <TransformableObject object={object} onTransformingChange={onTransformingChange}>
            {({ located, locked, selected }) => (
                <group position={[0, stairBaseY, 0]}>
                    {Array.from({ length: stepCount }, (_, index) => (
                        <Block
                            args={[treadDepth + 0.035, stepHeight * (index + 1), stairWidth]}
                            color={stepColor}
                            located={located}
                            locked={locked}
                            position={[-runLength / 2 + (treadDepth * index) + (treadDepth / 2), (stepHeight * (index + 1)) / 2, 0]}
                            selected={selected}
                            key={`stair-step-${index}`}
                        />
                    ))}
                    <Block args={[treadDepth + 0.3, 0.18, stairWidth + 0.28]} color={riserColor} located={located} locked={locked} position={[-runLength / 2 - 0.12, 0.09, 0]} selected={selected} />
                    <Block args={[treadDepth + 0.3, 0.18, stairWidth + 0.28]} color={riserColor} located={located} locked={locked} position={[runLength / 2 + 0.12, height + 0.09, 0]} selected={selected} />
                    {[-1, 1].map((side) => (
                        <Block
                            args={[railLength, 0.18, 0.16]}
                            color={sideColor}
                            key={`stair-stringer-${side}`}
                            located={located}
                            locked={locked}
                            position={[0, height / 2, side * (stairWidth / 2 + 0.14)]}
                            rotation={[0, 0, railAngle]}
                            selected={selected}
                        />
                    ))}
                    <Label position={[-runLength / 2 - 0.24, height + 0.32, 0]}>{`LEFT-TO-RIGHT STAIRS · ${activeFloor === 1 ? 'UP TO FLOOR 2' : 'DOWN TO FLOOR 1'}`}</Label>
                </group>
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
                    <Block args={[0.14, height, depth]} color="#334155" located={located} locked={locked} position={[-width / 2, height / 2, 0]} selected={selected} />
                    <Block args={[0.14, height, depth]} color="#334155" located={located} locked={locked} position={[width / 2, height / 2, 0]} selected={selected} />
                    <Block args={[width + 0.28, 0.14, depth]} color="#1e293b" located={located} locked={locked} position={[0, height, 0]} selected={selected} />
                    <Block args={[width + 0.28, 0.12, depth]} color="#475569" located={located} locked={locked} position={[0, 0.06, 0]} selected={selected} />
                    <mesh position={[0, height / 2, depth * 0.08]} castShadow receiveShadow>
                        <boxGeometry args={[Math.max(0.2, width - 0.28), Math.max(0.2, height - 0.28), Math.max(0.03, depth * 0.45)]} />
                        <meshPhysicalMaterial color="#bae6fd" transmission={0.35} thickness={0.04} roughness={0.12} metalness={0.08} opacity={0.38} transparent />
                    </mesh>
                    <Block args={[0.09, 0.38, 0.08]} color="#e2e8f0" located={located} locked={locked} position={[width * 0.32, height * 0.5, depth * 0.35]} selected={selected} />
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

    if (object.type === 'wall') {
        return <WallSegmentObject object={object} onTransformingChange={onTransformingChange} />;
    }

    if (isShelfObject(object) && object.type !== 'parts-cabinet') {
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

    if (object.type === 'parts-cabinet') {
        return <PartsCabinetObject object={object} onTransformingChange={onTransformingChange} />;
    }

    return null;
}

function buildPathPoints(sceneObjects, locatedProduct) {
    return buildObstacleAwarePath(sceneObjects, locatedProduct);
}

function MovingPathDot({ points, sequence }) {
    const dotRef = useRef();
    const animationStartRef = useRef(null);
    const vectors = useMemo(() => points.map((point) => new THREE.Vector3(...point)), [points]);

    useEffect(() => {
        animationStartRef.current = null;
    }, [points, sequence]);

    useFrame(({ clock, invalidate }) => {
        if (!dotRef.current || vectors.length < 2) {
            return;
        }

        if (animationStartRef.current === null) {
            animationStartRef.current = clock.elapsedTime;
        }

        const totalSegments = vectors.length - 1;
        const elapsed = clock.elapsedTime - animationStartRef.current;
        const progress = (elapsed * 0.32) % 1;
        const segmentProgress = progress * totalSegments;
        const segmentIndex = Math.min(totalSegments - 1, Math.floor(segmentProgress));
        const localProgress = segmentProgress - segmentIndex;
        dotRef.current.position.lerpVectors(vectors[segmentIndex], vectors[segmentIndex + 1], localProgress);

        // A route is a brief directional cue, not a permanent render loop.
        // The next explicit locate/path action restarts it through `sequence`.
        if (elapsed < 5) {
            invalidate();
        }
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
    const showPaths = useLocator3DStore((state) => state.showPaths);
    const points = useMemo(() => buildPathPoints(sceneObjects, locatedProduct), [locatedProduct, sceneObjects]);

    if (!showPaths || points.length < 2) {
        return null;
    }

    return (
        <group>
            <Line
                color="#22c55e"
                data-testid="locator-path-glow"
                lineWidth={6}
                opacity={0.42}
                points={points}
                transparent
            />
            <Line
                color="#dcfce7"
                dashScale={1}
                dashSize={0.72}
                dashed
                data-testid="locator-path-dashed"
                gapSize={0.34}
                lineWidth={2.25}
                opacity={0.98}
                points={points}
                transparent
            />
            <Line
                color="#bbf7d0"
                lineWidth={0.9}
                opacity={0.62}
                points={points}
                transparent
            />
            <MovingPathDot points={points} sequence={pathAnimationRequest} />
        </group>
    );
}

function CameraRig({ controlsRef, isTransforming }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const floorHeight = useSceneFloorHeight();
    const cameraFocusRequest = useLocator3DStore((state) => state.cameraFocusRequest);
    const cameraPresetRequest = useLocator3DStore((state) => state.cameraPresetRequest);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const { camera } = useThree();
    const activeTargetRef = useRef(null);
    const isAnimatingRef = useRef(true);
    const targetTriggerRef = useRef('');
    const target = useMemo(() => {
        if (cameraPresetRequest?.preset === 'overview') {
            return buildFloorCameraTarget(activeFloor, floorHeight);
        }

        if (cameraPresetRequest?.preset === 'topDown') {
            return buildTopDownCameraTarget(activeFloor, floorHeight);
        }

        if (cameraPresetRequest?.preset === 'counter') {
            const counter = getCounterObject(sceneObjects);

            if (counter) {
                const [x, y, z] = counter.position;
                const height = Number(counter.dimensions?.height || 1);

                return {
                    lookAt: new THREE.Vector3(x, y + (height * 0.58), z),
                    position: new THREE.Vector3(x + 4.6, y + height + 2.6, z + 4.4),
                };
            }
        }

        if (cameraPresetRequest?.preset === 'selected') {
            const selectedObject = sceneObjects.find((object) => object.id === selectedObjectId)
                ?? sceneObjects.find((object) => object.id === locatedProduct?.shelfObjectId);
            const selectedTarget = buildObjectCameraTarget(selectedObject);

            if (selectedTarget) {
                return selectedTarget;
            }
        }

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
        const focusedTarget = buildObjectCameraTarget(focusedObject);

        if (focusedTarget) {
            return focusedTarget;
        }

        return buildFloorCameraTarget(activeFloor, floorHeight);
    }, [activeFloor, cameraFocusRequest, cameraPresetRequest, floorHeight, locatedProduct, sceneObjects, selectedObjectId]);

    const targetTrigger = [
        activeFloor,
        cameraFocusRequest?.sequence || 0,
        cameraPresetRequest?.sequence || 0,
        locatedProduct?.productId || '',
        locatedProduct?.shelfObjectId || '',
        locatedProduct?.binNumber || '',
    ].join(':');

    useEffect(() => {
        if (isTransforming || targetTriggerRef.current === targetTrigger) {
            return;
        }

        targetTriggerRef.current = targetTrigger;
        activeTargetRef.current = target;
        isAnimatingRef.current = true;
    }, [isTransforming, target, targetTrigger]);

    useFrame((state) => {
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
            return;
        }

        state.invalidate();
    });

    return null;
}

function RenderScheduler() {
    const { invalidate = () => {}, setFrameloop = () => {} } = useThree();

    useEffect(() => {
        const updateRenderState = () => {
            const isHidden = typeof document !== 'undefined' && document.hidden;
            setFrameloop(isHidden ? 'never' : 'demand');

            if (!isHidden) {
                invalidate();
            }
        };

        updateRenderState();
        document?.addEventListener?.('visibilitychange', updateRenderState);

        return () => document?.removeEventListener?.('visibilitychange', updateRenderState);
    }, [invalidate, setFrameloop]);

    return null;
}

function WebGLContextLossHandler({ onContextLost }) {
    const { gl } = useThree();

    useEffect(() => {
        const canvas = gl?.domElement;
        if (!canvas) {
            return undefined;
        }

        const handleContextLoss = (event) => {
            event.preventDefault?.();
            onContextLost();
        };

        canvas.addEventListener('webglcontextlost', handleContextLoss, false);
        return () => canvas.removeEventListener('webglcontextlost', handleContextLoss, false);
    }, [gl, onContextLost]);

    return null;
}

export function Locator2DFallback({ message = 'The interactive 3D map is unavailable on this device.' }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const rows = productLocations
        .filter((location) => Number(location.floor || 1) === activeFloor)
        .slice(0, 50);
    const shelfCount = sceneObjects.filter((object) => objectVisibleOnFloor(object, activeFloor) && isShelfObject(object) && object.type !== 'parts-cabinet').length;

    return (
        <section className="h-full overflow-auto bg-slate-950 p-5 text-slate-100" data-testid="locator-2d-fallback">
            <div className="mx-auto max-w-3xl space-y-4">
                <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
                    <p className="text-sm font-black text-amber-100">2D stockroom fallback</p>
                    <p className="mt-1 text-sm text-amber-50/80">{message} Use the product search and this floor’s location table to continue locating inventory.</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><span className="block text-xs font-bold uppercase tracking-wide text-slate-400">Floor</span><strong>Floor {activeFloor}</strong></div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3"><span className="block text-xs font-bold uppercase tracking-wide text-slate-400">Shelves</span><strong>{shelfCount}</strong></div>
                </div>
                <div className="overflow-hidden rounded-xl border border-white/10">
                    <table className="min-w-full text-left text-sm">
                        <thead className="bg-white/[0.06] text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-2">Product</th><th className="px-3 py-2">Aisle</th><th className="px-3 py-2">Shelf</th><th className="px-3 py-2">Bin</th></tr></thead>
                        <tbody>
                            {rows.map((location) => <tr className="border-t border-white/10" key={`${location.productId}-${location.binNumber}`}><td className="px-3 py-2">{location.productName || location.sku || 'Unassigned product'}</td><td className="px-3 py-2">{normalizeAisle(location.aisle) || '-'}</td><td className="px-3 py-2">{location.shelfNumber || '-'}</td><td className="px-3 py-2">{location.binNumber || '-'}</td></tr>)}
                            {rows.length === 0 && <tr><td className="px-3 py-5 text-slate-400" colSpan="4">No saved product locations on this floor.</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

class CanvasErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch() {
        this.props.onFailure();
    }

    render() {
        return this.state.hasError ? <Locator2DFallback /> : this.props.children;
    }
}

function SceneContents({ onContextLost, onShelfClick, quality }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const floorHeight = useSceneFloorHeight();
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const showGrid = useLocator3DStore((state) => state.showGrid);
    const controlsRef = useRef();
    const [isTransforming, setIsTransforming] = useState(false);
    const visibleSceneObjects = useMemo(
        () => sceneObjects.filter((object) => objectVisibleOnFloor(object, activeFloor)),
        [activeFloor, sceneObjects],
    );
    const activeGridY = activeFloor === 2 ? floorHeight + 0.012 : 0.012;

    return (
        <LocatorInteractionContext.Provider value={{ onShelfClick }}>
            <LocatorQualityContext.Provider value={quality}>
            <RenderScheduler />
            <WebGLContextLossHandler onContextLost={onContextLost} />
            <color args={['#0b1120']} attach="background" />
            <ambientLight intensity={0.44} />
            <hemisphereLight args={['#bfdbfe', '#111827', 0.56]} />
            <directionalLight castShadow={quality.shadows} intensity={1.45} position={[7, 11, 6]} shadow-mapSize={[quality.shadowMapSize, quality.shadowMapSize]} />
            <spotLight angle={0.42} color="#e0f2fe" intensity={quality.tier === 'low' ? 0.7 : 1.35} penumbra={0.55} position={[-7, 9, 7]} />
            <pointLight color="#38bdf8" intensity={0.42} position={[-4, 4, 3]} />
            <pointLight color="#facc15" intensity={locatedProduct ? 0.58 : 0.24} position={[5.6, activeFloor === 2 ? floorHeight + 4 : 4, -5.6]} />
            <pointLight color="#22c55e" intensity={locatedProduct ? 0.42 : 0.16} position={[-6, activeFloor === 2 ? floorHeight + 3 : 3, 5.2]} />
            {showGrid && (
                <Grid
                    cellColor="#334155"
                    cellSize={1}
                    cellThickness={0.42}
                    fadeDistance={24}
                    fadeStrength={1.2}
                    infiniteGrid
                    position={[0, activeGridY, 0]}
                    sectionColor="#475569"
                    sectionSize={4}
                    sectionThickness={0.9}
                />
            )}
            {showGrid && isDesignMode && (
                <Grid
                    cellColor="#38bdf8"
                    cellSize={0.25}
                    cellThickness={0.7}
                    fadeDistance={20}
                    fadeStrength={1.4}
                    infiniteGrid
                    position={[0, activeGridY + 0.014, 0]}
                    sectionColor="#0284c7"
                    sectionSize={2}
                    sectionThickness={1.2}
                />
            )}
            {visibleSceneObjects.map((object) => (
                <LocatorObject key={object.id} object={object} onTransformingChange={setIsTransforming} />
            ))}
            <LocatorPath />
            {quality.labels && <Html position={[-7.7, activeFloor === 1 ? 3.45 : floorHeight + 2.25, -6.7]}>
                <div className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] shadow-lg backdrop-blur ${
                    isDesignMode
                        ? 'border-sky-300 bg-sky-100/95 text-sky-900'
                        : 'border-white/10 bg-slate-950/80 text-slate-300'
                }`}
                >
                    {isDesignMode ? `Design Mode / ${SNAP_STEP} Snap` : 'View Mode'}
                </div>
            </Html>}
            {quality.contactShadows && <ContactShadows blur={2.8} far={16} frames={1} opacity={0.38} position={[0, activeGridY + 0.003, 0]} scale={20} />}
            {quality.environment && <Environment preset="city" />}
            {quality.bloom && (
                <EffectComposer multisampling={2}>
                    <Bloom intensity={locatedProduct ? 0.58 : 0.26} luminanceThreshold={0.48} mipmapBlur />
                </EffectComposer>
            )}
            <CameraRig controlsRef={controlsRef} isTransforming={isTransforming} />
            <OrbitControls
                dampingFactor={0.08}
                enabled={!isTransforming}
                enablePan
                enableDamping
                panSpeed={0.72}
                makeDefault
                maxDistance={80}
                minDistance={1.2}
                ref={controlsRef}
                rotateSpeed={0.62}
                screenSpacePanning
                zoomSpeed={0.82}
                target={CAMERA_TARGETS[activeFloor].lookAt}
            />
            </LocatorQualityContext.Provider>
        </LocatorInteractionContext.Provider>
    );
}

export default function Locator3DScene({ onShelfClick = null }) {
    const clearSelection = useLocator3DStore((state) => state.clearSelection);
    const qualityPreference = useLocator3DStore((state) => state.qualityPreference);
    const [webglFailed, setWebglFailed] = useState(false);
    const quality = useMemo(
        () => getLocatorQualityProfile(qualityPreference, getLocatorQualityCapabilities()),
        [qualityPreference],
    );

    if (webglFailed) {
        return <Locator2DFallback message="WebGL was interrupted, so the locator switched to the accessible 2D/table view." />;
    }

    return (
        <CanvasErrorBoundary onFailure={() => setWebglFailed(true)}>
            <Canvas
                camera={{ fov: 46, position: CAMERA_TARGETS[1].position }}
                dpr={quality.dpr}
                fallback={<Locator2DFallback />}
                frameloop="demand"
                gl={{ antialias: quality.antialias, powerPreference: quality.tier === 'high' ? 'high-performance' : 'default' }}
                onPointerMissed={clearSelection}
                shadows={quality.shadows}
                style={{ touchAction: 'none' }}
            >
                <Suspense fallback={null}>
                    <SceneContents onContextLost={() => setWebglFailed(true)} onShelfClick={onShelfClick} quality={quality} />
                </Suspense>
            </Canvas>
        </CanvasErrorBoundary>
    );
}
