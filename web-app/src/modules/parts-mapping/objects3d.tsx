import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Text, Line, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Lock } from 'lucide-react';
import { getDefaultObjectSize, normalizeObjectSize } from './usePartsMappingStore';
import type { LayoutObject } from './usePartsMappingStore';

// ═══════════════════════════════════════════════════════════════
// PATHFINDING (A* with Bezier fallback)
// ═══════════════════════════════════════════════════════════════
const GRID = 0.05;
const BOUNDS = { minX: -20, maxX: 20, minZ: -20, maxZ: 20 };
const toGrid = (v: number, min: number) => Math.floor((v - min) / GRID);
const toWorld = (v: number, min: number) => v * GRID + min + GRID / 2;

function createGrid(objects: LayoutObject[], floor: number) {
    const w = Math.ceil((BOUNDS.maxX - BOUNDS.minX) / GRID);
    const h = Math.ceil((BOUNDS.maxZ - BOUNDS.minZ) / GRID);
    const grid = new Uint8Array(w * h);
    const solids = ['wall', 'shelf', 'shelf2', 'counter', 'stairs', 'column', 'table'];
    for (const obj of objects) {
        if (obj.floor !== floor && obj.type !== 'stairs') continue;
        if (!solids.includes(obj.type)) continue;
        let ow = 1, od = 1;
        if (obj.size) { ow = obj.size[0]; od = obj.size[2]; }
        else if (obj.type === 'shelf') { ow = 3; od = 1; }
        else if (obj.type === 'shelf2') { ow = 1.5; od = 0.8; }
        else if (obj.type === 'counter') { ow = 2; od = 1; }
        else if (obj.type === 'table') { ow = 2.5; od = 1.2; }
        const rot = Math.abs((obj.rotation || 0) % Math.PI);
        const rotated = Math.abs(rot - Math.PI / 2) < 0.6;
        let gw = (rotated ? od : ow) + 0.05;
        let gd = (rotated ? ow : od) + 0.05;
        const sx = toGrid(obj.x - gw / 2, BOUNDS.minX), ex = toGrid(obj.x + gw / 2, BOUNDS.minX);
        const sz = toGrid(obj.z - gd / 2, BOUNDS.minZ), ez = toGrid(obj.z + gd / 2, BOUNDS.minZ);
        for (let r = sz; r < ez; r++) for (let c = sx; c < ex; c++)
            if (r >= 0 && r < h && c >= 0 && c < w) grid[r * w + c] = 1;
    }
    return { grid, w, h };
}

function findNearest(pos: THREE.Vector3, grid: Uint8Array, w: number, h: number) {
    let n = { x: toGrid(pos.x, BOUNDS.minX), z: toGrid(pos.z, BOUNDS.minZ) };
    if (n.x >= 0 && n.x < w && n.z >= 0 && n.z < h && grid[n.z * w + n.x] === 0) return n;
    for (let r = 1; r <= 100; r++)
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
            if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
            const nx = n.x + dx, nz = n.z + dz;
            if (nx >= 0 && nx < w && nz >= 0 && nz < h && grid[nz * w + nx] === 0) return { x: nx, z: nz };
        }
    return n;
}

