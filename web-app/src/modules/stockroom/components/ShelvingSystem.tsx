import React, { useMemo, useRef, useState } from 'react';
import { Html, Instances, Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStockroomStore, StockroomShelf } from '../store/useStockroomStoreV2';
import {
    AISLE_SPACING,
    LEVEL_HEIGHT,
    SHELF_SPACING,
    getCoordinatesFromLocation,
} from '../utils/stockroomGeometry';

export { AISLE_SPACING, LEVEL_HEIGHT, SHELF_SPACING, getCoordinatesFromLocation };

function aisleToNumber(value: string | number) {
    if (typeof value === 'number') return value;
    const letter = String(value || 'A').trim().toUpperCase().match(/[A-Z]/)?.[0] || 'A';
    return Math.max(1, Math.min(6, letter.charCodeAt(0) - 64));
}

function getShelfPosition(shelf: StockroomShelf): [number, number, number] {
    const aisleNumber = aisleToNumber(shelf.aisle);
    return [
        (aisleNumber - 3.5) * AISLE_SPACING,
        shelf.level * LEVEL_HEIGHT - (LEVEL_HEIGHT / 2),
        (shelf.shelfNumber - 3) * SHELF_SPACING,
    ];
}

function ShelfPlate({ shelf }: { shelf: StockroomShelf }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [hovered, setHovered] = useState(false);
    const { selectedShelfId, selectShelf, updateShelf } = useStockroomStore();
    const isSelected = selectedShelfId === shelf.id;
    const position = getShelfPosition(shelf);

    useFrame((state) => {
        if (!meshRef.current) return;
        const pulse = isSelected ? 1 + Math.sin(state.clock.elapsedTime * 6) * 0.025 : 1;
        meshRef.current.scale.set(pulse, 1, pulse);
    });

    const color = isSelected ? '#22d3ee' : hovered ? '#94a3b8' : '#64748b';
    const emissiveIntensity = isSelected ? 0.45 : hovered ? 0.18 : 0.04;

    return (
        <group>
            <mesh
                ref={meshRef}
                castShadow
                receiveShadow
                position={position}
                userData={{
                    kind: 'shelf',
                    shelfId: shelf.id,
                    aisle: shelf.aisle,
                    shelfNumber: shelf.shelfNumber,
                    level: shelf.level,
                    capacity: shelf.capacity,
                }}
                onPointerOver={(event) => {
                    event.stopPropagation();
                    setHovered(true);
                    document.body.style.cursor = 'pointer';
                }}
                onPointerOut={(event) => {
                    event.stopPropagation();
                    setHovered(false);
                    document.body.style.cursor = '';
                }}
                onClick={(event) => {
                    event.stopPropagation();
                    selectShelf(shelf.id);
                }}
                onDoubleClick={(event) => {
                    event.stopPropagation();
                    void updateShelf(shelf.id, {
                        capacity: Number(shelf.capacity ?? 50) + 10,
                        metadata: {
                            ...(shelf.metadata ?? {}),
                            lastCapacityBumpAt: new Date().toISOString(),
                        },
                    });
                }}
            >
                <boxGeometry args={[4, 0.12, 2]} />
                <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={emissiveIntensity}
                    roughness={0.52}
                    metalness={0.65}
                />
            </mesh>

            {(hovered || isSelected) && (
                <Html position={[position[0], position[1] + 0.42, position[2]]} center transform sprite zIndexRange={[70, 0]}>
                    <div className="pointer-events-none rounded-xl border border-cyan-300/40 bg-slate-950/90 px-3 py-2 text-white shadow-2xl backdrop-blur">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-200">
                            Aisle {shelf.aisle} • Shelf {shelf.shelfNumber}
                        </p>
                        <p className="mt-1 text-[10px] font-semibold text-slate-300">
                            Level {shelf.level} • Capacity {shelf.capacity ?? 50}
                        </p>
                    </div>
                </Html>
            )}
        </group>
    );
}

export default function ShelvingSystem() {
    const shelves = useStockroomStore((state) => state.shelves);
    const visibleShelves = shelves.length > 0 ? shelves : [];

    const verticalPoles = useMemo(() => {
        const poles: { position: [number, number, number] }[] = [];
        for (let aisle = 1; aisle <= 6; aisle += 1) {
            for (let shelf = 1; shelf <= 5; shelf += 1) {
                const x = (aisle - 3.5) * AISLE_SPACING;
                const z = (shelf - 3) * SHELF_SPACING;
                poles.push({ position: [x - 2, 4.5, z - 1] });
                poles.push({ position: [x + 2, 4.5, z - 1] });
                poles.push({ position: [x - 2, 4.5, z + 1] });
                poles.push({ position: [x + 2, 4.5, z + 1] });
            }
        }
        return poles;
    }, []);

    return (
        <group>
            {visibleShelves.map((shelf) => (
                <ShelfPlate key={shelf.id} shelf={shelf} />
            ))}

            <Instances limit={1000} castShadow receiveShadow>
                <boxGeometry args={[0.1, 9, 0.1]} />
                <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
                {verticalPoles.map((config, index) => (
                    <Instance key={`pole-${index}`} position={config.position} />
                ))}
            </Instances>
        </group>
    );
}
