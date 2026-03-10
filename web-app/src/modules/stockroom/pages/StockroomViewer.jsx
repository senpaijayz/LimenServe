import { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line, Html, Grid, Environment, ContactShadows, Float, useCursor } from '@react-three/drei';
import * as THREE from 'three';
import useStockroomStore from '../store/useStockroomStore';
import SearchBar from '../components/SearchBar';
import { useToast } from '../../../components/ui/Toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
    RotateCcw, RotateCw, Plus, Eye, Grid3X3, Trash2,
    Save, Check, Edit2, Lock, Unlock, Move, Search, Box,
    Layers, Crosshair
} from 'lucide-react';
import ErrorBoundary from '../../../components/ui/ErrorBoundary';

// ==================== DEFAULT LAYOUT ====================
// (Preserved from the original)
const getDefaultLayout = () => ({
    objects: [
        { id: 'floor-1-main', type: 'floor', x: 0, z: 0, rotation: 0, floor: 1, label: 'Main Floor', size: [24, 0.2, 24] },
        { id: 'floor-2-right', type: 'floor', x: 3, z: 0, rotation: 0, floor: 2, label: 'Upper Floor', size: [18, 0.2, 24] },
        { id: 'stairs-1', type: 'stairs', x: -6, z: -6, rotation: 0, floor: 1, label: 'Stairs' },
        { id: 'room-cr', type: 'room', x: -3, z: -6, rotation: 0, floor: 1, label: 'CR' },
        { id: 'counter-1', type: 'counter', x: 5, z: 4, rotation: 0, floor: 1, label: 'Cashier' },
        { id: 'entrance-1', type: 'entrance', x: 2, z: 8, rotation: 0, floor: 1, label: 'Entrance' },
        { id: 'wall-1-back', type: 'wall', x: 0, z: -9, rotation: 0, floor: 1, label: 'Back Wall', size: [18, 3, 0.3] },
        { id: 'wall-1-left', type: 'wall', x: -9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Left Wall', size: [16, 3, 0.3] },
        { id: 'wall-1-right', type: 'wall', x: 9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Right Wall', size: [16, 3, 0.3] },
        { id: 'shelf-a1', type: 'shelf', x: -5, z: -4, rotation: 0, floor: 1, aisle: 'A', shelfNum: 1 },
        { id: 'shelf-a2', type: 'shelf', x: -5, z: -1, rotation: 0, floor: 1, aisle: 'A', shelfNum: 2 },
        { id: 'shelf-a3', type: 'shelf', x: -5, z: 2, rotation: 0, floor: 1, aisle: 'A', shelfNum: 3 },
        { id: 'shelf-b1', type: 'shelf', x: -1, z: -4, rotation: 0, floor: 1, aisle: 'B', shelfNum: 1 },
        { id: 'shelf-b2', type: 'shelf', x: -1, z: -1, rotation: 0, floor: 1, aisle: 'B', shelfNum: 2 },
        { id: 'shelf-c1', type: 'shelf', x: 3, z: -4, rotation: 0, floor: 1, aisle: 'C', shelfNum: 1 },
        { id: 'shelf-c2', type: 'shelf', x: 3, z: -1, rotation: 0, floor: 1, aisle: 'C', shelfNum: 2 },
    ]
});

// ==================== OBJECT TYPES ====================
const OBJECT_TYPES = {
    shelf: { label: '4-Layer Shelf', icon: 'SH4' },
    shelf2: { label: '2-Layer Shelf', icon: 'SH2' },
    counter: { label: 'Counter', icon: 'CTR' },
    stairs: { label: 'Stairs', icon: 'STR' },
    room: { label: 'Room', icon: 'ROM' },
    entrance: { label: 'Entrance', icon: 'ENT' },
    wall: { label: 'Wall', icon: 'WAL' },
    floor: { label: 'Floor Plate', icon: 'FLR' },
    table: { label: 'Display Table', icon: 'TBL' },
    signage: { label: 'Signage', icon: 'SIG' },
    label: { label: 'Label Marker', icon: 'LBL' },
};

// ==================== DESIGN TOKENS ====================
const COLORS = {
    bg: '#050505',
    gridMain: '#dc2626', // Crimson
    gridSub: '#1f2937',  // Slate 800
    metal: '#1e293b',    // Slate 800
    shelfFrame: '#334155', // Slate 700
    shelfBoard: '#64748b', // Slate 500
    accent: '#fbbf24',   // Amber 400
    glow: '#ef4444',     // Red 500
    gold: '#fbbf24'
};

const buildRoutePoints = (start, end) => {
    if (Math.abs(start.x - end.x) < 0.15 || Math.abs(start.z - end.z) < 0.15) {
        return [start, end];
    }

    return [start, new THREE.Vector3(start.x, start.y, end.z), end];
};

// ==================== DRAGGABLE WRAPPER ====================
const DraggableObject = ({ children, position, rotation = 0, onPositionChange, editMode, name, selected, onSelect, locked }) => {
    const groupRef = useRef();
    const [isDragging, setIsDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const { camera, gl } = useThree();
    const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const intersectionPoint = useRef(new THREE.Vector3());
    const offset = useRef(new THREE.Vector3());

    useCursor(hovered && editMode && !locked, 'grab', 'auto');
    useCursor(isDragging, 'grabbing');

    const handlePointerDown = useCallback((e) => {
        if (!editMode) return;
        e.stopPropagation();
        onSelect?.();
        if (locked) return;
        setIsDragging(true);
        window.dispatchEvent(new CustomEvent('toggle-orbit', { detail: false }));

        const rect = gl.domElement.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
            new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
            camera
        );
        raycaster.ray.intersectPlane(planeRef.current, intersectionPoint.current);
        offset.current.copy(intersectionPoint.current).sub(new THREE.Vector3(position[0], 0, position[2]));
    }, [editMode, camera, gl, position, onSelect, locked]);

    const handlePointerMove = useCallback((e) => {
        if (!isDragging || !editMode) return;
        const rect = gl.domElement.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
            new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1),
            camera
        );
        raycaster.ray.intersectPlane(planeRef.current, intersectionPoint.current);
        const newX = Math.round((intersectionPoint.current.x - offset.current.x) * 2) / 2;
        const newZ = Math.round((intersectionPoint.current.z - offset.current.z) * 2) / 2;
        onPositionChange([newX, position[1], newZ]);
    }, [isDragging, editMode, camera, gl, position, onPositionChange]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
        window.dispatchEvent(new CustomEvent('toggle-orbit', { detail: true }));
    }, []);

    useEffect(() => {
        if (editMode) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            return () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
                window.dispatchEvent(new CustomEvent('toggle-orbit', { detail: true })); // failsafe
            };
        }
    }, [editMode, handlePointerMove, handlePointerUp]);

    return (
        <group ref={groupRef} position={position} rotation={[0, rotation, 0]}
            onPointerDown={handlePointerDown}
            onPointerOver={(e) => { e.stopPropagation(); editMode && setHovered(true); }}
            onPointerOut={() => setHovered(false)}>
            {children}
            {editMode && (hovered || selected) && (
                <Html position={[0, 4, 0]} center>
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        className={`px-3 py-1.5 rounded-lg border border-white/10 backdrop-blur-md text-xs font-medium whitespace-nowrap shadow-2xl flex items-center gap-2 ${selected ? 'bg-red-600/90 text-white' : 'bg-black/80 text-primary-200'}`}
                    >
                        {locked && <Lock className="w-3 h-3 text-red-300" />} {name}
                    </motion.div>
                </Html>
            )}

            {/* Selection/Hover Halo */}
            {editMode && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.5, 0.8, 32]} />
                    <meshBasicMaterial
                        color={selected ? COLORS.glow : isDragging ? COLORS.accent : hovered ? '#fff' : '#444'}
                        transparent
                        opacity={selected ? 0.8 : hovered ? 0.4 : 0.2}
                        side={THREE.DoubleSide}
                    />
                </mesh>
            )}
        </group>
    );
};

