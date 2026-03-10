import { useEffect, useMemo, useRef, useState } from 'react';
import { ContactShadows, Environment, Float, Grid, Html, Line, RoundedBox, Text, useCursor } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { getFloorBaseY, getObjectSize } from '../config/stockroomLayout';

const COLORS = {
    canvas: '#080b12',
    floor: '#131722',
    floorTrim: '#1d2433',
    frame: '#4d5b75',
    shelf: '#d9e3f3',
    shelfHighlight: '#f87171',
    amber: '#f59e0b',
    red: '#ef4444',
    cyan: '#7dd3fc',
};

const tmpVector = new THREE.Vector3();
const dragPlane = new THREE.Plane();

const damp = (delta, factor = 6) => 1 - Math.exp(-delta * factor);
const snap = (value) => Math.round(value * 2) / 2;
const getScenePosition = (object) => [object.x, getFloorBaseY(object.floor), object.z];

const getFocusVector = (currentFloor, focusPoint) => {
    if (focusPoint) {
        return new THREE.Vector3(focusPoint[0], focusPoint[1], focusPoint[2]);
    }

    if (currentFloor === 2) {
        return new THREE.Vector3(7, getFloorBaseY(2) + 1.4, -1.2);
    }

    return new THREE.Vector3(0, getFloorBaseY(1) + 1.4, 0.8);
};

export const SceneCameraRig = ({ currentFloor, viewMode, focusPoint, controlsRef }) => {
    const { camera } = useThree();

    useFrame((_, delta) => {
        const focus = getFocusVector(currentFloor, focusPoint);
        const nextPosition =
            viewMode === '2d'
                ? new THREE.Vector3(focus.x, focus.y + 24, focus.z + 0.01)
                : new THREE.Vector3(focus.x + 13, focus.y + 9.5, focus.z + 14);

        camera.position.lerp(nextPosition, damp(delta, 4.25));

        if (controlsRef.current) {
            controlsRef.current.target.lerp(focus, damp(delta, 5.4));
            controlsRef.current.update();
            camera.lookAt(controlsRef.current.target);
        } else {
            camera.lookAt(focus);
        }
    });

    return null;
};

const SceneBackdrop = ({ currentFloor }) => {
    const haloY = getFloorBaseY(currentFloor) + 0.02;

    return (
        <>
            <fog attach="fog" args={[COLORS.canvas, 28, 60]} />
            <ambientLight intensity={0.65} />
            <hemisphereLight args={['#ffffff', '#111827', 0.65]} />
            <directionalLight position={[10, 18, 8]} intensity={1.35} color="#fff7ed" castShadow />
            <spotLight position={[-10, 18, 10]} angle={0.35} penumbra={0.4} intensity={18} color="#fca5a5" />
            <Environment preset="city" />

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.24, 0]} receiveShadow>
                <planeGeometry args={[90, 90]} />
                <meshStandardMaterial color="#090c14" roughness={0.96} metalness={0.1} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, haloY, 0]}>
                <ringGeometry args={[12, 18, 80]} />
                <meshBasicMaterial color="#3b0b12" transparent opacity={0.26} side={THREE.DoubleSide} />
            </mesh>

            <Grid
                position={[0, haloY + 0.01, 0]}
                args={[60, 60]}
                sectionSize={4}
                cellSize={1}
                cellThickness={0.45}
                sectionThickness={1.1}
                cellColor="#172030"
                sectionColor="#6b111a"
                fadeDistance={52}
                fadeStrength={1.3}
                infiniteGrid
            />
        </>
    );
};

