import React from 'react';
import { Environment, Sparkles, Text } from '@react-three/drei';

export default function WarehouseEnvironment() {
    const aisleNames = [
        { name: 'FLUIDS & CHEM', x: -15 },
        { name: 'IGNITION & ELEC', x: -9 },
        { name: 'FILTERS', x: -3 },
        { name: 'BODY & LIGHTS', x: 3 },
        { name: 'ENGINE PARTS', x: 9 },
        { name: 'SUSPENSION', x: 15 },
    ];

    return (
        <group>
            {/* Primary Ambient & Directional Lighting */}
            <ambientLight intensity={0.4} color="#ffffff" />
            <directionalLight
                castShadow
                position={[20, 30, 10]}
                intensity={1.5}
                color="#fff5e6"
                shadow-mapSize={[2048, 2048]}
            >
                <orthographicCamera attach="shadow-camera" args={[-30, 30, 30, -30, 0.1, 50]} />
            </directionalLight>

            {/* Concrete Floor with Industrial Finish */}
            <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                <planeGeometry args={[100, 100]} />
                <meshStandardMaterial
                    color="#11151c"
                    roughness={0.8}
                    metalness={0.2}
                />
                {/* Subtle grid lines over the floor */}
                <gridHelper args={[100, 100, '#1e293b', '#0f172a']} rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} />
            </mesh>

            {/* Ceiling hanging signs */}
            {aisleNames.map((aisle, i) => (
                <group key={i} position={[aisle.x, 9, 0]}>
                    {/* Sign Board */}
                    <mesh position={[0, 0, 0]} castShadow>
                        <boxGeometry args={[4, 1, 0.1]} />
                        <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.5} />
                    </mesh>
                    <Text
                        position={[0, 0, 0.06]}
                        fontSize={0.4}
                        color="#f97316"
                        outlineWidth={0.01}
                        outlineColor="#f97316"
                    >
                        {aisle.name}
                        <meshBasicMaterial color="#f97316" toneMapped={false} />
                    </Text>
                    {/* Spotlight pointing straight down */}
                    <spotLight
                        position={[0, -0.5, 0]}
                        angle={0.8}
                        penumbra={1}
                        intensity={5}
                        distance={15}
                        castShadow
                        color="#ffe0b2"
                    />
                </group>
            ))}

            {/* Atmospheric Dust Particles */}
            <Sparkles count={500} scale={40} size={2} speed={0.4} opacity={0.1} color="#f97316" />

            {/* Distant warehouse walls framing */}
            <mesh position={[0, 5, -20]} receiveShadow>
                <planeGeometry args={[100, 20]} />
                <meshStandardMaterial color="#0b1120" roughness={0.9} />
            </mesh>

            {/* Rim Lights from back */}
            <rectAreaLight width={50} height={10} intensity={2} color="#3b82f6" position={[0, 5, -19.5]} rotation={[0, 0, 0]} />

            {/* Basic HDRI reflection */}
            <Environment preset="city" environmentIntensity={0.2} />
        </group>
    );
}