// ==================== 3D COMPONENTS ====================
const Shelf4Layer = ({ position, rotation = 0, label, isHighlighted, editMode, onPositionChange, selected, onSelect, locked }) => {
    const shelfColor = isHighlighted ? COLORS.glow : COLORS.shelfBoard;
    const content = (
        <group>
            {/* Vertical Posts */}
            {[[-0.9, 0, -0.4], [0.9, 0, -0.4], [-0.9, 0, 0.4], [0.9, 0, 0.4]].map((pos, i) => (
                <mesh key={i} position={[pos[0], 1.6, pos[2]]}>
                    <boxGeometry args={[0.08, 3.2, 0.08]} />
                    <meshPhysicalMaterial color={COLORS.shelfFrame} metalness={0.8} roughness={0.2} clearcoat={1} clearcoatRoughness={0.1} />
                </mesh>
            ))}
            {/* Shelf Layers */}
            {[0.4, 1.1, 1.8, 2.5].map((h, i) => (
                <mesh key={`s-${i}`} position={[0, h, 0]}>
                    <boxGeometry args={[1.8, 0.05, 0.85]} />
                    <meshPhysicalMaterial
                        color={shelfColor}
                        metalness={0.5}
                        roughness={0.5}
                        emissive={isHighlighted ? COLORS.glow : '#000'}
                        emissiveIntensity={isHighlighted ? 0.8 : 0}
                    />
                </mesh>
            ))}
            <Text position={[0, 3.4, 0]} fontSize={0.25} color={isHighlighted ? COLORS.glow : COLORS.gold} anchorX="center">
                {label || 'SHELF'}
            </Text>
            {isHighlighted && <pointLight position={[0, 2, 0]} color={COLORS.glow} intensity={3} distance={5} />}
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Counter = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[3, 1, 1]} />
                <meshPhysicalMaterial color="#111" metalness={0.9} roughness={0.1} clearcoat={1} />
            </mesh>
            <mesh position={[0, 1.05, 0]}>
                <boxGeometry args={[3.2, 0.1, 1.2]} />
                <meshPhysicalMaterial color="#222" metalness={0.5} roughness={0.5} />
            </mesh>
            {/* Glowing Accent strip */}
            <mesh position={[0, 0.8, 0.51]}>
                <boxGeometry args={[3, 0.05, 0.02]} />
                <meshBasicMaterial color={COLORS.glow} />
            </mesh>
            <Text position={[0, 1.5, 0]} fontSize={0.2} color={COLORS.gold} anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Stairs = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked, onClick }) => {
    const stepColor = '#333';
    const content = (
        <group>
            {Array.from({ length: 5 }, (_, i) => (
                <mesh key={i} position={[0, i * 0.3 + 0.15, i * 0.4]}>
                    <boxGeometry args={[2, 0.15, 0.4]} />
                    <meshPhysicalMaterial color={stepColor} metalness={0.5} roughness={0.4} />
                    {/* Glowing edge */}
                    <mesh position={[0, 0.08, 0.2]}>
                        <boxGeometry args={[2, 0.02, 0.02]} />
                        <meshBasicMaterial color={COLORS.glow} opacity={0.5} transparent />
                    </mesh>
                </mesh>
            ))}
            <mesh position={[0, 1.65, 2.2]}>
                <boxGeometry args={[2.5, 0.15, 2]} />
                <meshPhysicalMaterial color={stepColor} metalness={0.5} roughness={0.4} />
            </mesh>
            {Array.from({ length: 5 }, (_, i) => (
                <mesh key={`u-${i}`} position={[-i * 0.4 - 0.3, 1.95 + i * 0.3, 2.7]}>
                    <boxGeometry args={[0.4, 0.15, 1.5]} />
                    <meshPhysicalMaterial color={stepColor} metalness={0.5} roughness={0.4} />
                </mesh>
            ))}
            {label && <Text position={[0, 4, 1.5]} fontSize={0.25} color={COLORS.gold} anchorX="center">{label}</Text>}
        </group>
    );

    // Auto-cursor for stairs
    const [hovered, setHovered] = useState(false);
    useCursor(hovered && !editMode, 'pointer', 'auto');

    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]} onClick={onClick} onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }} onPointerOut={() => setHovered(false)}>{content}</group>;
};

