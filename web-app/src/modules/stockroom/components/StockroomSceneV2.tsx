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
            <color attach="background" args={['#05080f']} />
            <fog attach="fog" args={['#05080f', 15, 60]} />

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
            <EffectComposer disableNormalPass multisampling={4}>
                <Bloom
                    luminanceThreshold={1.2}
                    luminanceSmoothing={0.9}
                    intensity={1.5}
                    mipmapBlur
                />
                <Vignette eskil={false} offset={0.1} darkness={1.1} />
                <Noise opacity={0.03} />
            </EffectComposer>
        </Canvas>
    );
}