export function findPath(startPos: THREE.Vector3, endPos: THREE.Vector3, objects: LayoutObject[], floor: number): THREE.Vector3[] {
    const { grid, w, h } = createGrid(objects, floor);
    const s = findNearest(startPos, grid, w, h), e = findNearest(endPos, grid, w, h);
    if (s.x < 0 || s.x >= w || s.z < 0 || s.z >= h || e.x < 0 || e.x >= w || e.z < 0 || e.z >= h)
        return [startPos, endPos];

    const key = (n: { x: number; z: number }) => `${n.x},${n.z}`;
    const open: { x: number; z: number }[] = [s];
    const closed = new Set<string>();
    const from = new Map<string, string>();
    const g = new Map<string, number>(), f = new Map<string, number>();
    g.set(key(s), 0);
    f.set(key(s), Math.abs(s.x - e.x) + Math.abs(s.z - e.z));

    const dirs = [
        { x: 0, z: 1, c: 1 }, { x: 0, z: -1, c: 1 }, { x: 1, z: 0, c: 1 }, { x: -1, z: 0, c: 1 },
        { x: 1, z: 1, c: 1.414 }, { x: 1, z: -1, c: 1.414 }, { x: -1, z: 1, c: 1.414 }, { x: -1, z: -1, c: 1.414 },
    ];

    let iter = 0;
    while (open.length > 0 && iter++ < 5000) {
        open.sort((a, b) => (f.get(key(a)) ?? Infinity) - (f.get(key(b)) ?? Infinity));
        const cur = open.shift()!;
        const ck = key(cur);
        if (Math.abs(cur.x - e.x) <= 1 && Math.abs(cur.z - e.z) <= 1) {
            const path: THREE.Vector3[] = [];
            let k = ck;
            while (from.has(k)) {
                const [cx, cz] = k.split(',').map(Number);
                path.unshift(new THREE.Vector3(toWorld(cx, BOUNDS.minX), startPos.y, toWorld(cz, BOUNDS.minZ)));
                k = from.get(k)!;
            }
            path.unshift(startPos);
            path.push(endPos);
            return path;
        }
        if (closed.has(ck)) continue;
        closed.add(ck);
        for (const d of dirs) {
            const nb = { x: cur.x + d.x, z: cur.z + d.z };
            const nk = key(nb);
            if (nb.x < 0 || nb.x >= w || nb.z < 0 || nb.z >= h) continue;
            if (grid[nb.z * w + nb.x] === 1 || closed.has(nk)) continue;
            const tg = (g.get(ck) ?? Infinity) + d.c;
            if (tg < (g.get(nk) ?? Infinity)) {
                from.set(nk, ck);
                g.set(nk, tg);
                f.set(nk, tg + Math.abs(nb.x - e.x) + Math.abs(nb.z - e.z));
                open.push(nb);
            }
        }
    }

    // Bezier fallback
    const mx = (startPos.x + endPos.x) / 2, mz = (startPos.z + endPos.z) / 2;
    const dx = endPos.x - startPos.x, dz = endPos.z - startPos.z;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    const cpx = mx + (-dz / len) * 5, cpz = mz + (dx / len) * 5;
    const path: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
        const t = i / 20, it = 1 - t;
        path.push(new THREE.Vector3(
            it * it * startPos.x + 2 * it * t * cpx + t * t * endPos.x, startPos.y,
            it * it * startPos.z + 2 * it * t * cpz + t * t * endPos.z,
        ));
    }
    return path;
}

