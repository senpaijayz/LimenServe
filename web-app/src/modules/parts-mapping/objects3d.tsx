import React from 'react';
import { Text } from '@react-three/drei';
import * as THREE from 'three';

// ─── Shared Colors ───────────────────────────────────────────
const C = {
    metal: '#475569',
    metalDark: '#1e293b',
    wood: '#92400e',
    orange: '#f97316',
    red: '#ef4444',
    floor: '#1e293b',
    wall: '#0f172a',
    concrete: '#334155',
};

interface ObjProps {
    position: [number, number, number];
    rotation?: number;
    label?: string;
    isHighlighted?: boolean;
    size?: [number, number, number];
    color?: string;
}

// ─── Shelf 4-Layer ───────────────────────────────────────────
export function Shelf4Layer({ position, rotation = 0, label = '', isHighlighted }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    const emissive = isHighlighted ? new THREE.Color(C.orange) : new THREE.Color('#000');
    const ei = isHighlighted ? 0.6 : 0;
    return (
        <group position={position} rotation={[0, r, 0]}>
            {/* Vertical poles */}
            {[[-0.7, 0, -0.3], [0.7, 0, -0.3], [-0.7, 0, 0.3], [0.7, 0, 0.3]].map((p, i) => (
                <mesh key={i} position={p as [number, number, number]} castShadow>
                    <boxGeometry args={[0.06, 2.4, 0.06]} />
                    <meshStandardMaterial color={C.metalDark} metalness={0.7} roughness={0.4} emissive={emissive} emissiveIntensity={ei} />
                </mesh>
            ))}
            {/* Shelves */}
            {[0, 0.6, 1.2, 1.8].map((y, i) => (
                <mesh key={`s${i}`} position={[0, y, 0]} castShadow receiveShadow>
                    <boxGeometry args={[1.5, 0.05, 0.7]} />
                    <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} emissive={emissive} emissiveIntensity={ei} />
                </mesh>
            ))}
            {label && (
                <Text position={[0, 2.6, 0]} fontSize={0.25} color="white" anchorY="bottom">
                    {label}
                </Text>
            )}
        </group>
    );
}

// ─── Shelf 2-Layer ───────────────────────────────────────────
export function Shelf2Layer({ position, rotation = 0, label = '', isHighlighted, size }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    const w = size?.[0] ?? 1.5;
    const d = size?.[2] ?? 0.7;
    const emissive = isHighlighted ? new THREE.Color(C.orange) : new THREE.Color('#000');
    const ei = isHighlighted ? 0.6 : 0;
    return (
        <group position={position} rotation={[0, r, 0]}>
            {/* Back panel */}
            <mesh position={[0, 0.6, -d / 2]} castShadow>
                <boxGeometry args={[w, 1.2, 0.04]} />
                <meshStandardMaterial color={C.metalDark} metalness={0.6} roughness={0.4} emissive={emissive} emissiveIntensity={ei} />
            </mesh>
            {/* Side panels */}
            {[-w / 2, w / 2].map((x, i) => (
                <mesh key={i} position={[x, 0.6, 0]} castShadow>
                    <boxGeometry args={[0.04, 1.2, d]} />
                    <meshStandardMaterial color={C.metalDark} metalness={0.6} roughness={0.4} emissive={emissive} emissiveIntensity={ei} />
                </mesh>
            ))}
            {/* Shelves */}
            {[0, 0.6].map((y, i) => (
                <mesh key={`s${i}`} position={[0, y, 0]} castShadow receiveShadow>
                    <boxGeometry args={[w, 0.05, d]} />
                    <meshStandardMaterial color={C.metal} metalness={0.5} roughness={0.5} emissive={emissive} emissiveIntensity={ei} />
                </mesh>
            ))}
            {label && <Text position={[0, 1.4, 0]} fontSize={0.22} color="white" anchorY="bottom">{label}</Text>}
        </group>
    );
}