const SelectionHalo = ({ radius, color, y = 0.06 }) => (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
        <ringGeometry args={[radius - 0.18, radius, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} side={THREE.DoubleSide} />
    </mesh>
);

const EditableGroup = ({
    object,
    editMode,
    selected,
    highlighted,
    onSelect,
    onMove,
    onDragStateChange,
    onClick,
    children,
}) => {
    const { gl } = useThree();
    const [hovered, setHovered] = useState(false);
    const [dragging, setDragging] = useState(false);
    const offsetRef = useRef(new THREE.Vector3());
    const baseY = getFloorBaseY(object.floor);
    const size = getObjectSize(object);
    const radius = Math.max(size[0], size[2]) * 0.6 + 0.45;

    useCursor(editMode && !object.locked && hovered, 'grab', 'auto');
    useCursor(dragging, 'grabbing', 'auto');

    useEffect(() => () => onDragStateChange(false), [onDragStateChange]);

    return (
        <group
            position={getScenePosition(object)}
            rotation={[0, object.rotation || 0, 0]}
            onPointerOver={(event) => {
                event.stopPropagation();
                setHovered(true);
            }}
            onPointerOut={() => setHovered(false)}
            onPointerDown={(event) => {
                event.stopPropagation();
                onSelect(object.id);

                if (!editMode || object.locked) {
                    return;
                }

                dragPlane.set(new THREE.Vector3(0, 1, 0), -baseY);
                event.ray.intersectPlane(dragPlane, tmpVector);
                offsetRef.current.set(tmpVector.x - object.x, 0, tmpVector.z - object.z);
                gl.domElement.style.cursor = 'grabbing';
                event.target.setPointerCapture(event.pointerId);
                setDragging(true);
                onDragStateChange(true);
            }}
            onPointerMove={(event) => {
                if (!dragging || !editMode || object.locked) {
                    return;
                }

                event.stopPropagation();
                event.ray.intersectPlane(dragPlane, tmpVector);
                onMove(object.id, {
                    x: snap(tmpVector.x - offsetRef.current.x),
                    z: snap(tmpVector.z - offsetRef.current.z),
                });
            }}
            onPointerUp={(event) => {
                if (dragging) {
                    event.stopPropagation();
                    event.target.releasePointerCapture?.(event.pointerId);
                }

                gl.domElement.style.cursor = '';
                setDragging(false);
                onDragStateChange(false);
                if (!editMode && onClick) {
                    onClick();
                }
            }}
            onClick={(event) => {
                event.stopPropagation();
                onSelect(object.id);
                if (!editMode && onClick) {
                    onClick();
                }
            }}
        >
            {children}

            {(selected || highlighted || hovered) && (
                <SelectionHalo
                    radius={radius}
                    color={highlighted ? COLORS.red : selected ? COLORS.amber : COLORS.cyan}
                />
            )}

            {editMode && (selected || hovered) && (
                <Html position={[0, size[1] + 0.8, 0]} center>
                    <div className="rounded-full border border-white/10 bg-slate-950/85 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-white shadow-xl backdrop-blur">
                        {object.locked ? 'Locked' : object.label || object.type}
                    </div>
                </Html>
            )}
        </group>
    );
};

const FloorPlate = ({ object, currentFloor }) => {
    const [width, height, depth] = getObjectSize(object);
    const isActive = object.floor === currentFloor;

    return (
        <group position={[object.x, getFloorBaseY(object.floor), object.z]}>
            <RoundedBox args={[width, height, depth]} radius={0.18} smoothness={4} receiveShadow castShadow>
                <meshStandardMaterial color={isActive ? COLORS.floor : '#10151f'} metalness={0.2} roughness={0.82} />
            </RoundedBox>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, height / 2 + 0.015, 0]}>
                <ringGeometry args={[Math.min(width, depth) * 0.16, Math.min(width, depth) * 0.3, 48]} />
                <meshBasicMaterial color={isActive ? COLORS.red : COLORS.floorTrim} transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};

const WallSection = ({ object }) => {
    const [width, height, depth] = getObjectSize(object);

    return (
        <group position={getScenePosition(object)} rotation={[0, object.rotation || 0, 0]}>
            <RoundedBox args={[width, height, depth]} radius={0.08} smoothness={4} castShadow receiveShadow>
                <meshStandardMaterial color="#12141b" metalness={0.24} roughness={0.7} />
            </RoundedBox>
            <mesh position={[0, height / 2 - 0.12, 0]}>
                <boxGeometry args={[width, 0.04, depth + 0.02]} />
                <meshBasicMaterial color={COLORS.red} transparent opacity={0.8} />
            </mesh>
        </group>
    );
};

const ShelfUnit = ({ object, highlighted }) => {
    const isCompact = object.type === 'shelf2';
    const levels = isCompact ? [0.55, 1.35] : [0.45, 1.15, 1.85, 2.55];
    const topY = isCompact ? 2.3 : 3.35;

    return (
        <group>
            {[
                [-0.95, 0, -0.42],
                [0.95, 0, -0.42],
                [-0.95, 0, 0.42],
                [0.95, 0, 0.42],
            ].map((position) => (
                <mesh key={position.join('-')} position={[position[0], topY / 2, position[2]]} castShadow>
                    <boxGeometry args={[0.09, topY, 0.09]} />
                    <meshStandardMaterial color={COLORS.frame} metalness={0.7} roughness={0.3} />
                </mesh>
            ))}

            {levels.map((height, index) => (
                <mesh key={index} position={[0, height, 0]} castShadow receiveShadow>
                    <boxGeometry args={[2.05, 0.08, 0.96]} />
                    <meshStandardMaterial
                        color={highlighted ? COLORS.shelfHighlight : COLORS.shelf}
                        metalness={0.15}
                        roughness={0.55}
                        emissive={highlighted ? '#7f1d1d' : '#000000'}
                        emissiveIntensity={highlighted ? 0.75 : 0}
                    />
                </mesh>
            ))}

            <Text
                position={[0, topY + 0.35, 0]}
                fontSize={0.28}
                color={highlighted ? '#fecaca' : '#fde68a'}
                anchorX="center"
                outlineWidth={0.02}
                outlineColor="#111827"
            >
                {object.label || `${object.aisle}${object.shelfNum}`}
            </Text>

            {highlighted && <pointLight position={[0, 2.4, 0]} color={COLORS.red} intensity={6} distance={6} />}
        </group>
    );
};