// ═══════════════════════════════════════════════════════════════
// PATH RENDERER (Footprints)
// ═══════════════════════════════════════════════════════════════
export const PathRenderer = ({ points }: { points: THREE.Vector3[] }) => {
    if (!points || points.length < 2) return null;
    const steps = useMemo(() => {
        const out: { pos: THREE.Vector3; angle: number }[] = [];
        let acc = 0;
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i], b = points[i + 1], dist = a.distanceTo(b);
            let covered = 0;
            while (acc + (dist - covered) >= 0.6) {
                const need = 0.6 - acc, t = (covered + need) / dist;
                out.push({ pos: new THREE.Vector3().lerpVectors(a, b, t), angle: Math.atan2(b.x - a.x, b.z - a.z) });
                acc = 0; covered += need;
            }
            acc += dist - covered;
        }
        return out;
    }, [points]);

    return (
        <group>
            {steps.map((s, i) => (
                <group key={i} position={[s.pos.x, 0.12, s.pos.z]} rotation={[-Math.PI / 2, 0, s.angle]}>
                    <mesh position={[0.1, 0, 0]}><circleGeometry args={[0.15, 16]} /><meshBasicMaterial color="#DC2626" opacity={0.85} transparent /></mesh>
                    <mesh position={[-0.1, 0.15, 0]}><circleGeometry args={[0.15, 16]} /><meshBasicMaterial color="#DC2626" opacity={0.85} transparent /></mesh>
                </group>
            ))}
            <Line points={points} color="#DC2626" lineWidth={1} dashed opacity={0.3} transparent />
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════
// PATH WALKER (Animated sphere along path)
// ═══════════════════════════════════════════════════════════════
export const PathWalker = ({ pathPoints }: { pathPoints: THREE.Vector3[] }) => {
    const ref = useRef<THREE.Mesh>(null);
    const idx = useRef(0);
    useFrame(() => {
        if (!ref.current || !pathPoints || pathPoints.length < 2) return;
        const target = pathPoints[idx.current + 1];
        if (!target) { idx.current = 0; ref.current.position.copy(pathPoints[0]); return; }
        const d = ref.current.position.distanceTo(target);
        if (d < 0.15) { ref.current.position.copy(target); idx.current++; }
        else { ref.current.position.add(new THREE.Vector3().subVectors(target, ref.current.position).normalize().multiplyScalar(0.15)); ref.current.lookAt(target); }
    });
    if (!pathPoints?.length) return null;
    return (
        <mesh ref={ref} position={pathPoints[0].toArray()}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
            <pointLight distance={3} intensity={1} color="#fbbf24" />
        </mesh>
    );
};

// ═══════════════════════════════════════════════════════════════
// HIGHLIGHT MARKER (Pulsing green sphere + info label)
// ═══════════════════════════════════════════════════════════════
export const HighlightMarker = ({ part }: { part: any }) => {
    const ref = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (ref.current) {
            const p = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;
            ref.current.material.emissiveIntensity = p;
            ref.current.scale.setScalar(0.8 + p * 0.2);
        }
    });
    if (!part?.position) return null;
    return (
        <group position={[part.position.x, part.position.y, part.position.z]}>
            <mesh ref={ref}><sphereGeometry args={[0.3, 16, 16]} /><meshStandardMaterial color="#22c55e" emissive="#22c55e" emissiveIntensity={1} transparent opacity={0.8} /></mesh>
            <Html position={[0, 1, 0]} center>
                <div style={{ background: 'rgba(220,38,38,0.95)', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
                    📍 {part.description || 'Unknown'}
                    <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>{part.location_code || ''} • Stock: {part.stock ?? '?'}</div>
                </div>
            </Html>
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════
// CAMERA ANIMATOR (Eased fly-to)
// ═══════════════════════════════════════════════════════════════
export const CameraAnimator = ({ target, viewMode, controlsRef }: { target: any; viewMode: string; controlsRef: React.RefObject<any> }) => {
    const { camera } = useThree();
    const animRef = useRef(false);
    const startP = useRef<THREE.Vector3 | null>(null);
    const startT = useRef<THREE.Vector3 | null>(null);
    const t0 = useRef(0);

    useEffect(() => {
        if (!target?.position) return;
        const dest = new THREE.Vector3(target.position.x + 3, viewMode === '2d' ? 15 : target.position.y + 2, target.position.z + 3);
        const animate = () => {
            if (!animRef.current) {
                animRef.current = true;
                startP.current = camera.position.clone();
                startT.current = controlsRef?.current?.target?.clone();
                t0.current = Date.now();
                requestAnimationFrame(animate);
                return;
            }
            const prog = Math.min((Date.now() - t0.current) / 1500, 1);
            const e = prog < 0.5 ? 4 * prog ** 3 : 1 - (-2 * prog + 2) ** 3 / 2;
            camera.position.lerpVectors(startP.current!, dest, e);
            if (controlsRef?.current && startT.current) {
                controlsRef.current.target.lerpVectors(startT.current, new THREE.Vector3(target.position.x, target.position.y, target.position.z), e);
                controlsRef.current.update();
            }
            if (prog < 1) requestAnimationFrame(animate); else animRef.current = false;
        };
        animate();
        return () => { animRef.current = false; };
    }, [target, camera, viewMode, controlsRef]);
    return null;
};

// ═══════════════════════════════════════════════════════════════
// DRAGGABLE WRAPPER
// ═══════════════════════════════════════════════════════════════
interface DragProps {
    children: React.ReactNode;
    position: [number, number, number];
    rotation?: number;
    editMode: boolean;
    name: string;
    selected: boolean;
    locked?: boolean;
    onSelect: () => void;
    onPositionChange: (pos: [number, number, number]) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
}

export const DraggableObject = ({ children, position, rotation = 0, editMode, name, selected, locked, onSelect, onPositionChange, onDragStart, onDragEnd }: DragProps) => {
    const groupRef = useRef<THREE.Group>(null);
    const [dragging, setDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const { camera, gl } = useThree();
    const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const inter = useRef(new THREE.Vector3());
    const offset = useRef(new THREE.Vector3());

    const down = useCallback((e: any) => {
        if (!editMode) return;
        e.stopPropagation();
        onSelect();
        if (locked) return;
        setDragging(true);
        onDragStart?.();
        gl.domElement.style.cursor = 'grabbing';
        const rect = gl.domElement.getBoundingClientRect();
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
        rc.ray.intersectPlane(plane.current, inter.current);
        offset.current.copy(inter.current).sub(new THREE.Vector3(position[0], 0, position[2]));
    }, [editMode, camera, gl, position, onSelect, locked, onDragStart]);

    const move = useCallback((e: PointerEvent) => {
        if (!dragging || !editMode) return;
        const rect = gl.domElement.getBoundingClientRect();
        const rc = new THREE.Raycaster();
        rc.setFromCamera(new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1), camera);
        rc.ray.intersectPlane(plane.current, inter.current);
        const nx = Math.round((inter.current.x - offset.current.x) * 2) / 2;
        const nz = Math.round((inter.current.z - offset.current.z) * 2) / 2;
        onPositionChange([nx, position[1], nz]);
    }, [dragging, editMode, camera, gl, position, onPositionChange]);

    const up = useCallback(() => {
        setDragging(false);
        onDragEnd?.();
        gl.domElement.style.cursor = editMode ? 'grab' : 'auto';
    }, [editMode, gl, onDragEnd]);

    useEffect(() => {
        if (editMode) {
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
            return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
        }
    }, [editMode, move, up]);

    return (
        <group ref={groupRef} position={position} rotation={[0, rotation, 0]} onPointerDown={down}
            onPointerOver={() => editMode && setHovered(true)} onPointerOut={() => setHovered(false)}>
            {children}
            {editMode && (hovered || selected) && (
                <Html position={[0, 4, 0]} center>
                    <div style={{ background: selected ? 'rgba(220,38,38,0.95)' : 'rgba(37,99,235,0.92)', color: '#fff', padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', boxShadow: '0 10px 24px rgba(15,23,42,0.24)', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,0.3)' }}>
                        {locked && <Lock size={12} />}{name}
                    </div>
                </Html>
            )}
            {editMode && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.7, 0.9, 48]} />
                    <meshBasicMaterial color={selected ? '#DC2626' : dragging ? '#f59e0b' : hovered ? '#2563eb' : '#94a3b8'} transparent opacity={selected ? 0.75 : 0.5} />
                </mesh>
            )}
        </group>
    );
};

