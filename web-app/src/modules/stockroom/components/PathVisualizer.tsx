import React, { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStockroomStore } from '../store/useStockroomStoreV2';

function FlowParticle({ curve, offset }: { curve: THREE.CatmullRomCurve3; offset: number }) {
    const ref = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (!ref.current) return;
        const t = (state.clock.elapsedTime * 0.28 + offset) % 1;
        const point = curve.getPointAt(t);
        ref.current.position.copy(point);
        const scale = 0.75 + Math.sin(state.clock.elapsedTime * 5 + offset * 10) * 0.18;
        ref.current.scale.setScalar(scale);
    });

    return (
        <mesh ref={ref}>
            <sphereGeometry args={[0.16, 16, 16]} />
            <meshStandardMaterial
                color="#67e8f9"
                emissive="#22d3ee"
                emissiveIntensity={2.2}
                roughness={0.18}
                toneMapped={false}
            />
        </mesh>
    );
}

export default function PathVisualizer() {
    const { currentPath, isLocating, selectedProductId } = useStockroomStore();

    const curve = useMemo(() => {
        if (!currentPath || currentPath.length < 2) return null;
        return new THREE.CatmullRomCurve3(
            currentPath.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
            false,
            'catmullrom',
            0.18,
        );
    }, [currentPath]);

    const targetPoint = useMemo(() => {
        if (!curve) return null;
        return curve.getPointAt(1);
    }, [curve]);

    const lineGeometry = useMemo(() => {
        if (!curve) return null;
        return new THREE.BufferGeometry().setFromPoints(curve.getPoints(64));
    }, [curve]);

    if (!curve || !isLocating) {
        return null;
    }

    return (
        <group>
            <mesh>
                <tubeGeometry args={[curve, 96, 0.045, 10, false]} />
                <meshStandardMaterial
                    color="#0e7490"
                    emissive="#22d3ee"
                    emissiveIntensity={1.55}
                    transparent
                    opacity={0.82}
                    roughness={0.2}
                    toneMapped={false}
                />
            </mesh>

            {lineGeometry && (
                <line>
                    <primitive object={lineGeometry} attach="geometry" />
                    <lineBasicMaterial
                        attach="material"
                        color="#cffafe"
                        transparent
                        opacity={0.9}
                        linewidth={2}
                        toneMapped={false}
                    />
                </line>
            )}
            {[0, 0.22, 0.44, 0.66].map((offset) => (
                <FlowParticle key={offset} curve={curve} offset={offset} />
            ))}

            {targetPoint && (
                <Html position={[targetPoint.x, targetPoint.y + 0.9, targetPoint.z]} center transform sprite zIndexRange={[90, 0]}>
                    <div className="pointer-events-none rounded-2xl border border-cyan-300/50 bg-slate-950/92 px-4 py-2 text-center shadow-2xl shadow-cyan-500/20 backdrop-blur">
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-200">Located in 3D</p>
                        <p className="mt-1 font-mono text-[10px] text-white/80">{selectedProductId}</p>
                    </div>
                </Html>
            )}
        </group>
    );
}