const Room = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 1.5, 0]}>
                <boxGeometry args={[2.5, 3, 2.5]} />
                <meshPhysicalMaterial color="#111" transparent opacity={0.6} transmission={0.5} metalness={0.9} roughness={0.1} />
            </mesh>
            <mesh position={[0, 1, 1.26]}>
                <boxGeometry args={[0.8, 2, 0.05]} />
                <meshPhysicalMaterial color="#050505" metalness={0.8} />
            </mesh>
            <Text position={[0, 3.4, 0]} fontSize={0.2} color={COLORS.gold} anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Entrance = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const leftDoorRef = useRef();
    const rightDoorRef = useRef();

    // Auto-proximity door open
    const { camera } = useThree();
    useFrame(() => {
        if (!leftDoorRef.current || !rightDoorRef.current) return;
        try {
            const dist = camera.position.distanceTo(new THREE.Vector3(position[0], position[1], position[2]));
            const open = dist < 8; // Open if camera is close
            leftDoorRef.current.rotation.y = THREE.MathUtils.lerp(leftDoorRef.current.rotation.y, open ? -Math.PI / 2.5 : 0, 0.08);
            rightDoorRef.current.rotation.y = THREE.MathUtils.lerp(rightDoorRef.current.rotation.y, open ? Math.PI / 2.5 : 0, 0.08);
        } catch (e) {
            // Silently fail if object is being unmounted
        }
    });

    const content = (
        <group>
            <mesh position={[0, 1.5, 0]}><boxGeometry args={[3.5, 3, 0.2]} /><meshPhysicalMaterial color="#111" metalness={0.8} roughness={0.2} /></mesh>
            <mesh position={[0, 1.3, 0]}><boxGeometry args={[2.5, 2.6, 0.21]} /><meshBasicMaterial color="#000" /></mesh>
            <group ref={leftDoorRef} position={[-1.25, 1.3, 0.1]}>
                <mesh position={[0.625, 0, 0]}>
                    <boxGeometry args={[1.25, 2.5, 0.05]} />
                    <meshPhysicalMaterial color="#222" metalness={0.8} transmission={0.9} transparent opacity={0.5} />
                </mesh>
            </group>
            <group ref={rightDoorRef} position={[1.25, 1.3, 0.1]}>
                <mesh position={[-0.625, 0, 0]}>
                    <boxGeometry args={[1.25, 2.5, 0.05]} />
                    <meshPhysicalMaterial color="#222" metalness={0.8} transmission={0.9} transparent opacity={0.5} />
                </mesh>
            </group>
            <Text position={[0, 3.4, 0]} fontSize={0.25} color="#22c55e" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Wall = ({ position, rotation = 0, size = [10, 3, 0.3], label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, size[1] / 2, 0]}>
                <boxGeometry args={size} />
                <meshPhysicalMaterial color="#111" metalness={0.7} roughness={0.3} clearcoat={1} />
            </mesh>
            {/* Baseboard glow */}
            <mesh position={[0, 0.05, size[2] / 2 + 0.01]}>
                <boxGeometry args={[size[0], 0.1, 0.02]} />
                <meshBasicMaterial color={COLORS.glow} opacity={0.3} transparent />
            </mesh>
            <mesh position={[0, 0.05, -size[2] / 2 - 0.01]}>
                <boxGeometry args={[size[0], 0.1, 0.02]} />
                <meshBasicMaterial color={COLORS.glow} opacity={0.3} transparent />
            </mesh>
            {editMode && <Text position={[0, size[1] + 0.4, 0]} fontSize={0.25} color={COLORS.gold} anchorX="center">{label}</Text>}
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Floor = ({ position = [0, -0.01, 0], rotation = 0, size = [10, 0.2, 10], floor = 1, editMode, onPositionChange, selected, onSelect, locked, label }) => {
    const content = (
        <group>
            <mesh position={[0, -size[1] / 2 - 0.01, 0]} receiveShadow>
                <boxGeometry args={size} />
                <meshPhysicalMaterial color="#080808" metalness={0.8} roughness={0.2} />
            </mesh>
            <Grid
                position={[0, 0.01, 0]}
                args={size.slice(0, 3).map(v => v || 10)}
                cellColor={COLORS.gridSub}
                sectionColor={COLORS.gridMain}
                sectionSize={2}
                fadeDistance={30}
                fadeStrength={1}
            />
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label || `Floor ${floor}`} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const DisplayTable = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.7, 0]} castShadow>
                <boxGeometry args={[2.2, 0.12, 1.2]} />
                <meshPhysicalMaterial color="#dbe4ee" metalness={0.25} roughness={0.35} />
            </mesh>
            {[-0.85, 0.85].map((x) => (
                <mesh key={`leg-front-${x}`} position={[x, 0.34, 0.4]} castShadow>
                    <boxGeometry args={[0.08, 0.68, 0.08]} />
                    <meshPhysicalMaterial color={COLORS.shelfFrame} metalness={0.7} roughness={0.28} />
                </mesh>
            ))}
            {[-0.85, 0.85].map((x) => (
                <mesh key={`leg-back-${x}`} position={[x, 0.34, -0.4]} castShadow>
                    <boxGeometry args={[0.08, 0.68, 0.08]} />
                    <meshPhysicalMaterial color={COLORS.shelfFrame} metalness={0.7} roughness={0.28} />
                </mesh>
            ))}
            <Text position={[0, 1.15, 0]} fontSize={0.18} color={COLORS.gold} anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const Signage = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 1.2, 0]} castShadow>
                <boxGeometry args={[1.5, 0.65, 0.08]} />
                <meshPhysicalMaterial color={COLORS.glow} metalness={0.35} roughness={0.4} />
            </mesh>
            <mesh position={[0, 0.55, 0]} castShadow>
                <cylinderGeometry args={[0.06, 0.06, 1.1, 16]} />
                <meshPhysicalMaterial color={COLORS.shelfFrame} metalness={0.7} roughness={0.28} />
            </mesh>
            <Text position={[0, 1.2, 0.06]} fontSize={0.12} color="#ffffff" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

