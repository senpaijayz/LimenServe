import React, { useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { usePartsMappingStore } from './usePartsMappingStore';
import {
    OBJECT_COMPONENTS,
    PathRenderer,
    PathWalker,
    HighlightMarker,
    CameraAnimator
} from './objects3d';

export default function Scene3D() {
    const {
        layout,
        editMode,
        currentFloor,
        selectedId,
        selectObject,
        updatePosition,
        viewMode,
        isDragging,
        setDragging,
        highlightedPart,
        pathPoints,
        setFloor
    } = usePartsMappingStore();

    const controlsRef = useRef<any>(null);

    // Ghost floor click handler
    const handleStairClick = () => {
        if (editMode) return;
        setFloor(currentFloor === 1 ? 2 : 1);
    };

    return (
        <>
            <color attach="background" args={['#dbeafe']} />
            <ambientLight intensity={0.95} />
            <hemisphereLight args={['#f8fafc', '#64748b', 0.85]} />
            <directionalLight position={[10, 25, 15]} intensity={1.15} castShadow />
            <directionalLight position={[-10, 20, -10]} intensity={0.55} />
            <pointLight position={[0, 15, 0]} intensity={0.35} distance={50} />

            {/* Current Floor Objects */}
            {layout.objects
                .filter(obj => obj.floor === currentFloor && !(currentFloor > 1 && obj.type === 'stairs'))
                .map(obj => {
                    const Component = OBJECT_COMPONENTS[obj.type];
                    if (!Component) return null;
                    return (
                        <Component
                            key={obj.id}
                            position={[obj.x, 0, obj.z]}
                            rotation={obj.rotation || 0}
                            label={(obj.type === 'shelf' || obj.type === 'shelf2') && obj.aisle && obj.shelfNum ? `${obj.aisle}-${obj.shelfNum}` : obj.label}
                            editMode={editMode}
                            selected={selectedId === obj.id}
                            locked={obj.locked}
                            onSelect={() => selectObject(obj.id)}
                            onPositionChange={(pos: [number, number, number]) => updatePosition(obj.id, pos[0], pos[2])}
                            isHighlighted={highlightedPart?.location_code === obj.label || highlightedPart?.location_code === `${obj.aisle}-${obj.shelfNum}`}
                            size={obj.size}
                            color={obj.color}
                            onDragStart={() => setDragging(true)}
                            onDragEnd={() => setDragging(false)}
                            onClick={obj.type === 'stairs' ? handleStairClick : undefined}
                        />
                    );
                })}

            {/* Ghost Floor (Previous Floor rendered underneath) */}
            {currentFloor > 1 && (
                <group position={[0, -3.15, 0]}>
                    {layout.objects
                        .filter(obj => obj.floor === currentFloor - 1)
                        .map(obj => {
                            const Component = OBJECT_COMPONENTS[obj.type];
                            if (!Component) return null;
                            return (
                                <Component
                                    key={`ghost-${obj.id}`}
                                    position={[obj.x, 0, obj.z]}
                                    rotation={obj.rotation || 0}
                                    label=""
                                    editMode={false}
                                    selected={false}
                                    size={obj.size}
                                    color={obj.color}
                                    onClick={obj.type === 'stairs' ? handleStairClick : undefined}
                                />
                            );
                        })}
                </group>
            )}

            {/* Camera & Controls */}
            <OrbitControls
                ref={controlsRef}
                enableRotate={viewMode === '3d' && !isDragging}
                enablePan={true}
                enableZoom={!isDragging}
                minDistance={2}
                maxDistance={80}
                maxPolarAngle={viewMode === '2d' ? 0.01 : Math.PI / 2.1}
            />
            <CameraAnimator target={highlightedPart} viewMode={viewMode} controlsRef={controlsRef} />

            {/* Pathfinding & Highlights */}
            <PathRenderer points={pathPoints} />
            <PathWalker pathPoints={pathPoints} />
            <HighlightMarker part={highlightedPart} />
        </>
    );
}
