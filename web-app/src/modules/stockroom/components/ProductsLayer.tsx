import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, PivotControls } from '@react-three/drei';
import { useStockroomStore } from '../store/useStockroomStoreV2';
import { getCoordinatesFromLocation, AISLE_SPACING, SHELF_SPACING, LEVEL_HEIGHT } from './ShelvingSystem';
import * as THREE from 'three';

export function ProductGeometry({ product, isSelected }: { product: any, isSelected: boolean }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const { selectProduct, isAdminMode, updateProductLocation } = useStockroomStore();
    const [hovered, setHovered] = useState(false);
    const pos = getCoordinatesFromLocation(product.location);

    useFrame((state) => {
        if (isSelected && meshRef.current) {
            // Glow and pulse effect
            meshRef.current.scale.x = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.1;
            meshRef.current.scale.y = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.1;
            meshRef.current.scale.z = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.1;
            // @ts-ignore
            meshRef.current.material.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 4) * 0.5;
        } else if (meshRef.current) {
            meshRef.current.scale.set(1, 1, 1);
            // @ts-ignore
            meshRef.current.material.emissiveIntensity = hovered ? 0.3 : 0;
        }
    });

    // Decide geometry based on category
    let geometry = <boxGeometry args={[0.5, 0.5, 0.5]} />;
    if (product.category === 'Tires') {
        geometry = <torusGeometry args={[0.3, 0.15, 16, 32]} />;
    } else if (product.category === 'Filters') {
        geometry = <cylinderGeometry args={[0.2, 0.2, 0.6, 16]} />;
    }

    // Handle color palette
    const highlightColor = new THREE.Color("#f97316");
    const baseColor = new THREE.Color(hovered ? "#9ca3af" : "#cbd5e1");

    const InnerMesh = (
        <mesh ref={meshRef} castShadow receiveShadow>
            {geometry}
            <meshStandardMaterial
                color={isSelected ? highlightColor : baseColor}
                emissive={isSelected ? highlightColor : baseColor}
                emissiveIntensity={0}
                roughness={0.6}
            />
        </mesh>
    );

    return (
        <group
            position={pos}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
            onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
            onClick={(e) => { e.stopPropagation(); selectProduct(product.id); }}
        >
            {isSelected && isAdminMode ? (
                <PivotControls
                    scale={1.5}
                    activeAxes={[true, true, true]}
                    onDragEnd={() => {
                        if (!meshRef.current) return;
                        const worldPos = new THREE.Vector3();
                        meshRef.current.getWorldPosition(worldPos);

                        // Reverse Engineer Matrix Position
                        let aisle = Math.round(worldPos.x / AISLE_SPACING + 3.5);
                        let shelf = Math.round(worldPos.z / SHELF_SPACING + 3);
                        let level = Math.round((worldPos.y + (LEVEL_HEIGHT / 2)) / LEVEL_HEIGHT);
                        let bin = Math.round((worldPos.x - (aisle - 3.5) * AISLE_SPACING) / 0.4 + 2);

                        // Constrain
                        aisle = Math.max(1, Math.min(6, aisle));
                        shelf = Math.max(1, Math.min(5, shelf));
                        level = Math.max(1, Math.min(6, level));

                        updateProductLocation(product.id, { aisle, shelf, level, bin });
                    }}
                >
                    {InnerMesh}
                </PivotControls>
            ) : InnerMesh}

            {/* Floating UI Tooltip when hovered or selected */}
            {(hovered || isSelected) && (
                <Html position={[0, 0.6, 0]} center zIndexRange={[100, 0]} transform sprite>
                    <div className="bg-[#111827]/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-orange-500/50 shadow-xl pointer-events-none w-max">
                        <p className="text-white text-xs font-bold">{product.name}</p>
                        <p className="text-orange-400 text-[10px] font-mono mt-0.5">{product.sku}</p>
                    </div>
                </Html>
            )}
        </group>
    );
}

export default function ProductsLayer() {
    const { products, selectedProductId } = useStockroomStore();

    return (
        <group>
            {products.map(product => (
                <ProductGeometry
                    key={product.id}
                    product={product}
                    isSelected={selectedProductId === product.id}
                />
            ))}
        </group>
    );
}