const LabelMarker = ({ position, rotation = 0, label, editMode, onPositionChange, selected, onSelect, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <planeGeometry args={[2.1, 0.8]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.95} />
            </mesh>
            <Text position={[0, 0.07, 0]} fontSize={0.14} color="#111111" anchorX="center" rotation={[-Math.PI / 2, 0, 0]}>{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} locked={locked}>{content}</DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};
const HighlightMarker = ({ highlightedPart }) => {
    const meshRef = useRef();
    const beamRef = useRef();

    useFrame((state) => {
        if (meshRef.current) {
            const pulse = Math.sin(state.clock.elapsedTime * 4) * 0.2 + 0.8;
            meshRef.current.scale.setScalar(pulse);
        }
        if (beamRef.current) {
            beamRef.current.material.opacity = (Math.sin(state.clock.elapsedTime * 3) + 1) * 0.1 + 0.3;
        }
    });

    if (!highlightedPart?.position) return null;

    return (
        <group position={[highlightedPart.position.x, highlightedPart.position.y, highlightedPart.position.z]}>
            <Float speed={2} rotationIntensity={0} floatIntensity={1}>
                {/* Core Marker */}
                <mesh ref={meshRef}>
                    <octahedronGeometry args={[0.3, 0]} />
                    <meshPhysicalMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} roughness={0} metalness={1} wireframe />
                </mesh>
                <mesh>
                    <octahedronGeometry args={[0.2, 0]} />
                    <meshBasicMaterial color="#fff" />
                </mesh>
            </Float>

            {/* Scanning Beam */}
            <mesh ref={beamRef} position={[0, -1, 0]}>
                <cylinderGeometry args={[0.1, 0.4, 2, 16]} />
                <meshBasicMaterial color="#ef4444" transparent opacity={0.4} blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} />
            </mesh>

            <pointLight distance={6} intensity={5} color="#ef4444" />

            <Html position={[0, 1.5, 0]} center zIndexRange={[100, 0]}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="backdrop-blur-xl bg-black/80 border border-red-500/30 rounded-lg p-3 min-w-[200px] shadow-[0_0_30px_rgba(239,68,68,0.3)]"
                >
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-display font-bold text-red-400 tracking-wider text-xs uppercase">Target Acquired</span>
                    </div>
                    <div className="text-white font-medium text-sm leading-tight mb-2">{highlightedPart.description}</div>
                    <div className="flex justify-between items-end border-t border-white/10 pt-2 mt-2">
                        <div>
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Location</div>
                            <div className="text-amber-400 font-mono text-sm">{highlightedPart.location_code}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-gray-500 uppercase tracking-widest">Stock</div>
                            <div className="text-white font-mono text-sm">{highlightedPart.stock}</div>
                        </div>
                    </div>
                </motion.div>
            </Html>
        </group>
    );
};

const PathRenderer = ({ points }) => {
    if (!points || points.length < 2) return null;
    return (
        <group>
            {/* Base ground line */}
            <Line points={points} color="#ef4444" lineWidth={3} opacity={0.8} transparent />
            {/* Floating dashed guide above it */}
            <Line points={points.map(p => new THREE.Vector3(p.x, p.y + 0.1, p.z))} color="#fbbf24" lineWidth={2} dashed dashScale={10} dashSize={1} gapSize={0.5} opacity={0.6} transparent />
        </group>
    );
};

