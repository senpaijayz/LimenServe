import React, { useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { useStockroomStore, ProductLocation } from '../store/useStockroomStoreV2';
import * as THREE from 'three';

export const AISLE_SPACING = 6;
export const SHELF_SPACING = 5;
export const LEVEL_HEIGHT = 1.5;

export function getCoordinatesFromLocation(loc: ProductLocation): [number, number, number] {
    // Aisle maps to X
    const x = (loc.aisle - 3.5) * AISLE_SPACING;
    // Level maps to Y
    const y = loc.level * LEVEL_HEIGHT - (LEVEL_HEIGHT / 2);
    // Shelf maps to Z
    const z = (loc.shelf - 3) * SHELF_SPACING;

    // Bin offset is a small jitter along X to place products side-by-side
    const binOffset = (loc.bin - 2) * 0.4;
    return [x + binOffset, y + 0.1, z];
}

export default function ShelvingSystem() {
    const { setCanEdit, isAdminMode } = useStockroomStore();

    const shelfTransforms = useMemo(() => {
        const transforms: { position: [number, number, number] }[] = [];
        for (let aisle = 1; aisle <= 6; aisle++) {
            for (let shelf = 1; shelf <= 5; shelf++) {
                for (let level = 1; level <= 6; level++) {
                    const x = (aisle - 3.5) * AISLE_SPACING;
                    const z = (shelf - 3) * SHELF_SPACING;
                    const y = level * LEVEL_HEIGHT - (LEVEL_HEIGHT / 2);
                    transforms.push({ position: [x, y, z] });
                }
            }
        }
        return transforms;
    }, []);

    const verticalPoles = useMemo(() => {
        const poles: { position: [number, number, number] }[] = [];
        for (let aisle = 1; aisle <= 6; aisle++) {
            for (let shelf = 1; shelf <= 5; shelf++) {
                const x = (aisle - 3.5) * AISLE_SPACING;
                const z = (shelf - 3) * SHELF_SPACING;
                // 4 legs per shelf unit
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
            {/* Horizontal Shelves (Metal Plates) */}
            <Instances limit={1000} castShadow receiveShadow>
                <boxGeometry args={[4, 0.1, 2]} />
                <meshStandardMaterial color="#475569" roughness={0.7} metalness={0.6} />
                {shelfTransforms.map((config, i) => (
                    <Instance
                        key={`shelf-${i}`}
                        position={config.position}
                    />
                ))}
            </Instances>

            {/* Vertical Support Poles */}
            <Instances limit={1000} castShadow receiveShadow>
                <boxGeometry args={[0.1, 9, 0.1]} />
                <meshStandardMaterial color="#0f172a" roughness={0.5} metalness={0.8} />
                {verticalPoles.map((config, i) => (
                    <Instance
                        key={`pole-${i}`}
                        position={config.position}
                    />
                ))}
            </Instances>
        </group>
    );
}