// ═══════════════════════════════════════════════════════════════
// 3D OBJECT COMPONENTS — All 13 Types
// ═══════════════════════════════════════════════════════════════

// Common props type
interface ObjProps {
    position: [number, number, number];
    rotation?: number;
    label?: string;
    isHighlighted?: boolean;
    editMode?: boolean;
    selected?: boolean;
    locked?: boolean;
    size?: [number, number, number];
    color?: string;
    onSelect?: () => void;
    onPositionChange?: (p: [number, number, number]) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    onClick?: () => void;
}

function getSize(type: string, size?: [number, number, number]) {
    return normalizeObjectSize(type, size || getDefaultObjectSize(type));
}

// Wrap helper: wraps content in DraggableObject if editMode, otherwise plain group
function Wrap({ editMode, position, rotation = 0, label = '', selected = false, locked, onSelect, onPositionChange, onDragStart, onDragEnd, children }: ObjProps & { children: React.ReactNode }) {
    if (editMode) {
        return (
            <DraggableObject position={position} rotation={rotation} editMode name={label} selected={selected!} locked={locked}
                onSelect={onSelect || (() => { })} onPositionChange={onPositionChange || (() => { })} onDragStart={onDragStart} onDragEnd={onDragEnd}>
                {children}
            </DraggableObject>
        );
    }
    return <group position={position} rotation={[0, rotation, 0]}>{children}</group>;
}

