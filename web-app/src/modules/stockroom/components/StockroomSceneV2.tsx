import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import WarehouseEnvironment from './WarehouseEnvironment';
import ShelvingSystem from './ShelvingSystem';
import ProductsLayer from './ProductsLayer';
import StockroomCameraControls from './StockroomCameraControls';

export default function StockroomSceneV2() {
    return (
        <Canvas
            shadows
            camera={{ position: [0, 10, 25], fov: 45 }}
            gl={{ antialias: false, powerPreference: "high-performance" }}
        >
            <color attach="background" args={['#0f172a']} />
            <fog attach="fog" args={['#0f172a', 15, 60]} />

            <Suspense fallback={null}>
                {/* Lights, Floors, Walls, Atmosphere */}
                <WarehouseEnvironment />

                {/* The 6 Aisles x 6 Levels Rack System */}
                <ShelvingSystem />

                {/* Dynamic products mapped to bins */}
                <ProductsLayer />
            </Suspense>

            {/* Fly-to controls mapped to double-click and state changes */}
            <StockroomCameraControls />

            {/* Cinematic Post-Processing */}
            <EffectComposer disableNormalPass multisampling={0}>
                <Bloom
                    luminanceThreshold={1.5}
                    luminanceSmoothing={0.9}
                    intensity={0.8}
                />
            </EffectComposer>
        </Canvas>
    );
}