const SceneCameraController = ({ viewMode, controlsRef, focusPoint }) => {
    const { camera } = useThree();

    useEffect(() => {
        const target = focusPoint || [0, 0, 0];
        const nextPosition = viewMode === '2d'
            ? [target[0], 26, target[2] + 0.1]
            : [target[0] + 10, 11, target[2] + 13];

        camera.position.set(...nextPosition);
        camera.lookAt(target[0], 1.2, target[2]);
        camera.updateProjectionMatrix();

        if (controlsRef.current) {
            controlsRef.current.target.set(target[0], 1.2, target[2]);
            controlsRef.current.update();
        }
    }, [camera, controlsRef, focusPoint, viewMode]);

    return null;
};

const WarehouseBackdrop = () => (
    <group>
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[11.5, 12.2, 48]} />
            <meshBasicMaterial color={COLORS.glow} transparent opacity={0.08} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[17, 48]} />
            <meshBasicMaterial color="#0b1220" transparent opacity={0.18} side={THREE.DoubleSide} />
        </mesh>
    </group>
);

// ==================== COMPONENT MAP ====================
const COMPONENTS = { shelf: Shelf4Layer, shelf2: Shelf4Layer, counter: Counter, stairs: Stairs, room: Room, entrance: Entrance, wall: Wall, floor: Floor, table: DisplayTable, signage: Signage, label: LabelMarker };