// ─── 4-Layer Shelf ───────────────────────────────────────────
export const Shelf4Layer = (p: ObjProps) => {
    const c = p.isHighlighted ? '#DC2626' : '#64748b';
    const [w, h, d] = getSize('shelf', p.size);
    const hw = w / 2;
    const hd = d / 2;
    const shelfHeights = [0.15, 0.38, 0.61, 0.82].map((ratio) => Math.max(0.25, h * ratio));
    return (
        <Wrap {...p}>
            {[[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]].map((pos, i) => (
                <mesh key={i} position={[pos[0], h / 2, pos[1]]}><boxGeometry args={[0.08, h, 0.08]} /><meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} /></mesh>
            ))}
            {shelfHeights.map((levelHeight, b) => (
                <group key={b}>
                    <mesh position={[0, levelHeight, 0]}><boxGeometry args={[w, 0.08, d]} /><meshStandardMaterial color={c} emissive={p.isHighlighted ? '#DC2626' : '#000'} emissiveIntensity={p.isHighlighted ? 0.3 : 0} /></mesh>
                    <Text position={[Math.max(0.25, hw - 0.2), levelHeight + 0.15, 0]} fontSize={0.12} color="#22c55e" anchorX="center" outlineWidth={0.01} outlineColor="#000">BIN {b + 1}</Text>
                </group>
            ))}
            <Text position={[0, h + 0.25, 0]} fontSize={0.25} color="#fbbf24" anchorX="center" fontWeight="bold" outlineWidth={0.02} outlineColor="#000">{p.label || 'SHELF'}</Text>
            <Text position={[0, h + 0.02, 0]} fontSize={0.1} color="#334155" anchorX="center">4-LAYER</Text>
            {p.isHighlighted && <pointLight position={[0, h / 2, 0]} color="#DC2626" intensity={2} distance={3} />}
        </Wrap>
    );
};

// ─── 2-Layer Shelf (Cabinet) ─────────────────────────────────
export const Shelf2Layer = (p: ObjProps) => {
    const c = p.isHighlighted ? '#DC2626' : '#64748b';
    const [w, h, d] = getSize('shelf2', p.size);
    const hw = w / 2, hd = d / 2;
    return (
        <Wrap {...p}>
            <mesh position={[0, 0.05, 0]}><boxGeometry args={[w, 0.1, d]} /><meshStandardMaterial color="#94a3b8" /></mesh>
            <mesh position={[0, h - 0.05, 0]}><boxGeometry args={[w, 0.1, d]} /><meshStandardMaterial color="#94a3b8" /></mesh>
            <mesh position={[-hw + 0.025, h / 2, 0]}><boxGeometry args={[0.05, h, d]} /><meshStandardMaterial color={c} /></mesh>
            <mesh position={[hw - 0.025, h / 2, 0]}><boxGeometry args={[0.05, h, d]} /><meshStandardMaterial color={c} /></mesh>
            <mesh position={[0, h / 2, -hd + 0.025]}><boxGeometry args={[w, h, 0.05]} /><meshStandardMaterial color={c} /></mesh>
            <mesh position={[0, h / 2, 0]}><boxGeometry args={[w - 0.1, 0.06, d - 0.05]} /><meshStandardMaterial color="#94a3b8" /></mesh>
            <Text position={[-0.35, 0.2, 0.3]} fontSize={0.1} color="#22c55e" anchorX="center" outlineWidth={0.008} outlineColor="#000">BIN 1</Text>
            <Text position={[-0.35, h / 2 + 0.15, 0.3]} fontSize={0.1} color="#22c55e" anchorX="center" outlineWidth={0.008} outlineColor="#000">BIN 2</Text>
            <Text position={[0, h + 0.2, 0]} fontSize={0.2} color="#fbbf24" anchorX="center" fontWeight="bold" outlineWidth={0.015} outlineColor="#000">{p.label || 'SHELF'}</Text>
            <Text position={[0, h - 0.05, 0]} fontSize={0.08} color="#94a3b8" anchorX="center">2-LAYER</Text>
            {p.isHighlighted && <pointLight position={[0, h / 2, 0]} color="#DC2626" intensity={1.5} distance={2} />}
        </Wrap>
    );
};