// ─── Counter ─────────────────────────────────────────────────
export function CounterObj({ position, rotation = 0, label = '', isHighlighted }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    const emissive = isHighlighted ? new THREE.Color(C.orange) : new THREE.Color('#000');
    const ei = isHighlighted ? 0.6 : 0;
    return (
        <group position={position} rotation={[0, r, 0]}>
            <mesh position={[0, 0.45, 0]} castShadow receiveShadow>
                <boxGeometry args={[2.5, 0.9, 1]} />
                <meshStandardMaterial color="#334155" metalness={0.3} roughness={0.6} emissive={emissive} emissiveIntensity={ei} />
            </mesh>
            {/* Top surface */}
            <mesh position={[0, 0.91, 0]} receiveShadow>
                <boxGeometry args={[2.6, 0.04, 1.1]} />
                <meshStandardMaterial color={C.metal} metalness={0.6} roughness={0.3} emissive={emissive} emissiveIntensity={ei} />
            </mesh>
            {label && <Text position={[0, 1.2, 0]} fontSize={0.2} color="white">{label}</Text>}
        </group>
    );
}

// ─── Stairs ──────────────────────────────────────────────────
export function StairsObj({ position, rotation = 0, label = '', isHighlighted }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    const emissive = isHighlighted ? new THREE.Color(C.orange) : new THREE.Color('#000');
    const ei = isHighlighted ? 0.6 : 0;
    const steps = 8;
    return (
        <group position={position} rotation={[0, r, 0]}>
            {Array.from({ length: steps }).map((_, i) => (
                <mesh key={i} position={[0, i * 0.3, -i * 0.35]} castShadow receiveShadow>
                    <boxGeometry args={[2, 0.15, 0.35]} />
                    <meshStandardMaterial
                        color={i % 2 === 0 ? '#d4a574' : '#c2956a'}
                        emissive={emissive} emissiveIntensity={ei}
                    />
                </mesh>
            ))}
            {/* Landing platform */}
            <mesh position={[0, steps * 0.3, -(steps) * 0.35]} castShadow receiveShadow>
                <boxGeometry args={[2, 0.15, 1.5]} />
                <meshStandardMaterial color="#b8956a" emissive={emissive} emissiveIntensity={ei} />
            </mesh>
            {/* Railing */}
            <mesh position={[-1.05, steps * 0.15, -(steps / 2) * 0.35]} castShadow>
                <boxGeometry args={[0.05, steps * 0.3 + 0.5, 0.05]} />
                <meshStandardMaterial color={C.metalDark} metalness={0.8} roughness={0.3} />
            </mesh>
            {label && <Text position={[0, steps * 0.3 + 0.6, 0]} fontSize={0.2} color="white">{label}</Text>}
        </group>
    );
}

// ─── Entrance ────────────────────────────────────────────────
export function EntranceObj({ position, rotation = 0, label = '', isHighlighted }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    return (
        <group position={position} rotation={[0, r, 0]}>
            <mesh position={[0, 0.15, 0]} castShadow>
                <boxGeometry args={[2, 0.3, 1]} />
                <meshStandardMaterial
                    color={isHighlighted ? C.orange : C.red}
                    emissive={isHighlighted ? new THREE.Color(C.orange) : new THREE.Color('#000')}
                    emissiveIntensity={isHighlighted ? 0.5 : 0}
                />
            </mesh>
            {label && <Text position={[0, 0.6, 0]} fontSize={0.2} color="white">{label}</Text>}
        </group>
    );
}

// ─── Wall ────────────────────────────────────────────────────
export function WallObj({ position, rotation = 0, size, label = '' }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    const s = size || [10, 3, 0.3];
    return (
        <group position={position} rotation={[0, r, 0]}>
            <mesh castShadow receiveShadow>
                <boxGeometry args={s} />
                <meshStandardMaterial color={C.wall} roughness={0.9} />
            </mesh>
            {label && <Text position={[0, s[1] / 2 + 0.3, 0]} fontSize={0.18} color="#94a3b8">{label}</Text>}
        </group>
    );
}