const CounterUnit = ({ object }) => (
    <group>
        <RoundedBox args={[3.4, 1.1, 1.2]} radius={0.12} smoothness={4} position={[0, 0.55, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#171c28" metalness={0.55} roughness={0.3} />
        </RoundedBox>
        <RoundedBox args={[3.6, 0.12, 1.35]} radius={0.08} smoothness={4} position={[0, 1.16, 0]} castShadow>
            <meshStandardMaterial color="#30384c" metalness={0.28} roughness={0.42} />
        </RoundedBox>
        <mesh position={[0, 0.84, 0.61]}>
            <boxGeometry args={[3.1, 0.04, 0.02]} />
            <meshBasicMaterial color={COLORS.red} />
        </mesh>
        <Text position={[0, 1.64, 0]} fontSize={0.24} color="#fde68a" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const TableUnit = ({ object }) => (
    <group>
        <RoundedBox args={[2.6, 0.18, 1.4]} radius={0.06} smoothness={4} position={[0, 0.92, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#d7dde8" metalness={0.08} roughness={0.68} />
        </RoundedBox>
        {[-1, 1].flatMap((x) => [-1, 1].map((z) => [x, z])).map(([x, z]) => (
            <mesh key={`${x}-${z}`} position={[x * 1.05, 0.45, z * 0.48]} castShadow>
                <cylinderGeometry args={[0.06, 0.06, 0.9, 16]} />
                <meshStandardMaterial color="#4b5563" metalness={0.4} roughness={0.34} />
            </mesh>
        ))}
        <Text position={[0, 1.32, 0]} fontSize={0.2} color="#bfdbfe" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const SignageUnit = ({ object }) => (
    <group>
        <mesh position={[0, 0.55, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 1.1, 20]} />
            <meshStandardMaterial color="#475569" metalness={0.44} roughness={0.35} />
        </mesh>
        <RoundedBox args={[1.25, 0.8, 0.08]} radius={0.04} smoothness={4} position={[0, 1.55, 0]} castShadow>
            <meshStandardMaterial color="#1f2937" metalness={0.2} roughness={0.48} />
        </RoundedBox>
        <Text position={[0, 1.55, 0.08]} fontSize={0.17} maxWidth={1} color="#fef3c7" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const LabelMarker = ({ object }) => (
    <group>
        <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 0.9, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.32} roughness={0.42} />
        </mesh>
        <mesh position={[0, 1.12, 0]} castShadow>
            <sphereGeometry args={[0.13, 16, 16]} />
            <meshStandardMaterial color={COLORS.red} emissive="#7f1d1d" emissiveIntensity={0.8} />
        </mesh>
        <Text position={[0, 1.56, 0]} fontSize={0.16} color="#e2e8f0" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const EntrancePortal = ({ object }) => (
    <group>
        <RoundedBox args={[3.1, 3.2, 0.18]} radius={0.08} smoothness={4} position={[0, 1.6, 0]} castShadow>
            <meshStandardMaterial color="#111827" metalness={0.35} roughness={0.5} />
        </RoundedBox>
        <RoundedBox args={[2.2, 2.2, 0.2]} radius={0.06} smoothness={4} position={[0, 1.2, 0.05]}>
            <meshStandardMaterial color="#020617" metalness={0.08} roughness={0.2} emissive="#052a38" emissiveIntensity={0.3} />
        </RoundedBox>
        <Text position={[0, 3.5, 0]} fontSize={0.2} color="#86efac" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const StairsUnit = ({ object }) => (
    <group>
        {Array.from({ length: 6 }, (_, index) => (
            <mesh key={index} position={[0, 0.18 + index * 0.35, -1 + index * 0.42]} castShadow receiveShadow>
                <boxGeometry args={[2.4, 0.16, 0.42]} />
                <meshStandardMaterial color="#222938" metalness={0.34} roughness={0.48} />
            </mesh>
        ))}
        <RoundedBox args={[2.5, 0.18, 1.8]} radius={0.04} smoothness={4} position={[0, 2.38, 1.3]} castShadow>
            <meshStandardMaterial color="#202837" metalness={0.34} roughness={0.48} />
        </RoundedBox>
        <Text position={[0, 3.2, 0.8]} fontSize={0.18} color="#fde68a" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const RoomUnit = ({ object }) => (
    <group>
        <RoundedBox args={[4.2, 2.8, 3.4]} radius={0.08} smoothness={4} position={[0, 1.4, 0]} castShadow receiveShadow>
            <meshStandardMaterial color="#151823" metalness={0.14} roughness={0.78} />
        </RoundedBox>
        <RoundedBox args={[1.2, 2, 0.12]} radius={0.04} smoothness={4} position={[0.9, 1, 1.72]} castShadow>
            <meshStandardMaterial color="#0f172a" metalness={0.1} roughness={0.42} />
        </RoundedBox>
        <Text position={[0, 3.2, 0]} fontSize={0.2} color="#cbd5e1" anchorX="center">
            {object.label}
        </Text>
    </group>
);

const HighlightBeacon = ({ object }) => {
    const beaconRef = useRef();

    useFrame(({ clock }) => {
        if (!beaconRef.current) {
            return;
        }

        beaconRef.current.position.y = Math.sin(clock.elapsedTime * 2.5) * 0.25 + 3.9;
        beaconRef.current.rotation.y += 0.02;
    });

    return (
        <Float speed={2} rotationIntensity={0.1} floatIntensity={0.25}>
            <group ref={beaconRef} position={[object.x, getFloorBaseY(object.floor), object.z]}>
                <mesh>
                    <octahedronGeometry args={[0.34, 0]} />
                    <meshStandardMaterial color="#fca5a5" emissive="#7f1d1d" emissiveIntensity={1.4} />
                </mesh>
                <pointLight color={COLORS.red} intensity={10} distance={6} />
            </group>
        </Float>
    );
};

const SceneObject = ({ object, currentFloor, editMode, selected, highlighted, onSelect, onMove, onDragStateChange, onStairClick }) => {
    const interactive = object.type !== 'floor' && object.type !== 'wall';

    const body = (() => {
        switch (object.type) {
            case 'shelf':
            case 'shelf2':
                return <ShelfUnit object={object} highlighted={highlighted} />;
            case 'counter':
                return <CounterUnit object={object} />;
            case 'table':
                return <TableUnit object={object} />;
            case 'signage':
                return <SignageUnit object={object} />;
            case 'label':
                return <LabelMarker object={object} />;
            case 'entrance':
                return <EntrancePortal object={object} />;
            case 'stairs':
                return <StairsUnit object={object} />;
            case 'room':
                return <RoomUnit object={object} />;
            case 'wall':
                return <WallSection object={object} />;
            case 'floor':
                return <FloorPlate object={object} currentFloor={currentFloor} />;
            default:
                return null;
        }
    })();

    if (!interactive || !body) {
        return body;
    }

    return (
        <EditableGroup
            object={object}
            editMode={editMode}
            selected={selected}
            highlighted={highlighted}
            onSelect={onSelect}
            onMove={onMove}
            onDragStateChange={onDragStateChange}
            onClick={object.type === 'stairs' ? () => onStairClick?.(object) : undefined}
        >
            {body}
        </EditableGroup>
    );
};

export const StockroomScene = ({
    objects,
    currentFloor,
    editMode,
    selectedId,
    highlightedId,
    pathPoints,
    onSelect,
    onMove,
    onDragStateChange,
    onStairClick,
    onBackgroundSelect,
}) => {
    const visibleObjects = useMemo(
        () =>
            objects.filter((object) => {
                if (object.type === 'floor') {
                    return object.floor === currentFloor;
                }

                if (object.type === 'stairs') {
                    return object.floor === 1 || object.floor === currentFloor;
                }

                return object.floor === currentFloor;
            }),
        [objects, currentFloor],
    );

    const highlightedObject = objects.find((object) => object.id === highlightedId);

    return (
        <group
            onPointerMissed={() => {
                if (editMode) {
                    onBackgroundSelect?.();
                }
            }}
        >
            <SceneBackdrop currentFloor={currentFloor} />

            {objects
                .filter((object) => object.type === 'floor')
                .map((object) => (
                    <FloorPlate key={object.id} object={object} currentFloor={currentFloor} />
                ))}

            {visibleObjects
                .filter((object) => object.type !== 'floor')
                .map((object) => (
                    <SceneObject
                        key={object.id}
                        object={object}
                        currentFloor={currentFloor}
                        editMode={editMode}
                        selected={selectedId === object.id}
                        highlighted={highlightedId === object.id}
                        onSelect={onSelect}
                        onMove={onMove}
                        onDragStateChange={onDragStateChange}
                        onStairClick={onStairClick}
                    />
                ))}

            {highlightedObject && <HighlightBeacon object={highlightedObject} />}

            {pathPoints?.length > 1 && (
                <Line
                    points={pathPoints}
                    color="#f97316"
                    lineWidth={3}
                    transparent
                    opacity={0.95}
                />
            )}

            <ContactShadows position={[0, -0.14, 0]} opacity={0.45} scale={38} blur={2.8} far={18} />
        </group>
    );
};

export default StockroomScene;
