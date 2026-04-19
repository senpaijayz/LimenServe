import React, { Suspense, useRef, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { CameraControls, Grid } from '@react-three/drei';
import { usePartsMappingStore } from './usePartsMappingStore';
import { OBJECT_COMPONENTS } from './objects3d';

function SceneObjects() {
    const floor = usePartsMappingStore(s => s.currentFloor());
    const highlightedObjectId = usePartsMappingStore(s => s.highlightedObjectId);
    const selectedObjectId = usePartsMappingStore(s => s.selectedObjectId);
    const selectObject = usePartsMappingStore(s => s.selectObject);
    const isDesignMode = usePartsMappingStore(s => s.isDesignMode);
    const updateObjectPosition = usePartsMappingStore(s => s.updateObjectPosition);

    return (
        <group>
            {floor.objects.map(obj => {
                const Comp = OBJECT_COMPONENTS[obj.type];
                if (!Comp) return null;
                const isHighlighted = obj.id === highlightedObjectId || obj.id === selectedObjectId;
                return (
                    <group
                        key={obj.id}
                        onClick={(e) => { e.stopPropagation(); selectObject(obj.id); }}
                        onPointerMissed={() => selectObject(null)}
                    >
                        <Comp
                            position={obj.position}
                            rotation={obj.rotation}
                            label={obj.label}
                            isHighlighted={isHighlighted}
                            size={obj.size}
                            color={obj.color}
                        />
                    </group>
                );
            })}
        </group>
    );
}

function CameraController() {
    const controlsRef = useRef<any>(null);
    const highlightedObjectId = usePartsMappingStore(s => s.highlightedObjectId);
    const floor = usePartsMappingStore(s => s.currentFloor());

    useEffect(() => {
        if (!highlightedObjectId || !controlsRef.current) return;
        const obj = floor.objects.find(o => o.id === highlightedObjectId);
        if (!obj) return;
        const [tx, ty, tz] = obj.position;
        controlsRef.current.setLookAt(tx + 8, 12, tz + 8, tx, ty, tz, true);
    }, [highlightedObjectId, floor.objects]);

    return (
        <CameraControls
            ref={controlsRef}
            minPolarAngle={0.2}
            maxPolarAngle={Math.PI / 2.2}
            minDistance={5}
            maxDistance={45}
            smoothTime={0.35}
        />
    );
}

export default function Scene3D() {
    const isDesignMode = usePartsMappingStore(s => s.isDesignMode);

    return (
        <Canvas
            shadows
            camera={{ position: [12, 14, 12], fov: 45 }}
            gl={{ antialias: true }}
        >
            <color attach="background" args={['#0f172a']} />
            <fog attach="fog" args={['#0f172a', 30, 60]} />

            {/* Lighting — simple, no texture overflow */}
            <ambientLight intensity={0.8} />
            <directionalLight
                castShadow
                position={[15, 25, 10]}
                intensity={1.2}
                shadow-mapSize={[1024, 1024]}
            />
            <hemisphereLight intensity={0.4} color="#fdf4ff" groundColor="#0f172a" />

            <Suspense fallback={null}>
                {/* Ground plane */}
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
                    <planeGeometry args={[60, 60]} />
                    <meshStandardMaterial color="#334155" roughness={0.6} metalness={0.1} />
                </mesh>

                {/* Design grid (visible only in design mode) */}
                {isDesignMode && (
                    <Grid
                        position={[0, 0.01, 0]}
                        args={[40, 40]}
                        cellSize={1}
                        cellThickness={0.5}
                        cellColor="#475569"
                        sectionSize={5}
                        sectionThickness={1}
                        sectionColor="#64748b"
                        fadeDistance={40}
                        infiniteGrid={false}
                    />
                )}

                <SceneObjects />
            </Suspense>

            <CameraController />
        </Canvas>
    );
}