// ─── Floor Plane ─────────────────────────────────────────────
export function FloorObj({ position, size, color, label = '' }: ObjProps) {
    const s = size || [10, 0.2, 10];
    return (
        <group position={position}>
            <mesh receiveShadow>
                <boxGeometry args={s} />
                <meshStandardMaterial color={color || C.floor} roughness={0.7} metalness={0.1} />
            </mesh>
            {label && <Text position={[0, 0.2, 0]} fontSize={0.3} color="#64748b" rotation={[-Math.PI / 2, 0, 0]}>{label}</Text>}
        </group>
    );
}

// ─── Parking ─────────────────────────────────────────────────
export function ParkingObj({ position, rotation = 0, label = '' }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    return (
        <group position={position} rotation={[0, r, 0]}>
            <mesh position={[0, 0.01, 0]} receiveShadow>
                <boxGeometry args={[4, 0.02, 3]} />
                <meshStandardMaterial color="#1e293b" roughness={0.8} />
            </mesh>
            {/* Parking lines */}
            {[-1, 0, 1].map((x, i) => (
                <mesh key={i} position={[x, 0.03, 0]}>
                    <boxGeometry args={[0.05, 0.01, 2.5]} />
                    <meshStandardMaterial color="white" />
                </mesh>
            ))}
            {label && <Text position={[0, 0.15, 1.2]} fontSize={0.25} color="white" rotation={[-Math.PI / 2, 0, 0]}>{label}</Text>}
        </group>
    );
}

// ─── Room ────────────────────────────────────────────────────
export function RoomObj({ position, rotation = 0, label = '', color }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    return (
        <group position={position} rotation={[0, r, 0]}>
            <mesh position={[0, 1, 0]} castShadow>
                <boxGeometry args={[3, 2, 3]} />
                <meshStandardMaterial color={color || '#374151'} roughness={0.8} />
            </mesh>
            {label && <Text position={[0, 2.3, 0]} fontSize={0.2} color="white">{label}</Text>}
        </group>
    );
}

// ─── Label ───────────────────────────────────────────────────
export function LabelObj({ position, rotation = 0, label = '' }: ObjProps) {
    const r = (rotation * Math.PI) / 180;
    return (
        <group position={position} rotation={[0, r, 0]}>
            <Text position={[0, 0.1, 0]} fontSize={0.35} color={C.orange} rotation={[-Math.PI / 2, 0, 0]} anchorX="center">
                {label || 'Label'}
            </Text>
        </group>
    );
}

// ─── Component Map ───────────────────────────────────────────
export const OBJECT_COMPONENTS: Record<string, React.FC<ObjProps>> = {
    shelf4: Shelf4Layer,
    shelf2: Shelf2Layer,
    counter: CounterObj,
    stairs: StairsObj,
    entrance: EntranceObj,
    wall: WallObj,
    floor: FloorObj,
    parking: ParkingObj,
    room: RoomObj,
    label: LabelObj,
};

export const OBJECT_TYPE_INFO: Record<string, { label: string; icon: string }> = {
    shelf4: { label: '4-Layer Shelf', icon: '📦' },
    shelf2: { label: '2-Layer Shelf', icon: '📦' },
    counter: { label: 'Counter', icon: '🖥️' },
    stairs: { label: 'Stairs', icon: '🪜' },
    entrance: { label: 'Entrance', icon: '🚪' },
    wall: { label: 'Wall', icon: '🧱' },
    floor: { label: 'Floor', icon: '⬛' },
    parking: { label: 'Parking', icon: '🅿️' },
    room: { label: 'Room', icon: '🏠' },
    label: { label: 'Label', icon: '🏷️' },
};