// ==================== SCENE ====================
const StockroomScene = ({ objects, currentFloor, editMode, selectedId, highlightedId, onSelect, onPositionChange, onStairClick }) => (
    <>
        <WarehouseBackdrop />
        <Environment preset="city" />
        <ambientLight intensity={0.4} />
        <directionalLight position={[15, 30, 15]} intensity={1.5} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
        <pointLight position={[0, 20, 0]} intensity={2} distance={40} color="#ffffff" />
        <ContactShadows position={[0, -0.05, 0]} opacity={0.6} scale={40} blur={2.5} far={10} color="#000" />

        {objects.filter(obj => obj.floor === currentFloor).map(obj => {
            const ObjComponent = COMPONENTS[obj.type];
            if (!ObjComponent) return null;
            return (
                <ObjComponent
                    key={obj.id}
                    position={[obj.x, 0, obj.z]}
                    rotation={obj.rotation || 0}
                    label={obj.aisle && obj.shelfNum ? `${obj.aisle}-${obj.shelfNum}` : obj.label}
                    size={obj.size}
                    floor={obj.floor}
                    editMode={editMode}
                    isHighlighted={highlightedId === obj.id}
                    selected={selectedId === obj.id}
                    onSelect={() => onSelect(obj.id)}
                    onPositionChange={(pos) => onPositionChange(obj.id, pos)}
                    locked={obj.locked}
                    onClick={obj.type === 'stairs' && !editMode ? onStairClick : undefined}
                />
            );
        })}
    </>
);
// ==================== MAIN COMPONENT ====================
const StockroomViewer = () => {
    const { selectedItem } = useStockroomStore();
    const { success, warning } = useToast();
    const controlsRef = useRef();

    const [layout, setLayout] = useState(() => { const saved = localStorage.getItem('stockroomLayoutV2'); if (saved) try { return JSON.parse(saved); } catch { } return getDefaultLayout(); });
    const [currentFloor, setCurrentFloor] = useState(1);
    const [viewMode, setViewMode] = useState('3d');
    const [editMode, setEditMode] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [highlightedPart, setHighlightedPart] = useState(null);
    const [highlightedId, setHighlightedId] = useState(null);
    const [pathPoints, setPathPoints] = useState([]);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [labelInput, setLabelInput] = useState('');
    const [transitionTargetFloor, setTransitionTargetFloor] = useState(1);
    const [isOrbitEnabled, setIsOrbitEnabled] = useState(true);

    useEffect(() => {
        const toggleOrbit = (e) => setIsOrbitEnabled(e.detail);
        window.addEventListener('toggle-orbit', toggleOrbit);
        return () => window.removeEventListener('toggle-orbit', toggleOrbit);
    }, []);


    const selectedObj = layout.objects.find(o => o.id === selectedId);
    const focusPoint = highlightedPart?.position ? [highlightedPart.position.x, 0, highlightedPart.position.z] : [0, 0, 0];
    useEffect(() => { if (selectedObj) setLabelInput(selectedObj.label || ''); }, [selectedObj]);

    const handleFloorChange = (floor) => { if (floor === currentFloor || isTransitioning) return; setTransitionTargetFloor(floor); setIsTransitioning(true); setTimeout(() => { setCurrentFloor(floor); setTimeout(() => { setIsTransitioning(false); setTransitionTargetFloor(floor); }, 400); }, 200); };
    const handleStairClick = () => { if (editMode) return; const nextFloor = currentFloor === 1 ? 2 : 1; setTransitionTargetFloor(nextFloor); setIsTransitioning(true); setTimeout(() => { setCurrentFloor(nextFloor); setIsTransitioning(false); }, 400); };

    const handlePositionChange = useCallback((id, pos) => { setLayout(prev => ({ ...prev, objects: prev.objects.map(obj => obj.id === id ? { ...obj, x: pos[0], z: pos[2] } : obj) })); }, []);
    const rotateSelected = (delta) => { if (!selectedId) return; setLayout(prev => ({ ...prev, objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, rotation: (obj.rotation || 0) + delta } : obj) })); };
    const deleteSelected = () => { if (!selectedId) return; setLayout(prev => ({ ...prev, objects: prev.objects.filter(obj => obj.id !== selectedId) })); setSelectedId(null); };
    const toggleLock = () => { if (!selectedId) return; setLayout(prev => ({ ...prev, objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, locked: !obj.locked } : obj) })); };
    const updateLabel = () => { if (!selectedId || !labelInput.trim()) return; setLayout(prev => ({ ...prev, objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, label: labelInput.trim() } : obj) })); };
    const addObject = (type) => {
        const newId = `${type}-${Date.now()}`;
        const newObj = { id: newId, type, x: 0, z: 0, rotation: 0, floor: currentFloor, label: `New ${OBJECT_TYPES[type].label}`, size: type === 'wall' ? [10, 3, 0.3] : type === 'floor' ? [10, 0.2, 10] : undefined };
        setLayout(prev => ({ ...prev, objects: [...prev.objects, newObj] }));
        setSelectedId(newId);
        setAddMenuOpen(false);
    };
    const saveLayout = () => { localStorage.setItem('stockroomLayoutV2', JSON.stringify(layout)); success('Schematic Architecture Saved!'); };
    const resetLayout = () => { setLayout(getDefaultLayout()); localStorage.setItem('stockroomLayoutV2', JSON.stringify(getDefaultLayout())); setSelectedId(null); setHighlightedId(null); success('Schematic Architecture Reset'); };

    const handlePartSearch = (part) => {
        if (!layout?.objects) return;
        if (!part) {
            setHighlightedPart(null);
            setHighlightedId(null);
            setPathPoints([]);
            return;
        }

        const fallbackMatch = typeof part.location_code === 'string'
            ? part.location_code.match(/F(\d+)-([A-Z]+)-?(\d+)/i)
            : null;
        const aisle = (part.location?.aisle || part.location?.section || fallbackMatch?.[2] || '').toUpperCase();
        const shelf = Number(part.location?.shelf || fallbackMatch?.[3] || 0);
        const targetShelf = layout.objects.find(obj => (obj.type === 'shelf' || obj.type === 'shelf2') && obj.aisle === aisle && obj.shelfNum === shelf);

        if (!aisle || !shelf || !targetShelf) {
            setHighlightedPart(null);
            setHighlightedId(null);
            setPathPoints([]);
            warning('This item does not have a mapped stockroom shelf yet.');
            return;
        }

        const targetFloor = targetShelf.floor || Number(part.location?.floor || fallbackMatch?.[1] || currentFloor || 1);
        const x = targetShelf.x;
        const z = targetShelf.z;

        setHighlightedId(targetShelf.id);
        setHighlightedPart({ ...part, position: { x, y: 1.5, z }, floor: targetFloor });

        if (targetFloor !== currentFloor) {
            handleFloorChange(targetFloor);
        }

        const counterObj = layout.objects.find(o => o.type === 'counter' && o.floor === targetFloor);
        const start = counterObj ? new THREE.Vector3(counterObj.x, 0.2, counterObj.z) : new THREE.Vector3(0, 0.2, 0);
        const end = new THREE.Vector3(x, 0.2, z);
        setPathPoints(buildRoutePoints(start, end));
    };

    useEffect(() => {
        if (selectedItem) handlePartSearch(selectedItem);
        else {
            setHighlightedPart(null);
            setHighlightedId(null);
            setPathPoints([]);
        }
    }, [selectedItem, layout]);

    return (
        <div className="space-y-6">
            {/* Header Section */}
            <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-3xl border border-primary-200 bg-white p-6 shadow-sm flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between mb-4"
            >
                <div>
                    <h1 className="text-3xl font-display font-bold text-primary-950 tracking-widest uppercase flex items-center gap-3">
                        <span className="w-8 h-8 rounded bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-sm">
                            <Box className="w-4 h-4 text-white" />
                        </span>
                        <span>3D Stockroom</span>
                        <span className="text-red-600 font-light">Floor {currentFloor}</span>
                        {editMode && <span className="text-amber-500 ml-2 animate-pulse text-sm flex items-center gap-1 border border-amber-500/30 px-2 py-1 rounded bg-amber-500/10"><Edit2 className="w-3 h-3" /> SCHEMA OVERRIDE</span>}
                    </h1>
                    <p className="text-primary-500 mt-2 font-mono text-sm max-w-2xl leading-relaxed">
                        {editMode
                            ? 'Edit mode is active. Move, relabel, and organize stockroom objects.'
                            : 'Search inventory and locate mapped parts in the stockroom scene.'}
                    </p>

                    {!editMode && (
                        <div className="mt-4 max-w-md">
                            <SearchBar onPartSelect={handlePartSearch} />
                        </div>
                    )}
                </div>

                <div className="flex gap-3 flex-wrap bg-white p-2 rounded-xl border border-primary-200 shadow-sm">
                    <div className="flex bg-primary-50 rounded-lg p-1 border border-primary-100">
                        <button onClick={() => handleFloorChange(1)} disabled={isTransitioning} className={`px-4 py-2 flex items-center gap-2 rounded-md font-bold text-sm transition-all ${currentFloor === 1 ? 'bg-red-600 text-white shadow-md' : 'text-primary-600 hover:text-primary-950 hover:bg-white'}`}>
                            <Layers className="w-4 h-4" /> FLR 1
                        </button>
                        <button onClick={() => handleFloorChange(2)} disabled={isTransitioning} className={`px-4 py-2 flex items-center gap-2 rounded-md font-bold text-sm transition-all ${currentFloor === 2 ? 'bg-red-600 text-white shadow-md' : 'text-primary-600 hover:text-primary-950 hover:bg-white'}`}>
                            <Layers className="w-4 h-4" /> FLR 2
                        </button>
                    </div>

                    <button className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all border ${viewMode === '2d' ? 'bg-primary-100 border-primary-200 text-primary-950' : 'bg-transparent border-transparent text-primary-600 hover:bg-primary-50 hover:text-primary-950'}`} onClick={() => setViewMode(v => v === '3d' ? '2d' : '3d')}>
                        {viewMode === '2d' ? <Eye className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
                        {viewMode === '2d' ? 'PLAN VIEW' : '3D VIEW'}
                    </button>

                    <button className={`px-5 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-all ${editMode ? 'bg-amber-500 text-white shadow-md' : 'bg-white border border-primary-200 text-primary-700 hover:bg-primary-50'}`} onClick={() => setEditMode(!editMode)}>
                        <Move className="w-4 h-4" />
                        {editMode ? 'LOCK SCHEMA' : 'EDIT SCHEMA'}
                    </button>
                </div>
            </motion.div>

            {/* Design Toolbar */}
            <AnimatePresence>
                {editMode && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white border border-primary-200 rounded-xl p-3 flex flex-wrap items-center gap-4 shadow-sm mb-4">
                            <div className="relative">
                                <button className="btn bg-primary-100 hover:bg-primary-200 text-primary-950 font-bold border border-primary-300" onClick={() => setAddMenuOpen(!addMenuOpen)}>
                                    <Plus className="w-4 h-4" /> INJECT OBJECT
                                </button>
                                {addMenuOpen && (
                                    <div className="absolute top-full left-0 mt-2 bg-white border border-primary-200 rounded-xl p-2 min-w-[200px] max-h-[300px] overflow-y-auto z-50 shadow-xl">
                                        {Object.entries(OBJECT_TYPES).map(([key, val]) => (
                                            <button key={key} onClick={() => addObject(key)} className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg hover:bg-primary-50 text-primary-950 text-sm font-bold transition-colors">
                                                <span className="text-[10px] font-mono font-bold tracking-[0.18em] rounded-full bg-primary-100 text-primary-600 px-2 py-1">{val.icon}</span>{val.label}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="w-px h-8 bg-primary-200" />

                            {selectedObj ? (
                                <>
                                    <div className="flex items-center gap-2 bg-primary-50 px-3 py-1.5 rounded-lg border border-primary-100">
                                        <Crosshair className="w-4 h-4 text-accent-blue" />
                                        <span className="text-sm font-mono text-primary-600">TARGET: <strong className="text-primary-950 font-bold">{selectedObj.label || selectedObj.id}</strong></span>
                                    </div>

                                    <div className="flex gap-1">
                                        <button className="p-2 rounded hover:bg-primary-100 text-primary-600 transition-colors" onClick={() => rotateSelected(-Math.PI / 4)}><RotateCcw className="w-4 h-4" /></button>
                                        <button className="p-2 rounded hover:bg-primary-100 text-primary-600 transition-colors" onClick={() => rotateSelected(Math.PI / 4)}><RotateCw className="w-4 h-4" /></button>
                                        <button className={`p-2 rounded transition-colors ${selectedObj.locked ? 'bg-amber-100 text-amber-600' : 'hover:bg-primary-100 text-primary-600'}`} onClick={toggleLock} title={selectedObj.locked ? 'Unlock' : 'Lock'}>
                                            {selectedObj.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    <div className="flex bg-primary-50 rounded-lg border border-primary-200 p-1">
                                        <input type="text" value={labelInput} onChange={e => setLabelInput(e.target.value)} placeholder="LABEL_ID" className="bg-transparent text-primary-950 font-bold px-2 py-1 w-32 text-sm font-mono focus:outline-none placeholder-primary-400" />
                                        <button className="px-3 hover:bg-primary-100 rounded text-accent-blue transition-colors" onClick={updateLabel}><Check className="w-4 h-4" /></button>
                                    </div>

                                    {(selectedObj.type === 'shelf' || selectedObj.type === 'shelf2') && (
                                        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-1 px-3">
                                            <span className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Loc:</span>
                                            <input type="text" value={selectedObj.aisle || ''} onChange={e => setLayout(prev => ({ ...prev, objects: prev.objects.map(o => o.id === selectedObj.id ? { ...o, aisle: e.target.value.toUpperCase() } : o) }))} placeholder="A" maxLength={1} className="bg-transparent text-primary-950 font-bold w-6 text-center text-sm font-mono border-b border-red-300 focus:outline-none focus:border-red-600" />
                                            <span className="text-primary-400 font-bold">-</span>
                                            <input type="number" value={selectedObj.shelfNum || ''} onChange={e => setLayout(prev => ({ ...prev, objects: prev.objects.map(o => o.id === selectedObj.id ? { ...o, shelfNum: parseInt(e.target.value) || '' } : o) }))} placeholder="1" min={1} className="bg-transparent text-primary-950 font-bold w-8 text-center text-sm font-mono border-b border-red-300 focus:outline-none focus:border-red-600" />
                                        </div>
                                    )}
                                    <button className="p-2 rounded bg-red-50 hover:bg-red-100 text-red-600 transition-colors ml-auto border border-red-200" onClick={deleteSelected}><Trash2 className="w-4 h-4" /></button>
                                </>
                            ) : (
                                <span className="text-sm font-mono text-primary-500 font-bold tracking-wider">AWAITING OBJECT SELECTION...</span>
                            )}

                            <div className="w-px h-8 bg-primary-200 ml-auto" />
                            <div className="flex gap-2">
                                <button className="btn bg-white hover:bg-primary-50 text-primary-700 font-bold border border-primary-200" onClick={resetLayout}><RotateCcw className="w-4 h-4" /> REVERT</button>
                                <button className="btn bg-red-600 hover:bg-red-700 text-white border-none shadow-md font-bold" onClick={saveLayout}><Save className="w-4 h-4" /> COMMIT SCHEMA</button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 3D Canvas Container */}
            <div className="relative h-[54vh] min-h-[360px] overflow-hidden rounded-[28px] border border-primary-200 bg-[#050505] shadow-2xl sm:h-[60vh] sm:min-h-[460px] lg:h-[68vh] lg:min-h-[640px]">

                {/* Transition Overlay */}
                <AnimatePresence>
                    {isTransitioning && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center text-red-600"
                        >
                            <Box className="w-16 h-16 mb-6 animate-pulse" />
                            <div className="text-2xl font-display uppercase tracking-[0.2em] font-light text-primary-950">
                                Switching to <strong className="font-bold text-primary-950">Floor {transitionTargetFloor}</strong>
                            </div>
                            <div className="mt-4 w-48 h-1 bg-primary-200 rounded-full overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: '100%' }}
                                    transition={{ duration: 0.4 }}
                                    className="h-full bg-red-600"
                                />
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                                <ErrorBoundary>
                    <Canvas
                        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
                        camera={{ position: [10, 11, 13], fov: 50 }}
                        style={{ background: COLORS.bg }}
                        onCreated={({ gl }) => {
                            gl.setClearColor(new THREE.Color(COLORS.bg));
                        }}
                    >
                        <SceneCameraController viewMode={viewMode} controlsRef={controlsRef} focusPoint={focusPoint} />
                        <StockroomScene
                            objects={layout.objects}
                            currentFloor={currentFloor}
                            editMode={editMode}
                            selectedId={selectedId}
                            highlightedId={highlightedId}
                            onSelect={setSelectedId}
                            onPositionChange={handlePositionChange}
                            onStairClick={handleStairClick}
                        />
                        <OrbitControls
                            ref={controlsRef}
                            enabled={isOrbitEnabled}
                            enableRotate={!editMode && viewMode === '3d'}
                            enablePan={!editMode}
                            enableZoom
                            minDistance={4}
                            maxDistance={80}
                            maxPolarAngle={viewMode === '2d' ? 0.01 : Math.PI / 2.1}
                            dampingFactor={0.08}
                        />
                        <PathRenderer points={pathPoints} />
                        <HighlightMarker highlightedPart={highlightedPart} />
                    </Canvas>
                </ErrorBoundary>

                {/* Corner Data Readouts */}
                <div className="absolute bottom-3 left-3 z-10 pointer-events-none sm:bottom-6 sm:left-6">
                    <div className="min-w-[132px] rounded-xl border border-primary-200 bg-white/80 p-3 shadow-sm backdrop-blur-md sm:min-w-[160px] sm:p-4">
                        <div className="text-[10px] text-primary-500 font-bold font-mono tracking-widest uppercase mb-3 border-b border-primary-200 pb-2">
                            Floor {currentFloor}
                        </div>
                        <div className="space-y-3 font-mono text-sm">
                            <div className="flex justify-between items-center text-primary-700">
                                <span className="font-bold">SHELVES</span>
                                <span className="text-primary-950 font-bold">{layout.objects.filter(o => o.floor === currentFloor && (o.type === 'shelf' || o.type === 'shelf2')).length}</span>
                            </div>
                            <div className="flex justify-between items-center text-primary-700">
                                <span className="font-bold">COUNTERS</span>
                                <span className="text-primary-950 font-bold">{layout.objects.filter(o => o.floor === currentFloor && o.type === 'counter').length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="absolute bottom-3 right-3 z-10 pointer-events-none text-right sm:bottom-6 sm:right-6"><div className="font-mono text-xs font-bold text-primary-500 bg-white/50 px-2 py-0.5 rounded backdrop-blur-sm">
                        {editMode ? 'CLICK / DRAG TO MODIFY' : viewMode === '2d' ? 'DRAG TO PAN / SCROLL TO ZOOM' : 'DRAG TO ROTATE OR PAN / SCROLL TO ZOOM'}
                    </div>
                </div>
            </div>

            {/* Context Notice */}
            {!editMode && !selectedItem && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex justify-center px-3"
                >
                    <div className="bg-white border border-primary-200 rounded-full px-6 py-2 flex items-center gap-3 text-sm text-primary-600 font-bold shadow-sm">
                        <Search className="w-4 h-4 text-primary-400" />
                        Search to highlight a mapped shelf location.
                    </div>
                </motion.div>
            )}
        </div>
    );
};

export default StockroomViewer;