// ─── Display Table ───────────────────────────────────────────
export const DisplayTable = (p: ObjProps) => {
    const [w, h, d] = getSize('table', p.size);
    const hw = w / 2;
    const hd = d / 2;

    return (
        <Wrap {...p}>
            <mesh position={[0, h, 0]}><boxGeometry args={[w, 0.08, d]} /><meshStandardMaterial color="#8b5cf6" /></mesh>
            {[[-hw + 0.18, -hd + 0.18], [hw - 0.18, -hd + 0.18], [-hw + 0.18, hd - 0.18], [hw - 0.18, hd - 0.18]].map((v, i) => (
                <mesh key={i} position={[v[0], h / 2, v[1]]}><cylinderGeometry args={[0.05, 0.05, h]} /><meshStandardMaterial color="#64748b" /></mesh>
            ))}
            <Text position={[0, h + 0.2, 0]} fontSize={0.15} color="#fff" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Display Stand ───────────────────────────────────────────
export const DisplayStand = (p: ObjProps) => {
    const [w, h, d] = getSize('stand', p.size);

    return (
        <Wrap {...p}>
            <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, Math.max(0.1, d * 0.65)]} /><meshStandardMaterial color="#f59e0b" /></mesh>
            <mesh position={[0, 0.05, 0]}><boxGeometry args={[Math.max(w * 1.2, w + 0.2), 0.1, d]} /><meshStandardMaterial color="#374151" /></mesh>
            <Text position={[0, h + 0.2, 0]} fontSize={0.12} color="#fff" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Signage ─────────────────────────────────────────────────
export const Signage = (p: ObjProps) => {
    const [w, h, d] = getSize('signage', p.size);

    return (
        <Wrap {...p}>
            <mesh position={[0, h, 0]}><boxGeometry args={[w, Math.max(0.35, h * 0.42), d]} /><meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.2} /></mesh>
            <mesh position={[0, h / 2, 0]}><cylinderGeometry args={[0.05, 0.05, h]} /><meshStandardMaterial color="#64748b" /></mesh>
            <Text position={[0, h, d / 2 + 0.04]} fontSize={Math.min(0.28, Math.max(0.12, w / 10))} color="#fff" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Counter ─────────────────────────────────────────────────
export const Counter = (p: ObjProps) => {
    const [w, h, d] = getSize('counter', p.size);

    return (
        <Wrap {...p}>
            <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#374151" /></mesh>
            <mesh position={[0, h + 0.05, 0]}><boxGeometry args={[w + 0.2, 0.1, d + 0.2]} /><meshStandardMaterial color="#1f2937" /></mesh>
            <mesh position={[0, h / 2, d / 2 + 0.015]}><boxGeometry args={[w, Math.max(0.2, h * 0.8), 0.03]} /><meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.2} /></mesh>
            <Text position={[0, h + 0.45, 0]} fontSize={0.18} color="#dc2626" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Stairs (L-Shaped) ───────────────────────────────────────
export const Stairs = (p: ObjProps) => {
    const [hovered, setHovered] = useState(false);
    useEffect(() => {
        document.body.style.cursor = hovered && !p.editMode ? 'pointer' : 'auto';
        return () => { document.body.style.cursor = 'auto'; };
    }, [hovered, p.editMode]);
    const sc = '#d4a574', se = '#c4956a';
    const [w, h, d] = getSize('stairs', p.size);
    const scale: [number, number, number] = [w / 3.5, h / 3.4, d / 4.2];
    const content = (
        <group scale={scale}>
            {Array.from({ length: 5 }, (_, i) => (
                <group key={`lo-${i}`}>
                    <mesh position={[0, i * 0.3 + 0.15, i * 0.4]}><boxGeometry args={[2, 0.2, 0.4]} /><meshStandardMaterial color={sc} /></mesh>
                    <mesh position={[0, i * 0.3, i * 0.4 - 0.15]}><boxGeometry args={[2, 0.3, 0.1]} /><meshStandardMaterial color={se} /></mesh>
                </group>
            ))}
            <mesh position={[0, 1.65, 2.2]}><boxGeometry args={[2.5, 0.2, 2]} /><meshStandardMaterial color={sc} /></mesh>
            {Array.from({ length: 5 }, (_, i) => (
                <group key={`hi-${i}`}>
                    <mesh position={[-i * 0.4 - 0.3, 1.95 + i * 0.3, 2.7]}><boxGeometry args={[0.4, 0.2, 1.5]} /><meshStandardMaterial color={sc} /></mesh>
                    <mesh position={[-i * 0.4 - 0.1, 1.8 + i * 0.3, 2.7]}><boxGeometry args={[0.1, 0.3, 1.5]} /><meshStandardMaterial color={se} /></mesh>
                </group>
            ))}
            <mesh position={[1, 1.2, 1]}><boxGeometry args={[0.06, 1.5, 2.5]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} /></mesh>
            <mesh position={[-1, 1.2, 1]}><boxGeometry args={[0.06, 1.5, 2.5]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} /></mesh>
            <mesh position={[-1.5, 2.8, 2]}><boxGeometry args={[2, 0.06, 0.06]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} /></mesh>
            <mesh position={[-1.5, 2.8, 3.4]}><boxGeometry args={[2, 0.06, 0.06]} /><meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} /></mesh>
            {p.label && <Text position={[0, 4, 1.5]} fontSize={0.25} color="#fff" anchorX="center">{p.label}</Text>}
        </group>
    );
    if (p.editMode) return <Wrap {...p}>{content}</Wrap>;
    return (
        <group position={p.position} rotation={[0, p.rotation || 0, 0]} onClick={(e) => { if (!p.editMode) { e.stopPropagation(); p.onClick?.(); } }}
            onPointerOver={() => !p.editMode && setHovered(true)} onPointerOut={() => setHovered(false)}>
            {content}
        </group>
    );
};

// ─── Room ────────────────────────────────────────────────────
export const Room = (p: ObjProps) => {
    const [w, h, d] = getSize('room', p.size);

    return (
        <Wrap {...p}>
            <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={p.color || '#374151'} transparent opacity={0.78} /></mesh>
            <mesh position={[0, Math.min(1, h / 2), d / 2 + 0.03]}><boxGeometry args={[Math.min(w * 0.5, 0.9), Math.min(h * 0.75, 2), 0.06]} /><meshStandardMaterial color="#1f2937" /></mesh>
            <Text position={[0, h + 0.25, 0]} fontSize={0.18} color="#fff" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Entrance (Animated doors) ───────────────────────────────
export const Entrance = (p: ObjProps) => {
    const left = useRef<THREE.Group>(null), right = useRef<THREE.Group>(null);
    useFrame((s) => {
        const open = Math.sin(s.clock.elapsedTime * 0.5) > 0.5;
        if (left.current) left.current.rotation.y = THREE.MathUtils.lerp(left.current.rotation.y, open ? -Math.PI / 3 : 0, 0.05);
        if (right.current) right.current.rotation.y = THREE.MathUtils.lerp(right.current.rotation.y, open ? Math.PI / 3 : 0, 0.05);
    });
    const [w, h, d] = getSize('entrance', p.size);
    const doorWidth = Math.max(0.35, w * 0.32);

    return (
        <Wrap {...p}>
            <mesh position={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color="#1f2937" /></mesh>
            <mesh position={[0, h * 0.45, d / 2 + 0.03]}><boxGeometry args={[Math.max(w - 0.8, 0.6), Math.max(h - 0.5, 0.8), 0.08]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <group ref={left} position={[-doorWidth * 0.6, h * 0.45, d / 2 + 0.08]}><mesh position={[-doorWidth / 2, 0, 0]}><boxGeometry args={[doorWidth, Math.max(h - 0.7, 0.8), 0.08]} /><meshStandardMaterial color="#475569" /></mesh></group>
            <group ref={right} position={[doorWidth * 0.6, h * 0.45, d / 2 + 0.08]}><mesh position={[doorWidth / 2, 0, 0]}><boxGeometry args={[doorWidth, Math.max(h - 0.7, 0.8), 0.08]} /><meshStandardMaterial color="#475569" /></mesh></group>
            <mesh position={[0, 0.02, d / 2 + 0.7]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[Math.max(1.4, w * 0.55), 1]} /><meshStandardMaterial color="#dc2626" /></mesh>
            <Text position={[0, h + 0.3, 0]} fontSize={0.25} color="#10b981" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Parking ─────────────────────────────────────────────────
export const Parking = (p: ObjProps) => {
    const [w, h, d] = getSize('parking', p.size);

    return (
        <Wrap {...p}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color="#2d3748" /></mesh>
            {[0, 1, 2].map(i => <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -d / 2 + (i + 1) * (d / 4)]}><planeGeometry args={[Math.max(w - 1, 1), 0.08]} /><meshStandardMaterial color="#f0f0f0" /></mesh>)}
            <mesh position={[-w / 2, Math.max(1.5, h / 2), 0]}><boxGeometry args={[0.3, Math.max(3, h), d]} /><meshStandardMaterial color="#1e293b" /></mesh>
            <mesh position={[0, Math.max(1.5, h / 2), -d / 2]}><boxGeometry args={[w, Math.max(3, h), 0.3]} /><meshStandardMaterial color="#1e293b" /></mesh>
            <Text position={[0, 0.1, d * 0.3]} fontSize={0.4} color="#fff" rotation={[-Math.PI / 2, 0, 0]}>{p.label}</Text>
        </Wrap>
    );
};

// ─── Wall ────────────────────────────────────────────────────
export const Wall = (p: ObjProps) => {
    const s = getSize('wall', p.size);
    return (
        <Wrap {...p}>
            <mesh position={[0, s[1] / 2, 0]}><boxGeometry args={s as [number, number, number]} /><meshStandardMaterial color="#1e293b" /></mesh>
            {p.editMode && <Text position={[0, s[1] + 0.3, 0]} fontSize={0.2} color="#fff" anchorX="center">{p.label}</Text>}
        </Wrap>
    );
};

// ─── Custom Label ────────────────────────────────────────────
export const CustomLabel = (p: ObjProps) => {
    const [w, , d] = getSize('label', p.size);

    return (
        <Wrap {...p} label={`Label: ${p.label}`}>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color="#3b82f6" transparent opacity={0.7} /></mesh>
            <Text position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={Math.min(0.3, Math.max(0.14, w / 12))} color="#fff" anchorX="center">{p.label}</Text>
        </Wrap>
    );
};

// ─── Floor ───────────────────────────────────────────────────
export const FloorObj = (p: ObjProps & { floor?: number; isVisible?: boolean }) => {
    if (p.isVisible === false) return null;
    const s = getSize('floor', p.size);
    const floor = p.floor || 1;
    return (
        <Wrap {...p} label={`Floor ${floor}`}>
            <mesh position={[0, -s[1] / 2 - 0.01, 0]}><boxGeometry args={s as [number, number, number]} /><meshStandardMaterial color={p.color || (floor === 1 ? '#64748b' : '#475569')} /></mesh>
            {p.editMode && <gridHelper args={[Math.max(s[0], s[2]), Math.max(s[0], s[2]), '#cbd5e1', '#94a3b8']} position={[0, s[1] + 0.01, 0]} />}
        </Wrap>
    );
};

// ═══════════════════════════════════════════════════════════════
// OBJECT TYPE → COMPONENT MAP
// ═══════════════════════════════════════════════════════════════
export const OBJECT_COMPONENTS: Record<string, React.FC<any>> = {
    shelf: Shelf4Layer,
    shelf2: Shelf2Layer,
    table: DisplayTable,
    stand: DisplayStand,
    signage: Signage,
    counter: Counter,
    stairs: Stairs,
    room: Room,
    entrance: Entrance,
    parking: Parking,
    wall: Wall,
    label: CustomLabel,
    floor: FloorObj,
};
