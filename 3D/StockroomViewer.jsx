import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Text, Line, Html, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import useStore from './useStore';
import api from './api';
import SearchBar from './SearchBar';
import Toast from './Toast';
import {
    RotateCcw,
    Layers,
    Move,
    Save,
    RotateCw,
    Plus,
    Eye,
    Grid3X3,
    Type,
    Trash2,
    ChevronUp,
    ChevronDown,
    Target,
    X,
    ZoomIn,
    ZoomOut,
    Home,
    FolderOpen,
    Database,
    Check,
    Edit2,
    Star,
    Lock,
    Unlock
} from 'lucide-react';

// ==================== PATHFINDING UTILS ====================
const Pathfinder = {
    gridSize: 0.05, // Maximum precision (5cm)
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },

    // Convert world coord to grid coord
    toGrid: (val, min) => Math.floor((val - min) / Pathfinder.gridSize),
    // Convert grid coord to world coord (center of cell)
    toWorld: (val, min) => val * Pathfinder.gridSize + min + Pathfinder.gridSize / 2,

    createGrid: (objects, floor = 1) => {
        const { minX, minZ, maxX, maxZ } = Pathfinder.bounds;
        const width = Math.ceil((maxX - minX) / Pathfinder.gridSize);
        const height = Math.ceil((maxZ - minZ) / Pathfinder.gridSize);
        // Using Uint8Array for efficiency: 0=walkable, 1=blocked
        const grid = new Uint8Array(width * height).fill(0);

        objects.forEach(obj => {
            if (obj.floor !== floor && obj.type !== 'stairs') return; // Only collide with current floor objects (and stairs usually block or connect)
            // Skip small objects or markers? keep simple for now. 
            // Assume we walk on current floor. 
            // Treat obstacles: shelves, walls, rooms.
            // Ignored: sensors, cameras if any.

            // ONLY process known solid obstacles
            const solidTypes = ['wall', 'shelf', 'shelf2', 'counter', 'stairs', 'column', 'table'];
            if (!solidTypes.includes(obj.type)) return;

            // Get dimensions
            let w = 1, d = 1;
            if (obj.size) { w = obj.size[0]; d = obj.size[2]; }
            else if (obj.type === 'shelf') { w = 3; d = 1; } // Approx defaults
            else if (obj.type === 'shelf2') { w = 1.5; d = 0.8; }
            else if (obj.type === 'entrance') { return; } // Entrances are walkable!
            else if (obj.type === 'counter') { w = 2; d = 1; }
            else if (obj.type === 'table') { w = 2.5; d = 1.2; }

            // Handle Rotation (Swap W/D if near 90 or 270 deg)
            const rotation = obj.rotation || 0;
            // Normalize to 0-PI approx
            const rot = Math.abs(rotation % Math.PI);
            const isRotated90 = Math.abs(rot - Math.PI / 2) < 0.6; // Wider tolerance

            let gridW = isRotated90 ? d : w;
            let gridD = isRotated90 ? w : d;

            // Add safe padding 
            const padding = 0.05; // 5cm padding
            gridW += padding;
            gridD += padding;

            const startX = Pathfinder.toGrid(obj.x - gridW / 2, minX);
            const endX = Pathfinder.toGrid(obj.x + gridW / 2, minX);
            const startZ = Pathfinder.toGrid(obj.z - gridD / 2, minZ);
            const endZ = Pathfinder.toGrid(obj.z + gridD / 2, minZ);

            // Mark grid
            for (let i = startZ; i < endZ; i++) {
                for (let j = startX; j < endX; j++) {
                    if (i >= 0 && i < height && j >= 0 && j < width) {
                        grid[i * width + j] = 1;
                    }
                }
            }
        });

        return { grid, width, height };
    },

    findPath: (startPos, endPos, objects, floor = 1) => {
        const { minX, minZ } = Pathfinder.bounds;
        const { grid, width, height } = Pathfinder.createGrid(objects, floor);


        const startNode = Pathfinder.findNearestWalkable(startPos, grid, width, height, minX, minZ);
        const endNode = Pathfinder.findNearestWalkable(endPos, grid, width, height, minX, minZ);

        // Ensure start/end are within bounds
        if (startNode.x < 0 || startNode.x >= width || startNode.z < 0 || startNode.z >= height) return [startPos, endPos];
        if (endNode.x < 0 || endNode.x >= width || endNode.z < 0 || endNode.z >= height) return [startPos, endPos];

        // A* Algorithm
        const openSet = [];
        const closedSet = new Set();
        const cameFrom = new Map();
        const gScore = new Map();
        const fScore = new Map();

        const nodeKey = (n) => `${n.x},${n.z}`;

        openSet.push(startNode);
        gScore.set(nodeKey(startNode), 0);
        fScore.set(nodeKey(startNode), Math.abs(startNode.x - endNode.x) + Math.abs(startNode.z - endNode.z));

        // Neighbors: Up, Down, Left, Right, Diagonals
        const neighbors = [
            { x: 0, z: 1, cost: 1 }, { x: 0, z: -1, cost: 1 },
            { x: 1, z: 0, cost: 1 }, { x: -1, z: 0, cost: 1 },
            { x: 1, z: 1, cost: 1.414 }, { x: 1, z: -1, cost: 1.414 },
            { x: -1, z: 1, cost: 1.414 }, { x: -1, z: -1, cost: 1.414 }
        ];

        let loopCount = 0;
        while (openSet.length > 0) {
            loopCount++;
            if (loopCount > 5000) {
                console.warn("A* Search timeout (exceeded 5000 iterations). Aborting.");
                break;
            }

            // Get node with lowest fScore
            openSet.sort((a, b) => (fScore.get(nodeKey(a)) ?? Infinity) - (fScore.get(nodeKey(b)) ?? Infinity));
            const current = openSet.shift();
            const currentKey = nodeKey(current);

            // DEBUG LOOP
            if (loopCount <= 5) {
                console.log(`L${loopCount} Current: ${current.x},${current.z} G:${gScore.get(currentKey)} GridW:${width}`);
            }

            // Reached goal? 
            if (Math.abs(current.x - endNode.x) <= 1 && Math.abs(current.z - endNode.z) <= 1) {
                // Reconstruct path
                const path = [];
                let currKey = currentKey;
                while (cameFrom.has(currKey)) {
                    const coords = currKey.split(',').map(Number);
                    path.unshift(new THREE.Vector3(
                        Pathfinder.toWorld(coords[0], minX),
                        startPos.y, // Maintain height
                        Pathfinder.toWorld(coords[1], minZ)
                    ));
                    currKey = cameFrom.get(currKey);
                }
                path.unshift(startPos);
                path.push(endPos);
                return path;
            }

            if (closedSet.has(currentKey)) continue;
            closedSet.add(currentKey);

            if (loopCount <= 2) console.log(`checking neighbors for ${current.x},${current.z}`);

            for (const neighborOffset of neighbors) {
                const neighbor = { x: current.x + neighborOffset.x, z: current.z + neighborOffset.z };
                const neighborKey = nodeKey(neighbor);

                if (neighbor.x < 0 || neighbor.x >= width || neighbor.z < 0 || neighbor.z >= height) {
                    if (loopCount <= 2) console.log(`  REJECT Bounds: ${neighbor.x},${neighbor.z} (W:${width} H:${height})`);
                    continue;
                }
                if (grid[neighbor.z * width + neighbor.x] === 1) {
                    if (loopCount <= 2) console.log(`  REJECT Blocked: ${neighbor.x},${neighbor.z}`);
                    continue; // Blocked
                }
                if (closedSet.has(neighborKey)) {
                    // if(loopCount <= 2) console.log(`  REJECT Closed: ${neighbor.x},${neighbor.z}`);
                    continue;
                }

                const tentativeG = (gScore.get(currentKey) ?? Infinity) + neighborOffset.cost;

                if (tentativeG < (gScore.get(neighborKey) ?? Infinity)) {
                    cameFrom.set(neighborKey, currentKey);
                    gScore.set(neighborKey, tentativeG);
                    fScore.set(neighborKey, tentativeG + (Math.abs(neighbor.x - endNode.x) + Math.abs(neighbor.z - endNode.z)));

                    openSet.push(neighbor);
                }
            }
        }

        console.warn("A* failed: OpenSet empty. Generating Curved Fallback.");

        // Bezier Curve Fallback (Start -> Control -> End) to avoid straight line clipping
        // Push control point away from center (0,0) or towards open aisles
        const midX = (startPos.x + endPos.x) / 2;
        const midZ = (startPos.z + endPos.z) / 2;

        // Simple heuristic: push perpendicular to path vector
        const dirX = endPos.x - startPos.x;
        const dirZ = endPos.z - startPos.z;

        // Perpendicular vector (-dy, dx)
        let perpX = -dirZ;
        let perpZ = dirX;

        // Normalize
        const len = Math.sqrt(perpX * perpX + perpZ * perpZ) || 1;
        perpX /= len;
        perpZ /= len;

        // Push out by 5 meters (clearance)
        const curveStrength = 5;
        const controlX = midX + perpX * curveStrength;
        const controlZ = midZ + perpZ * curveStrength;

        const path = [];
        const segments = 20;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const invT = 1 - t;
            // Quadratic Bezier: B(t) = (1-t)^2 * P0 + 2(1-t)t * P1 + t^2 * P2
            const x = (invT * invT * startPos.x) + (2 * invT * t * controlX) + (t * t * endPos.x);
            const z = (invT * invT * startPos.z) + (2 * invT * t * controlZ) + (t * t * endPos.z);
            path.push(new THREE.Vector3(x, startPos.y, z));
        }
        return path;
    },

    // Helper to find closest walkable grid node if target is blocked
    findNearestWalkable: (targetPos, grid, width, height, minX, minZ) => {
        const targetNode = {
            x: Pathfinder.toGrid(targetPos.x, minX),
            z: Pathfinder.toGrid(targetPos.z, minZ)
        };

        if (targetNode.x >= 0 && targetNode.x < width && targetNode.z >= 0 && targetNode.z < height) {
            if (grid[targetNode.z * width + targetNode.x] === 0) return targetNode;
        }

        // Spiral search (Increased radius to escape large objects like counters)
        const maxRadius = 100; // 5 meters at 0.05 resolution
        for (let r = 1; r <= maxRadius; r++) {
            for (let dx = -r; dx <= r; dx++) {
                for (let dz = -r; dz <= r; dz++) {
                    if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
                    const nx = targetNode.x + dx;
                    const nz = targetNode.z + dz;

                    if (nx >= 0 && nx < width && nz >= 0 && nz < height) {
                        if (grid[nz * width + nx] === 0) {
                            // verify not isolated (must have at least one open neighbor)
                            let hasOpenNeighbor = false;
                            for (let doc = -1; doc <= 1; doc++) {
                                for (let dor = -1; dor <= 1; dor++) {
                                    if (doc === 0 && dor === 0) continue;
                                    const cnx = nx + doc;
                                    const cnz = nz + dor;
                                    if (cnx >= 0 && cnx < width && cnz >= 0 && cnz < height) {
                                        if (grid[cnz * width + cnx] === 0) {
                                            hasOpenNeighbor = true;
                                            break;
                                        }
                                    }
                                }
                                if (hasOpenNeighbor) break;
                            }

                            if (hasOpenNeighbor) return { x: nx, z: nz };
                        }
                    }
                }
            }
        }
        console.warn("Could not find walkable neighbor for", targetPos);
        return targetNode;
    }
};

// ==================== PATH RENDERER (FOOTPRINTS) ====================
const PathRenderer = ({ points }) => {
    if (!points || points.length < 2) return null;

    // Filter points to space them out for footsteps (every ~0.6 units)
    // Filter points to space them out for footsteps (every ~0.6 units)
    const footsteps = useMemo(() => {
        const steps = [];
        let distSinceLast = 0;
        const stepSize = 0.6; // Stride length

        if (!points || points.length < 2) return [];

        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            const segmentDist = p1.distanceTo(p2);

            let distCovered = 0;

            // While we can fit another step in the remaining distance + accumulator
            while (distSinceLast + (segmentDist - distCovered) >= stepSize) {
                const requiredDist = stepSize - distSinceLast;
                const distFromP1 = distCovered + requiredDist;
                const t = distFromP1 / segmentDist;

                const pos = new THREE.Vector3().lerpVectors(p1, p2, t);
                const angle = Math.atan2(p2.x - p1.x, p2.z - p1.z);
                steps.push({ pos, angle });

                distSinceLast = 0;
                distCovered += requiredDist;
            }

            distSinceLast += (segmentDist - distCovered);
        }

        // Always add final point if not close enough
        if (steps.length === 0 || steps[steps.length - 1].pos.distanceTo(points[points.length - 1]) > stepSize) {
            steps.push({ pos: points[points.length - 1], angle: 0 });
        }

        return steps;
    }, [points]);

    return (
        <group>
            {footsteps.map((step, i) => (
                <group key={i} position={[step.pos.x, 0.12, step.pos.z]} rotation={[-Math.PI / 2, 0, step.angle]}>
                    {/* Footprint shape (simple ellipses) */}
                    <mesh position={[0.1, 0, 0]}>
                        <circleGeometry args={[0.15, 16]} />
                        <meshBasicMaterial color="#22d3ee" opacity={0.9} transparent />
                    </mesh>
                    <mesh position={[-0.1, 0.15, 0]}>
                        <circleGeometry args={[0.15, 16]} />
                        <meshBasicMaterial color="#22d3ee" opacity={0.9} transparent />
                    </mesh>
                </group>
            ))}
            {/* Fallback line for clarity */}
            <Line points={points} color="#22d3ee" lineWidth={1} dashed opacity={0.3} transparent />
        </group>
    );
};

// ==================== GRID DEBUGGER ====================
const GridDebugger = ({ objects, floor }) => {
    // ... existing debugger code ... (Disabled by default)
    return null;
};

// ==================== PATH WALKER ====================
const PathWalker = ({ pathPoints }) => {
    const meshRef = useRef();
    const [currentIndex, setCurrentIndex] = useState(0);
    const speed = 0.15; // Movement speed

    useFrame(() => {
        if (!meshRef.current || !pathPoints || pathPoints.length < 2) return;

        const targetPoint = pathPoints[currentIndex + 1];
        if (!targetPoint) {
            // Reached end, reset to start
            setCurrentIndex(0);
            meshRef.current.position.copy(pathPoints[0]);
            return;
        }

        const currentPos = meshRef.current.position;
        const direction = new THREE.Vector3().subVectors(targetPoint, currentPos).normalize();
        const distance = currentPos.distanceTo(targetPoint);

        if (distance < speed) {
            // Reached point, move to next
            meshRef.current.position.copy(targetPoint);
            setCurrentIndex(prev => prev + 1);
        } else {
            // Move towards point
            meshRef.current.position.add(direction.multiplyScalar(speed));
            // Rotate to face direction
            meshRef.current.lookAt(targetPoint);
        }
    });

    if (!pathPoints || pathPoints.length === 0) return null;

    return (
        <mesh ref={meshRef} position={pathPoints[0]}>
            <sphereGeometry args={[0.3, 16, 16]} />
            <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={1} />
            <pointLight distance={3} intensity={1} color="#fbbf24" />
        </mesh>
    );
};

// ==================== DRAGGABLE WRAPPER ====================
const DraggableObject = ({ children, position, rotation = 0, onPositionChange, onRotationChange, editMode, name, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const groupRef = useRef();
    const [isDragging, setIsDragging] = useState(false);
    const [hovered, setHovered] = useState(false);
    const { camera, gl } = useThree();
    const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const intersectionPoint = useRef(new THREE.Vector3());
    const offset = useRef(new THREE.Vector3());

    const handlePointerDown = useCallback((e) => {
        if (!editMode) return;

        e.stopPropagation();
        onSelect && onSelect();

        if (locked) return;

        setIsDragging(true);
        onDragStart && onDragStart();
        gl.domElement.style.cursor = 'grabbing';

        const rect = gl.domElement.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
            new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            ),
            camera
        );
        raycaster.ray.intersectPlane(planeRef.current, intersectionPoint.current);
        offset.current.copy(intersectionPoint.current).sub(new THREE.Vector3(position[0], 0, position[2]));
    }, [editMode, camera, gl, position, onSelect, locked]);

    const handlePointerMove = useCallback((e) => {
        if (!isDragging || !editMode) return;

        const rect = gl.domElement.getBoundingClientRect();
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
            new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1
            ),
            camera
        );
        raycaster.ray.intersectPlane(planeRef.current, intersectionPoint.current);

        const newX = Math.round((intersectionPoint.current.x - offset.current.x) * 2) / 2;
        const newZ = Math.round((intersectionPoint.current.z - offset.current.z) * 2) / 2;

        onPositionChange([newX, position[1], newZ]);
    }, [isDragging, editMode, camera, gl, position, onPositionChange]);

    const handlePointerUp = useCallback(() => {
        setIsDragging(false);
        onDragEnd && onDragEnd();
        gl.domElement.style.cursor = editMode ? 'grab' : 'auto';
    }, [editMode, gl, onDragEnd]);

    useEffect(() => {
        if (editMode) {
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', handlePointerUp);
            return () => {
                window.removeEventListener('pointermove', handlePointerMove);
                window.removeEventListener('pointerup', handlePointerUp);
            };
        }
    }, [editMode, handlePointerMove, handlePointerUp]);

    return (
        <group
            ref={groupRef}
            position={position}
            rotation={[0, rotation, 0]}
            onPointerDown={handlePointerDown}
            onPointerOver={() => editMode && setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
            {children}
            {editMode && (hovered || selected) && (
                <Html position={[0, 4, 0]} center>
                    <div style={{
                        background: selected ? 'rgba(34, 197, 94, 0.95)' : 'rgba(59, 130, 246, 0.9)',
                        color: 'white',
                        padding: '6px 12px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6
                    }}>
                        {locked && <Lock size={12} />}
                        {name}
                    </div>
                </Html>
            )}
            {editMode && (
                <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.6, 0.8, 32]} />
                    <meshBasicMaterial
                        color={selected ? '#22c55e' : isDragging ? '#f59e0b' : hovered ? '#3b82f6' : '#6b7280'}
                        transparent
                        opacity={0.6}
                    />
                </mesh>
            )}
        </group>
    );
};

// ==================== 3D OBJECTS ====================

// Shelf with 4 layers
const Shelf4Layer = ({ position, rotation = 0, label, isHighlighted, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const shelfColor = isHighlighted ? '#DC2626' : '#64748b';

    const content = (
        <group>
            {[[-0.9, 0, -0.4], [0.9, 0, -0.4], [-0.9, 0, 0.4], [0.9, 0, 0.4]].map((pos, i) => (
                <mesh key={i} position={[pos[0], 1.6, pos[2]]}>
                    <boxGeometry args={[0.08, 3.2, 0.08]} />
                    <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.1} />
                </mesh>
            ))}
            {[0.4, 1.1, 1.8, 2.5].map((h, binNum) => (
                <group key={binNum}>
                    {/* Shelf surface */}
                    <mesh position={[0, h, 0]}>
                        <boxGeometry args={[1.8, 0.08, 0.9]} />
                        <meshStandardMaterial color={shelfColor} emissive={isHighlighted ? '#DC2626' : '#000'} emissiveIntensity={isHighlighted ? 0.3 : 0} />
                    </mesh>
                    {/* Bin label on each layer */}
                    <Text
                        position={[0.7, h + 0.15, 0]}
                        fontSize={0.12}
                        color="#22c55e"
                        anchorX="center"
                        outlineWidth={0.01}
                        outlineColor="#000"
                    >
                        BIN {binNum + 1}
                    </Text>
                </group>
            ))}
            {/* Location code label at top - larger and more prominent */}
            <Text
                position={[0, 3.3, 0]}
                fontSize={0.25}
                color="#fbbf24"
                anchorX="center"
                fontWeight="bold"
                outlineWidth={0.02}
                outlineColor="#000"
            >
                {label || 'SHELF'}
            </Text>
            {/* Subtitle hint */}
            <Text
                position={[0, 3.0, 0]}
                fontSize={0.1}
                color="#94a3b8"
                anchorX="center"
            >
                4-LAYER
            </Text>
            {isHighlighted && <pointLight position={[0, 1.5, 0]} color="#DC2626" intensity={2} distance={3} />}
        </group>
    );

    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Shelf with 2 layers (cabinet-style with enclosed sides)
const Shelf2Layer = ({ position, rotation = 0, label, isHighlighted, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, size, locked }) => {
    const shelfColor = isHighlighted ? '#DC2626' : '#64748b';
    const frameColor = '#94a3b8';

    // Default size: [width, height, depth] - can be customized
    const [width, height, depth] = size || [1.5, 1.2, 0.8];
    const halfW = width / 2;
    const halfD = depth / 2;

    const content = (
        <group>
            {/* Base */}
            <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[width, 0.1, depth]} />
                <meshStandardMaterial color={frameColor} />
            </mesh>

            {/* Top */}
            <mesh position={[0, height - 0.05, 0]}>
                <boxGeometry args={[width, 0.1, depth]} />
                <meshStandardMaterial color={frameColor} />
            </mesh>

            {/* Left side panel */}
            <mesh position={[-halfW + 0.025, height / 2, 0]}>
                <boxGeometry args={[0.05, height, depth]} />
                <meshStandardMaterial color={shelfColor} />
            </mesh>

            {/* Right side panel */}
            <mesh position={[halfW - 0.025, height / 2, 0]}>
                <boxGeometry args={[0.05, height, depth]} />
                <meshStandardMaterial color={shelfColor} />
            </mesh>

            {/* Back panel */}
            <mesh position={[0, height / 2, -halfD + 0.025]}>
                <boxGeometry args={[width, height, 0.05]} />
                <meshStandardMaterial color={shelfColor} />
            </mesh>

            {/* Middle shelf */}
            <mesh position={[0, height / 2, 0]}>
                <boxGeometry args={[width - 0.1, 0.06, depth - 0.05]} />
                <meshStandardMaterial color={frameColor} />
            </mesh>



            {/* Bin labels for top and bottom levels */}
            <Text
                position={[-0.35, 0.2, 0.3]}
                fontSize={0.1}
                color="#22c55e"
                anchorX="center"
                outlineWidth={0.008}
                outlineColor="#000"
            >
                BIN 1
            </Text>
            <Text
                position={[-0.35, height / 2 + 0.15, 0.3]}
                fontSize={0.1}
                color="#22c55e"
                anchorX="center"
                outlineWidth={0.008}
                outlineColor="#000"
            >
                BIN 2
            </Text>

            {/* Location code label at top */}
            <Text
                position={[0, height + 0.2, 0]}
                fontSize={0.2}
                color="#fbbf24"
                anchorX="center"
                fontWeight="bold"
                outlineWidth={0.015}
                outlineColor="#000"
            >
                {label || 'SHELF'}
            </Text>
            {/* Subtitle */}
            <Text
                position={[0, height - 0.05, 0]}
                fontSize={0.08}
                color="#94a3b8"
                anchorX="center"
            >
                2-LAYER
            </Text>

            {isHighlighted && <pointLight position={[0, height / 2, 0]} color="#DC2626" intensity={1.5} distance={2} />}
        </group>
    );

    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Display Table
const DisplayTable = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.4, 0]}>
                <boxGeometry args={[2, 0.08, 1]} />
                <meshStandardMaterial color="#8b5cf6" />
            </mesh>
            {[[-0.8, 0, -0.4], [0.8, 0, -0.4], [-0.8, 0, 0.4], [0.8, 0, 0.4]].map((p, i) => (
                <mesh key={i} position={[p[0], 0.2, p[2]]}>
                    <cylinderGeometry args={[0.05, 0.05, 0.4]} />
                    <meshStandardMaterial color="#64748b" />
                </mesh>
            ))}
            <Text position={[0, 0.6, 0]} fontSize={0.15} color="#fff" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Display Stand
const DisplayStand = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.75, 0]}>
                <boxGeometry args={[0.8, 1.5, 0.3]} />
                <meshStandardMaterial color="#f59e0b" />
            </mesh>
            <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[1, 0.1, 0.5]} />
                <meshStandardMaterial color="#374151" />
            </mesh>
            <Text position={[0, 1.6, 0]} fontSize={0.12} color="#fff" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Signage
const Signage = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 2, 0]}>
                <boxGeometry args={[2, 0.8, 0.1]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.2} />
            </mesh>
            <mesh position={[0, 1, 0]}>
                <cylinderGeometry args={[0.05, 0.05, 2]} />
                <meshStandardMaterial color="#64748b" />
            </mesh>
            <Text position={[0, 2, 0.1]} fontSize={0.2} color="#fff" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Counter
const Counter = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.5, 0]}>
                <boxGeometry args={[3, 1, 1]} />
                <meshStandardMaterial color="#374151" />
            </mesh>
            <mesh position={[0, 1.05, 0]}>
                <boxGeometry args={[3.2, 0.1, 1.2]} />
                <meshStandardMaterial color="#1f2937" />
            </mesh>
            <mesh position={[0, 0.5, 0.51]}>
                <boxGeometry args={[3, 0.8, 0.02]} />
                <meshStandardMaterial color="#dc2626" emissive="#dc2626" emissiveIntensity={0.2} />
            </mesh>
            <Text position={[0, 1.5, 0]} fontSize={0.18} color="#dc2626" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// L-Shaped Stairs with Landing
const Stairs = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, onClick, locked }) => {
    const [hovered, setHovered] = useState(false);

    useEffect(() => {
        if (hovered && !editMode) document.body.style.cursor = 'pointer';
        else document.body.style.cursor = 'auto';
        return () => { document.body.style.cursor = 'auto'; };
    }, [hovered, editMode]);

    const handleClick = (e) => {
        if (editMode) return;
        e.stopPropagation();
        onClick && onClick();
    };
    const stepColor = '#d4a574'; // Wood/tan color like the reference
    const stepEdge = '#c4956a';

    const content = (
        <group>
            {/* First flight - bottom section (5 steps going up along Z) */}
            {Array.from({ length: 5 }, (_, i) => (
                <group key={`lower-${i}`}>
                    {/* Step tread */}
                    <mesh position={[0, i * 0.3 + 0.15, i * 0.4]}>
                        <boxGeometry args={[2, 0.2, 0.4]} />
                        <meshStandardMaterial color={stepColor} />
                    </mesh>
                    {/* Step front (riser) */}
                    <mesh position={[0, i * 0.3, i * 0.4 - 0.15]}>
                        <boxGeometry args={[2, 0.3, 0.1]} />
                        <meshStandardMaterial color={stepEdge} />
                    </mesh>
                </group>
            ))}

            {/* Landing platform (where stairs turn 90 degrees) */}
            <mesh position={[0, 1.65, 2.2]}>
                <boxGeometry args={[2.5, 0.2, 2]} />
                <meshStandardMaterial color={stepColor} />
            </mesh>

            {/* Second flight - upper section (5 steps going up along X, turned 90 degrees) */}
            {Array.from({ length: 5 }, (_, i) => (
                <group key={`upper-${i}`}>
                    {/* Step tread */}
                    <mesh position={[-i * 0.4 - 0.3, 1.95 + i * 0.3, 2.7]}>
                        <boxGeometry args={[0.4, 0.2, 1.5]} />
                        <meshStandardMaterial color={stepColor} />
                    </mesh>
                    {/* Step riser */}
                    <mesh position={[-i * 0.4 - 0.1, 1.8 + i * 0.3, 2.7]}>
                        <boxGeometry args={[0.1, 0.3, 1.5]} />
                        <meshStandardMaterial color={stepEdge} />
                    </mesh>
                </group>
            ))}

            {/* Handrails - outer rail for lower flight */}
            <mesh position={[1, 1.2, 1]}>
                <boxGeometry args={[0.06, 1.5, 2.5]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>
            {/* Handrails - inner rail for lower flight */}
            <mesh position={[-1, 1.2, 1]}>
                <boxGeometry args={[0.06, 1.5, 2.5]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>

            {/* Handrails for upper flight */}
            <mesh position={[-1.5, 2.8, 2]}>
                <boxGeometry args={[2, 0.06, 0.06]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>
            <mesh position={[-1.5, 2.8, 3.4]}>
                <boxGeometry args={[2, 0.06, 0.06]} />
                <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.3} />
            </mesh>

            {label && <Text position={[0, 4, 1.5]} fontSize={0.25} color="#fff" anchorX="center">{label}</Text>}
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : (
        <group
            position={position}
            rotation={[0, rotation, 0]}
            onClick={handleClick}
            onPointerOver={() => !editMode && setHovered(true)}
            onPointerOut={() => setHovered(false)}
        >
            {content}
        </group>
    );
};

// Room (Comfort Room, Office, etc.)
const Room = ({ position, rotation = 0, label, color = '#374151', editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 1.5, 0]}>
                <boxGeometry args={[2.5, 3, 2.5]} />
                <meshStandardMaterial color={color} transparent opacity={0.85} />
            </mesh>
            <mesh position={[0, 1, 1.26]}>
                <boxGeometry args={[0.8, 2, 0.05]} />
                <meshStandardMaterial color="#1f2937" />
            </mesh>
            <Text position={[0, 3.2, 0]} fontSize={0.18} color="#fff" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Entrance
const Entrance = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const leftDoorRef = useRef();
    const rightDoorRef = useRef();

    useFrame((state) => {
        const open = Math.sin(state.clock.elapsedTime * 0.5) > 0.5;
        if (leftDoorRef.current) leftDoorRef.current.rotation.y = THREE.MathUtils.lerp(leftDoorRef.current.rotation.y, open ? -Math.PI / 3 : 0, 0.05);
        if (rightDoorRef.current) rightDoorRef.current.rotation.y = THREE.MathUtils.lerp(rightDoorRef.current.rotation.y, open ? Math.PI / 3 : 0, 0.05);
    });

    const content = (
        <group>
            <mesh position={[0, 1.5, 0]}><boxGeometry args={[3.5, 3, 0.2]} /><meshStandardMaterial color="#1f2937" /></mesh>
            <mesh position={[0, 1.3, 0]}><boxGeometry args={[2.5, 2.6, 0.3]} /><meshStandardMaterial color="#0f172a" /></mesh>
            <group ref={leftDoorRef} position={[-0.6, 1.3, 0.1]}>
                <mesh position={[-0.5, 0, 0]}><boxGeometry args={[1, 2.5, 0.08]} /><meshStandardMaterial color="#475569" /></mesh>
            </group>
            <group ref={rightDoorRef} position={[0.6, 1.3, 0.1]}>
                <mesh position={[0.5, 0, 0]}><boxGeometry args={[1, 2.5, 0.08]} /><meshStandardMaterial color="#475569" /></mesh>
            </group>
            <mesh position={[0, 0.02, 1]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[2, 1]} /><meshStandardMaterial color="#dc2626" /></mesh>
            <Text position={[0, 3.3, 0]} fontSize={0.25} color="#10b981" anchorX="center">{label}</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Parking - smaller, open front for vehicle access
const Parking = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            {/* Parking floor - smaller */}
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><planeGeometry args={[6, 8]} /><meshStandardMaterial color="#2d3748" /></mesh>
            {/* Parking lines */}
            {[0, 1, 2].map(i => (
                <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2.5 + i * 2.5]}><planeGeometry args={[5, 0.08]} /><meshStandardMaterial color="#f0f0f0" /></mesh>
            ))}
            {/* Left wall */}
            <mesh position={[-3, 1.5, 0]}><boxGeometry args={[0.3, 3, 8]} /><meshStandardMaterial color="#1e293b" /></mesh>
            {/* Back wall - connects to store */}
            <mesh position={[0, 1.5, -4]}><boxGeometry args={[6, 3, 0.3]} /><meshStandardMaterial color="#1e293b" /></mesh>
            {/* Labels */}
            <Text position={[0, 0.1, 2.5]} fontSize={0.4} color="#fff" rotation={[-Math.PI / 2, 0, 0]}>{label}</Text>
            <Text position={[0, 0.1, 0]} fontSize={0.25} color="#9ca3af" rotation={[-Math.PI / 2, 0, 0]}>P1</Text>
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Wall - height matches entrance (3 units) positioned correctly
const Wall = ({ position, rotation = 0, size = [10, 3, 0.3], label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            {/* Position wall so bottom is at ground level */}
            <mesh position={[0, size[1] / 2, 0]}><boxGeometry args={size} /><meshStandardMaterial color="#1e293b" /></mesh>
            {editMode && <Text position={[0, size[1] + 0.3, 0]} fontSize={0.2} color="#fff" anchorX="center">{label}</Text>}
        </group>
    );
    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={label} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Custom Label
const CustomLabel = ({ position, rotation = 0, label, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, locked }) => {
    const content = (
        <group>
            <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[3, 0.6]} /><meshStandardMaterial color="#3b82f6" transparent opacity={0.7} /></mesh>
            <Text position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.3} color="#fff" anchorX="center">{label}</Text>
        </group>
    );

    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={`Label: ${label}`} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// Floor - dynamic object with resizing
const Floor = ({ position = [0, -0.01, 0], rotation = 0, floor = 1, editMode, onPositionChange, onRotationChange, selected, onSelect, onDragStart, onDragEnd, isVisible = true, size = [10, 0.2, 10], color, locked }) => {
    // If not visible or filtered out by parent, return null
    if (!isVisible) return null;

    const content = (
        <group>
            {/* Floor Surface - Resizable Box */}
            {/* Shift down so top face is at y = -0.01 to sit below footprints/decals */}
            <mesh position={[0, -size[1] / 2 - 0.01, 0]}>
                <boxGeometry args={size} />
                <meshStandardMaterial color={color || (floor === 1 ? '#5a6577' : '#4a5568')} />
            </mesh>

            {/* Grid Lines - scaled to floor size */}
            {editMode && (
                <gridHelper args={[Math.max(size[0], size[2]), Math.max(size[0], size[2]), '#000000', '#000000']} position={[0, size[1] + 0.01, 0]} material-opacity={0.1} material-transparent />
            )}
        </group>
    );

    return editMode ? (
        <DraggableObject position={position} rotation={rotation} onPositionChange={onPositionChange} onRotationChange={onRotationChange} editMode={editMode} name={`Floor ${floor}`} selected={selected} onSelect={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} locked={locked}>
            {content}
        </DraggableObject>
    ) : <group position={position} rotation={[0, rotation, 0]}>{content}</group>;
};

// ==================== OBJECT TYPES ====================
const OBJECT_TYPES = {
    shelf: { component: Shelf4Layer, label: '4-Layer Shelf', icon: '📦' },
    shelf2: { component: Shelf2Layer, label: '2-Layer Shelf', icon: '📦' },
    table: { component: DisplayTable, label: 'Display Table', icon: '🪑' },
    stand: { component: DisplayStand, label: 'Display Stand', icon: '🎪' },
    signage: { component: Signage, label: 'Signage', icon: '🪧' },
    counter: { component: Counter, label: 'Counter', icon: '💳' },
    stairs: { component: Stairs, label: 'Stairs', icon: '🪜' },
    room: { component: Room, label: 'Room', icon: '🚪' },
    entrance: { component: Entrance, label: 'Entrance', icon: '🚶' },
    parking: { component: Parking, label: 'Parking', icon: '🅿️' },
    wall: { component: Wall, label: 'Wall', icon: '🧱' },
    label: { component: CustomLabel, label: 'Label', icon: '🏷️' },
    floor: { component: Floor, label: 'Floor', icon: 'mn' },
};

// ==================== CAMERA ANIMATOR ====================
const CameraAnimator = ({ highlightedPart, viewMode, controlsRef }) => {
    const { camera } = useThree();
    const animatingRef = useRef(false);
    const startPosRef = useRef(null);
    const startTargetRef = useRef(null);
    const startTimeRef = useRef(null);

    useEffect(() => {
        if (!highlightedPart || !highlightedPart.position) return;

        // Calculate target camera position (closer view)
        const targetPos = new THREE.Vector3(
            highlightedPart.position.x + 3,
            viewMode === '2d' ? 15 : highlightedPart.position.y + 2,
            highlightedPart.position.z + 3
        );

        const animate = () => {
            if (!animatingRef.current) {
                // Start animation
                animatingRef.current = true;
                startPosRef.current = camera.position.clone();
                if (controlsRef?.current) {
                    startTargetRef.current = controlsRef.current.target.clone();
                }
                startTimeRef.current = Date.now();
                requestAnimationFrame(animate);
                return;
            }

            const elapsed = Date.now() - startTimeRef.current;
            const duration = 1500; // 1.5 seconds (slightly faster)
            const progress = Math.min(elapsed / duration, 1);

            // Ease in-out cubic function
            const eased = progress < 0.5
                ? 4 * progress * progress * progress
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Interpolate camera position
            camera.position.lerpVectors(startPosRef.current, targetPos, eased);

            // Interpolate controls target (look at the part)
            if (controlsRef?.current && startTargetRef.current) {
                const targetLookAt = new THREE.Vector3(
                    highlightedPart.position.x,
                    highlightedPart.position.y,
                    highlightedPart.position.z
                );
                controlsRef.current.target.lerpVectors(startTargetRef.current, targetLookAt, eased);
                controlsRef.current.update();
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                animatingRef.current = false;
            }
        };

        animate();

        return () => {
            animatingRef.current = false;
        };
    }, [highlightedPart, camera, viewMode, controlsRef]);

    return null;
};

// ==================== HIGHLIGHT MARKER ====================
const HighlightMarker = ({ highlightedPart }) => {
    const meshRef = useRef();

    useFrame((state) => {
        if (meshRef.current) {
            // Pulse animation
            const pulse = Math.sin(state.clock.elapsedTime * 2) * 0.3 + 0.7;
            meshRef.current.material.emissiveIntensity = pulse;
            meshRef.current.scale.setScalar(0.8 + pulse * 0.2);
        }
    });

    if (!highlightedPart || !highlightedPart.position) return null;

    return (
        <group position={[highlightedPart.position.x, highlightedPart.position.y, highlightedPart.position.z]}>
            {/* Glowing sphere marker */}
            <mesh ref={meshRef}>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshStandardMaterial
                    color="#22c55e"
                    emissive="#22c55e"
                    emissiveIntensity={1}
                    transparent
                    opacity={0.8}
                />
            </mesh>

            {/* Info label */}
            <Html position={[0, 1, 0]} center>
                <div style={{
                    background: 'rgba(34, 197, 94, 0.95)',
                    color: 'white',
                    padding: '8px 12px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    pointerEvents: 'none'
                }}>
                    📍 {highlightedPart.description}
                    <div style={{ fontSize: 10, opacity: 0.9, marginTop: 2 }}>
                        {highlightedPart.location_code} • Stock: {highlightedPart.stock}
                    </div>
                </div>
            </Html>
        </group>
    );
};

// ==================== MAIN SCENE ====================
const StockroomScene = ({ objects, editMode, currentFloor, selectedId, onSelect, onPositionChange, onRotationChange, viewMode, highlightedLocation, isDragging, onDragStart, onDragEnd, onStairClick }) => {
    return (
        <>
            <ambientLight intensity={0.9} />
            <directionalLight position={[10, 25, 15]} intensity={1.3} castShadow />
            <directionalLight position={[-10, 20, -10]} intensity={0.5} />
            <pointLight position={[0, 15, 0]} intensity={1} distance={50} />

            {/* Only render the current floor objects, but HIDE stairs on upper floors (using ghost stairs below instead) */}

            {/* Only render the current floor objects, but HIDE stairs on upper floors (using ghost stairs below instead) */}
            {objects.filter(obj => obj.floor === currentFloor && !(currentFloor > 1 && obj.type === 'stairs')).map(obj => {
                const ObjComponent = OBJECT_TYPES[obj.type]?.component;
                if (!ObjComponent) return null;

                return (
                    <ObjComponent
                        key={obj.id}
                        position={[obj.x, 0, obj.z]}
                        rotation={obj.rotation || 0}
                        label={
                            (obj.type === 'shelf' || obj.type === 'shelf2') && obj.aisle && obj.shelfNum
                                ? `${obj.aisle}-${obj.shelfNum}`
                                : obj.label
                        }
                        editMode={editMode}
                        selected={selectedId === obj.id}
                        onSelect={() => onSelect(obj.id)}
                        onPositionChange={(pos) => onPositionChange(obj.id, pos)}
                        onRotationChange={(rot) => onRotationChange(obj.id, rot)}
                        isHighlighted={highlightedLocation?.code === obj.label}
                        size={obj.size}
                        color={obj.color}
                        onDragStart={onDragStart}
                        onDragEnd={onDragEnd}
                        onClick={obj.type === 'stairs' ? onStairClick : undefined}
                        locked={obj.locked}
                    />
                );
            })}

            {/* Context: Render previous floor below */}
            {currentFloor > 1 && (
                // Align ghost floor so stairs connect (Height ~3.15m)
                <group position={[0, -3.15, 0]}>
                    {/* Floor is now an object, so the filter below catches it */}
                    {objects.filter(obj => obj.floor === currentFloor - 1).map(obj => {
                        const ObjComponent = OBJECT_TYPES[obj.type]?.component;
                        if (!ObjComponent) return null;
                        return (
                            <ObjComponent
                                key={`ghost-${obj.id}`}
                                position={[obj.x, 0, obj.z]}
                                rotation={obj.rotation || 0}
                                label=""
                                editMode={false}
                                selected={false}
                                onSelect={() => { }}
                                size={obj.size}
                                color={obj.color}
                                // Ghost floor stairs are also clickable to go down/up
                                onClick={obj.type === 'stairs' ? onStairClick : undefined}
                            />
                        );
                    })}
                </group>
            )}
        </>
    );
};

// ==================== DEFAULT LAYOUT ====================
// User's store layout - matching their physical store design
const getDefaultLayout = () => ({
    objects: [
        // Floors (Modular)
        // Floor 1: Main base
        { id: 'floor-1-main', type: 'floor', x: 0, z: 0, rotation: 0, floor: 1, label: 'Main Floor', size: [24, 0.2, 24] },

        // Floor 2: Constructed from blocks to leave gap for stairs (at -6, -6)
        // Block 1: Right side (covering most)
        { id: 'floor-2-right', type: 'floor', x: 3, z: 0, rotation: 0, floor: 2, label: 'Upper Floor Main', size: [18, 0.2, 24] },
        // Block 2: Bottom Left (L-shape extension)
        { id: 'floor-2-left', type: 'floor', x: -9, z: 3, rotation: 0, floor: 2, label: 'Upper Floor Side', size: [6, 0.2, 18] },
        // 1st Floor - L-Shaped Stairs (top left corner)
        { id: 'stairs-1', type: 'stairs', x: -6, z: -6, rotation: 0, floor: 1, label: 'Stairs' },
        // 1st Floor - CR/Room next to stairs
        { id: 'room-cr', type: 'room', x: -3, z: -6, rotation: 0, floor: 1, label: 'CR' },
        // 1st Floor - Parking (left side, below main building)
        { id: 'parking-1', type: 'parking', x: -6, z: 4, rotation: 0, floor: 1, label: 'Parking' },
        // 1st Floor - System signage (right side)
        { id: 'signage-system', type: 'signage', x: 6, z: 0, rotation: 0, floor: 1, label: 'System' },
        // 1st Floor - Cashier/Counter (center-right)
        { id: 'counter-1', type: 'counter', x: 5, z: 4, rotation: 0, floor: 1, label: 'Cashier' },
        // 1st Floor - Entrance (bottom, two doors)
        { id: 'entrance-1', type: 'entrance', x: 2, z: 8, rotation: 0, floor: 1, label: 'Entrance' },
        { id: 'entrance-2', type: 'entrance', x: 5, z: 8, rotation: 0, floor: 1, label: 'Entrance 2' },
        // 1st Floor - Walls (store boundary)
        { id: 'wall-1-back', type: 'wall', x: 0, z: -9, rotation: 0, floor: 1, label: 'Back Wall', size: [18, 3, 0.3] },
        { id: 'wall-1-left', type: 'wall', x: -9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Left Wall', size: [16, 3, 0.3] },
        { id: 'wall-1-right', type: 'wall', x: 9, z: -1, rotation: Math.PI / 2, floor: 1, label: 'Right Wall', size: [16, 3, 0.3] },
        { id: 'wall-1-front-r', type: 'wall', x: 6, z: 7, rotation: 0, floor: 1, label: 'Front Wall R', size: [6, 3, 0.3] },
        // 2nd Floor - Same size and alignment
        { id: 'stairs-2', type: 'stairs', x: -6, z: -6, rotation: Math.PI, floor: 2, label: 'Stairs Down' },
        { id: 'room-2-storage', type: 'room', x: -3, z: -6, rotation: 0, floor: 2, label: 'Storage' },
        // 2nd Floor - Walls (same size as 1st floor)
        { id: 'wall-2-back', type: 'wall', x: 0, z: -9, rotation: 0, floor: 2, label: 'Back Wall', size: [18, 3, 0.3] },
        { id: 'wall-2-left', type: 'wall', x: -9, z: -1, rotation: Math.PI / 2, floor: 2, label: 'Left Wall', size: [16, 3, 0.3] },
        { id: 'wall-2-right', type: 'wall', x: 9, z: -1, rotation: Math.PI / 2, floor: 2, label: 'Right Wall', size: [16, 3, 0.3] },
        { id: 'wall-2-front', type: 'wall', x: 0, z: 7, rotation: 0, floor: 2, label: 'Front Wall', size: [18, 3, 0.3] },

        // ==================== DEFAULT SHELVES (AISLES A-D) ====================
        // Aisle A (Left)
        { id: 'shelf-a1', type: 'shelf', x: -5, z: -4, rotation: 0, floor: 1, label: 'A-1', aisle: 'A', shelfNum: 1 },
        { id: 'shelf-a2', type: 'shelf', x: -5, z: -1, rotation: 0, floor: 1, label: 'A-2', aisle: 'A', shelfNum: 2 },
        { id: 'shelf-a3', type: 'shelf', x: -5, z: 2, rotation: 0, floor: 1, label: 'A-3', aisle: 'A', shelfNum: 3 },

        // Aisle B (Center-Left)
        { id: 'shelf-b1', type: 'shelf', x: -1, z: -4, rotation: 0, floor: 1, label: 'B-1', aisle: 'B', shelfNum: 1 },
        { id: 'shelf-b2', type: 'shelf', x: -1, z: -1, rotation: 0, floor: 1, label: 'B-2', aisle: 'B', shelfNum: 2 },
        { id: 'shelf-b3', type: 'shelf', x: -1, z: 2, rotation: 0, floor: 1, label: 'B-3', aisle: 'B', shelfNum: 3 },

        // Aisle C (Center-Right)
        { id: 'shelf-c1', type: 'shelf', x: 3, z: -4, rotation: 0, floor: 1, label: 'C-1', aisle: 'C', shelfNum: 1 },
        { id: 'shelf-c2', type: 'shelf', x: 3, z: -1, rotation: 0, floor: 1, label: 'C-2', aisle: 'C', shelfNum: 2 },
        { id: 'shelf-c3', type: 'shelf', x: 3, z: 2, rotation: 0, floor: 1, label: 'C-3', aisle: 'C', shelfNum: 3 },
    ]
});

// ==================== MAIN COMPONENT ====================
const StockroomViewer = () => {
    const { selectedItem, highlightedLocation, clearSelection } = useStore();
    const controlsRef = useRef();

    // ==================== STATE DEFINITIONS ====================
    // Layout State
    const [layout, setLayout] = useState(() => {
        const saved = localStorage.getItem('stockroomLayoutV2');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Sanity check: If layout is empty or has very few objects, revert to default
                if (parsed.objects && parsed.objects.length > 5) {
                    return parsed;
                }
            } catch (e) {
                console.error('Failed to parse saved layout:', e);
            }
        }
        return getDefaultLayout();
    });

    // View & Edit State
    const [editMode, setEditMode] = useState(false);
    const [viewMode, setViewMode] = useState('3d'); // '3d' or '2d'
    const [currentFloor, setCurrentFloor] = useState(1);
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [labelInput, setLabelInput] = useState('');

    // Search & Highlight State
    const [highlightedPart, setHighlightedPart] = useState(null);
    const cameraRef = useRef(null);

    // Path State
    const [pathPoints, setPathPoints] = useState([]);
    const [pathStart, setPathStart] = useState(null);
    const [pathEnd, setPathEnd] = useState(null);
    const multiFloorPaths = useRef({}); // Store paths by floor: { 1: [], 2: [] }

    // Layout Management State
    const [savedLayouts, setSavedLayouts] = useState([]);
    const [currentLayoutId, setCurrentLayoutId] = useState(null);
    const [currentLayoutName, setCurrentLayoutName] = useState('Loading...');
    const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [showSaveAsModal, setShowSaveAsModal] = useState(false);
    const [layoutSaving, setLayoutSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const layoutMenuRef = useRef(null);


    // Effect: Handle selectedItem from Inventory Dashboard
    useEffect(() => {
        if (selectedItem && layout?.objects) {
            handlePartSearch(selectedItem);
        } else if (!selectedItem) {
            // Cleanup path when selection is cleared (e.g. via X button)
            setHighlightedPart(null);
            setPathPoints([]);
            setPathStart(null);
            setPathEnd(null);
        }
    }, [selectedItem, layout]);

    useEffect(() => {
        if (!highlightedPart || !layout) {
            setPathStart(null);
            setPathEnd(null);
            setPathPoints([]);
            multiFloorPaths.current = {};
            return;
        }

        const startFloor = 1; // Always start from cashier/entrance on Floor 1
        const endFloor = highlightedPart.floor || 1;

        // Reset paths
        multiFloorPaths.current = {};

        // Helper to calc path on a specific floor
        const calcPath = (pStart, pEnd, pFloor) => {
            let pStr = Pathfinder.findPath(pStart, pEnd, layout.objects || [], pFloor);
            // Fallback for blocked path
            if (pStr.length <= 2) {
                // Try from main entrance if on floor 1
                if (pFloor === 1) {
                    const entranceObj = layout.objects?.find(obj => obj.type === 'entrance' && obj.floor === 1);
                    if (entranceObj) {
                        const entPos = new THREE.Vector3(entranceObj.x, 0.5, entranceObj.z);
                        pStr = Pathfinder.findPath(entPos, pEnd, layout.objects || [], pFloor);
                    }
                }
            }
            return pStr;
        };

        if (startFloor === endFloor) {
            // SINGLE FLOOR NAVIGATION
            const startObj = layout.objects?.find(obj => (obj.type === 'counter' || obj.type === 'entrance') && obj.floor === startFloor);
            const start = startObj ? new THREE.Vector3(startObj.x, 0.5, startObj.z) : new THREE.Vector3(0, 0.5, 0);
            const end = new THREE.Vector3(highlightedPart.position.x, 0.5, highlightedPart.position.z);

            const path = calcPath(start, end, startFloor);
            multiFloorPaths.current[startFloor] = path;

            setPathStart(start);
            setPathEnd(end);
            setPathPoints(path);
        } else {
            // MULTI FLOOR NAVIGATION (Start -> Stairs -> Stairs -> End)
            console.log(`Multi-floor path: ${startFloor} -> ${endFloor}`);

            // 1. Find Stairs on Start Floor
            const stairs1 = layout.objects?.find(obj => obj.type === 'stairs' && obj.floor === startFloor);
            // 2. Find Stairs on End Floor
            const stairs2 = layout.objects?.find(obj => obj.type === 'stairs' && obj.floor === endFloor);

            if (stairs1 && stairs2) {
                // Path 1: Start -> Stairs1
                const startObj = layout.objects?.find(obj => (obj.type === 'counter' || obj.type === 'entrance') && obj.floor === startFloor);
                const start = startObj ? new THREE.Vector3(startObj.x, 0.5, startObj.z) : new THREE.Vector3(0, 0.5, 0);
                const stairsPos1 = new THREE.Vector3(stairs1.x, 0.5, stairs1.z);

                const path1 = calcPath(start, stairsPos1, startFloor);
                multiFloorPaths.current[startFloor] = path1;

                // Path 2: Stairs2 (Top Landing) -> End
                // Offset to match the top of the stairs (approx x-2, z+3.5 relative to center)
                const stairsPos2 = new THREE.Vector3(stairs2.x - 2.0, 0.5, stairs2.z + 3.5);
                const end = new THREE.Vector3(highlightedPart.position.x, 0.5, highlightedPart.position.z);

                const path2 = calcPath(stairsPos2, end, endFloor);
                multiFloorPaths.current[endFloor] = path2;
            }
        }

        // Update view for current floor immediately
        setPathPoints(multiFloorPaths.current[currentFloor] || []);

    }, [highlightedPart, layout]);

    // Update path when floor changes
    useEffect(() => {
        if (multiFloorPaths.current[currentFloor]) {
            setPathPoints(multiFloorPaths.current[currentFloor]);
        } else {
            setPathPoints([]);
        }
    }, [currentFloor]);



    // Close layout menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (layoutMenuRef.current && !layoutMenuRef.current.contains(e.target)) {
                setLayoutMenuOpen(false);
            }
        };
        if (layoutMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [layoutMenuOpen]);

    // Load saved layouts from backend and auto-load last used or default
    useEffect(() => {
        const loadLayouts = async () => {
            try {
                // Get all layouts from backend
                const layouts = await api.getLayouts();
                setSavedLayouts(layouts || []);
                console.log('Loaded layouts from backend:', layouts?.length || 0);

                // Check for last used layout ID in localStorage
                const lastUsedLayoutId = localStorage.getItem('lastUsedLayoutId');
                console.log('Last used layout ID:', lastUsedLayoutId);

                let layoutToLoad = null;

                // Try to find and load the last used layout
                if (lastUsedLayoutId && layouts) {
                    layoutToLoad = layouts.find(l => l.id === parseInt(lastUsedLayoutId));
                    if (layoutToLoad) {
                        console.log('Found last used layout:', layoutToLoad.name);
                    }
                }

                // If no last used, try to load default layout
                if (!layoutToLoad) {
                    const defaultLayout = await api.getDefaultLayout();
                    if (defaultLayout && defaultLayout.layout_data) {
                        layoutToLoad = defaultLayout;
                        console.log('Using default layout:', defaultLayout.name);
                    }
                }

                // Load the selected layout
                if (layoutToLoad && layoutToLoad.layout_data) {
                    const parsedLayout = JSON.parse(layoutToLoad.layout_data);
                    setLayout(parsedLayout);
                    setCurrentLayoutId(layoutToLoad.id);
                    setCurrentLayoutName(layoutToLoad.name);
                    localStorage.setItem('stockroomLayoutV2', layoutToLoad.layout_data);
                    localStorage.setItem('lastUsedLayoutId', layoutToLoad.id.toString());
                    console.log('Auto-loaded layout:', layoutToLoad.name);
                } else {
                    setCurrentLayoutName('Default');
                }
            } catch (err) {
                console.log('Backend not available, using local storage:', err.message);
                setCurrentLayoutName('Local');
            }
        };
        loadLayouts();
    }, []);

    // Smooth floor transition
    const handleFloorChange = (floor) => {
        if (floor === currentFloor || isTransitioning) return;
        setIsTransitioning(true);
        setTimeout(() => {
            setCurrentFloor(floor);
            setTimeout(() => setIsTransitioning(false), 300);
        }, 300);
    };
    const handlePositionChange = useCallback((id, pos) => {
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === id ? { ...obj, x: pos[0], z: pos[2] } : obj)
        }));
    }, []);

    const handleRotationChange = useCallback((id, rot) => {
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === id ? { ...obj, rotation: rot } : obj)
        }));
    }, []);

    const rotateSelected = (delta) => {
        if (!selectedId) return;
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, rotation: (obj.rotation || 0) + delta } : obj)
        }));
    };

    const deleteSelected = () => {
        if (!selectedId) return;
        setLayout(prev => ({ ...prev, objects: prev.objects.filter(obj => obj.id !== selectedId) }));
        setSelectedId(null);
    };

    const updateSelectedLabel = () => {
        if (!selectedId || !labelInput.trim()) return;
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, label: labelInput.trim() } : obj)
        }));
    };

    const toggleLock = () => {
        if (!selectedId) return;
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, locked: !obj.locked } : obj)
        }));
    };

    const updateObjectSize = (dimension, value) => {
        if (!selectedId || !selectedObj) return;
        if (selectedObj.type !== 'wall' && selectedObj.type !== 'shelf2' && selectedObj.type !== 'floor') return;

        const numValue = parseFloat(value) || 1;
        const defaultSize = selectedObj.type === 'wall' ? [10, 3, 0.3] : selectedObj.type === 'floor' ? [10, 0.2, 10] : [1.5, 1.2, 0.8];
        const currentSize = selectedObj.size || defaultSize;
        const newSize = [...currentSize];
        if (dimension === 'width') newSize[0] = numValue;
        else if (dimension === 'height') newSize[1] = numValue;
        else if (dimension === 'depth') newSize[2] = numValue;
        setLayout(prev => ({
            ...prev,
            objects: prev.objects.map(obj => obj.id === selectedId ? { ...obj, size: newSize } : obj)
        }));
    };

    const addObject = (type) => {
        const newId = `${type}-${Date.now()}`;
        const newObj = {
            id: newId,
            type,
            x: 0,
            z: 0,
            rotation: 0,
            floor: currentFloor,
            label: `New ${OBJECT_TYPES[type].label}`,
            size: type === 'wall' ? [10, 3, 0.3] : type === 'shelf2' ? [1.5, 1.2, 0.8] : type === 'floor' ? [10, 0.2, 10] : undefined
        };
        setLayout(prev => ({ ...prev, objects: [...prev.objects, newObj] }));
        setSelectedId(newId);
        setAddMenuOpen(false);
    };

    const saveLayout = async () => {
        setLayoutSaving(true);
        try {
            // Also save to localStorage as backup
            localStorage.setItem('stockroomLayoutV2', JSON.stringify(layout));

            if (currentLayoutId) {
                // Update existing layout
                console.log('Saving to layout ID:', currentLayoutId);
                await api.updateLayout(currentLayoutId, { layoutData: layout });

                // Update the saved layouts list with new data
                setSavedLayouts(prev => prev.map(l =>
                    l.id === currentLayoutId
                        ? { ...l, layout_data: JSON.stringify(layout) }
                        : l
                ));

                setToast({ message: `Layout "${currentLayoutName}" saved successfully!`, type: 'success' });
            } else {
                // No current layout, prompt to save as new
                setShowSaveAsModal(true);
            }
        } catch (err) {
            console.error('Save error:', err);
            setToast({ message: 'Saved locally. Backend error: ' + err.message, type: 'warning' });
        }
        setLayoutSaving(false);
    };

    const saveLayoutAs = async (name) => {
        if (!name.trim()) return;
        setLayoutSaving(true);
        try {
            const result = await api.createLayout({
                name: name.trim(),
                description: `Created on ${new Date().toLocaleDateString()}`,
                layoutData: layout,
                isDefault: savedLayouts.length === 0
            });

            // Update state
            setCurrentLayoutId(result.id);
            setCurrentLayoutName(result.name);
            setSavedLayouts(prev => [...prev, result]);
            setShowSaveAsModal(false);
            setSaveAsName('');
            setToast({ message: `Layout "${name}" created successfully!`, type: 'success' });
        } catch (err) {
            console.error('Save As error:', err);
            setToast({ message: 'Failed to save layout: ' + err.message, type: 'error' });
        }
        setLayoutSaving(false);
    };

    const loadLayout = async (layoutToLoad) => {
        try {
            console.log('Loading layout:', layoutToLoad.name, 'ID:', layoutToLoad.id);
            const parsedLayout = JSON.parse(layoutToLoad.layout_data);
            setLayout(parsedLayout);
            setCurrentLayoutId(layoutToLoad.id);
            setCurrentLayoutName(layoutToLoad.name);
            setLayoutMenuOpen(false);
            setSelectedId(null);
            localStorage.setItem('stockroomLayoutV2', layoutToLoad.layout_data);
            localStorage.setItem('lastUsedLayoutId', layoutToLoad.id.toString());
            console.log('Layout loaded. CurrentLayoutId is now:', layoutToLoad.id);
            setToast({ message: `Loaded "${layoutToLoad.name}"`, type: 'success' });
        } catch (err) {
            console.error('Load error:', err);
            setToast({ message: 'Failed to load layout: ' + err.message, type: 'error' });
        }
    };

    const deleteLayoutFromDB = async (id) => {
        try {
            console.log('Deleting layout ID:', id);
            await api.deleteLayout(id);
            setSavedLayouts(prev => prev.filter(l => l.id !== id));
            setDeleteConfirmId(null);

            if (currentLayoutId === id) {
                setCurrentLayoutId(null);
                setCurrentLayoutName('Unsaved');
                localStorage.removeItem('lastUsedLayoutId');
            }
        } catch (err) {
            console.error('Delete error:', err);
            setToast({ message: 'Failed to delete: ' + err.message, type: 'error' });
        }
    };

    const submitRename = async (id, newName) => {
        if (!newName || newName.trim() === '') return;

        try {
            await api.updateLayout(id, { name: newName.trim() });
            setSavedLayouts(prev => prev.map(l =>
                l.id === id ? { ...l, name: newName.trim() } : l
            ));

            setRenamingId(null);

            if (currentLayoutId === id) {
                setCurrentLayoutName(newName.trim());
            }
        } catch (err) {
            console.error('Rename API error:', err);
            setToast({ message: 'Failed to rename: ' + err.message, type: 'error' });
        }
    };

    const setPriorityLayout = async (id) => {
        try {
            await api.setDefaultLayout(id);
            setSavedLayouts(prev => prev.map(l => ({
                ...l,
                is_default: l.id === id

            })));
            const layout = savedLayouts.find(l => l.id === id);
            setToast({ message: `"${layout?.name}" is now the priority layout`, type: 'success' });
        } catch (err) {
            setToast({ message: 'Failed to set priority: ' + err.message, type: 'error' });
        }
    };

    const resetLayout = () => {
        const def = getDefaultLayout();
        setLayout(def);
        localStorage.setItem('stockroomLayoutV2', JSON.stringify(def));
        setSelectedId(null);
        setCurrentLayoutId(null);
        setCurrentLayoutName('Default');
    };

    const handleStairClick = () => {
        if (editMode) return;
        setIsTransitioning(true);
        setTimeout(() => {
            setCurrentFloor(prev => prev === 1 ? 2 : 1);
            setIsTransitioning(false);
        }, 300);
    };

    const exportLayout = () => {
        const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stockroom-layout.json';
        a.click();
    };

    const handlePartSearch = (part) => {
        try {
            console.log('Part selected from search:', part);

            // Safety check for layout
            if (!layout?.objects) {
                console.warn('Layout not loaded yet');
                return;
            }

            // Extract location from nested object or top level
            if (!part) return;
            const location = part.location || part;
            const { aisle, shelf, bin } = location || {};

            // Calculate shelf position from part location
            if (!aisle || !shelf) {
                console.warn('Part has no location assigned');
                return;
            }

            // Find the actual shelf object in the layout with this location code
            const targetLocationCode = `${aisle}-${shelf}`;
            const targetShelf = layout.objects.find(obj =>
                (obj.type === 'shelf' || obj.type === 'shelf2') &&
                obj.aisle === aisle &&
                obj.shelfNum === shelf
            );

            if (!targetShelf) {
                console.warn(`Shelf ${targetLocationCode} not found in layout. Using fallback coordinates.`);
                // Fallback: Calculate approximate position based on Aisle letter and Shelf number
                // Aisle A starts at x: -5, increment by 4 per aisle
                // Shelf 1 starts at z: -4, increment by 3 per shelf
                // Shelf 1 starts at z: -4, increment by 3 per shelf
                const aisleIndex = ['A', 'B', 'C', 'D', 'E', 'F'].indexOf(aisle);
                const safeShelf = parseInt(shelf) || 1;
                const fallbackX = -5 + (aisleIndex >= 0 ? aisleIndex * 4 : 0);
                const fallbackZ = -4 + (safeShelf - 1) * 3;

                setHighlightedPart({
                    ...part,
                    position: { x: fallbackX, y: 1.5, z: fallbackZ },
                    floor: 1, // Default to Floor 1 for inferred locations
                    isVirtual: true // Flag to indicate inferred location
                });
                return;
            }

            // Use the actual shelf's position
            const x = targetShelf.x;
            const z = targetShelf.z;

            // Bin determines Y height (0.4 is first bin for 4-layer, 0.2 for 2-layer)
            const binHeights = targetShelf.type === 'shelf' ? [0.4, 1.1, 1.8, 2.5] : [0.25, 0.7];
            const safeBin = parseInt(bin) || 1;
            const binHeight = binHeights[Math.min(safeBin - 1, binHeights.length - 1)] || 0.5;
            const y = (targetShelf.y || 0) + binHeight;

            // Set highlighted part with calculated position
            setHighlightedPart({
                ...part,
                position: { x, y, z },
                floor: targetShelf.floor
            });

            // Switch to correct floor if needed
            if (targetShelf.floor && targetShelf.floor !== currentFloor) {
                setCurrentFloor(targetShelf.floor);
            }
        } catch (err) {
            console.error('CRITICAL ERROR in handlePartSearch:', err);
            // Non-blocking fallback
            setHighlightedPart(null);
        }

        // Camera will fly to this position in the CameraAnimator component
    };

    const importLayout = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                setLayout(data);
                alert('✅ Layout imported!');
            } catch { alert('❌ Invalid file'); }
        };
        reader.readAsText(file);
    };

    const selectedObj = layout.objects.find(o => o.id === selectedId);

    useEffect(() => {
        if (selectedObj) setLabelInput(selectedObj.label);
    }, [selectedObj]);

    return (
        <div className="stockroom-viewer animate-fade-in">
            {/* Header */}
            <header className="page-header">

                {/* Toast Notification */}
                {toast && (
                    <Toast
                        message={toast.message}
                        type={toast.type}
                        onClose={() => setToast(null)}
                    />
                )}
                <div className="flex justify-between items-center flex-wrap gap-4">
                    <div>
                        <h1 className="page-title">
                            <span className="text-gradient">{currentFloor === 1 ? '1st' : '2nd'} Floor</span> - Parts Mapping
                            {editMode && <span style={{ color: '#22c55e', marginLeft: 10 }}>✏️ DESIGN</span>}
                        </h1>
                        <p className="page-subtitle">{editMode ? 'Drag to move, use controls to edit' : 'Interactive 3D map - Find parts instantly'}</p>
                        {/* Search Bar */}
                        <div style={{ marginTop: 12 }}>
                            <SearchBar onPartSelect={handlePartSearch} disabled={editMode} />
                        </div>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                        {/* Floor Toggle */}
                        <div className="btn-group" style={{ display: 'flex', gap: 0 }}>
                            <button
                                className={`btn ${currentFloor === 1 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => handleFloorChange(1)}
                                style={{ borderRadius: '8px 0 0 8px' }}
                                disabled={isTransitioning}
                            >
                                <ChevronDown size={16} /> Floor 1
                            </button>
                            <button
                                className={`btn ${currentFloor === 2 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => handleFloorChange(2)}
                                style={{ borderRadius: '0 8px 8px 0' }}
                                disabled={isTransitioning}
                            >
                                <ChevronUp size={16} /> Floor 2
                            </button>
                        </div>
                        {/* View Toggle */}
                        <button className={`btn ${viewMode === '2d' ? 'btn-secondary' : 'btn-outline'}`} onClick={() => setViewMode(v => v === '3d' ? '2d' : '3d')}>
                            {viewMode === '2d' ? <Eye size={18} /> : <Grid3X3 size={18} />}
                            {viewMode === '2d' ? '3D View' : '2D View'}
                        </button>
                        {/* Design Mode */}
                        <button className={`btn ${editMode ? 'btn-primary' : 'btn-outline'}`} onClick={() => setEditMode(!editMode)}>
                            <Move size={18} /> {editMode ? 'Exit Design' : 'Design Mode'}
                        </button>
                    </div>
                </div>
            </header>

            {/* Toast Notification */}
            {toast && (
                <Toast
                    message={toast.message}
                    type={toast.type}
                    onClose={() => setToast(null)}
                />
            )}

            {/* Design Toolbar */}
            {editMode && (
                <div className="card" style={{ marginBottom: 16, padding: 12, position: 'relative', zIndex: 1000 }}>
                    <div className="flex gap-2 flex-wrap items-center">
                        {/* Add Object */}
                        <div style={{ position: 'relative', zIndex: 1001 }}>
                            <button className="btn btn-secondary" onClick={() => setAddMenuOpen(!addMenuOpen)}>
                                <Plus size={18} /> Add Object
                            </button>
                            {addMenuOpen && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: 0,
                                    zIndex: 9999,
                                    background: '#1e293b',
                                    borderRadius: 8,
                                    padding: 8,
                                    marginTop: 4,
                                    minWidth: 200,
                                    maxHeight: 400,
                                    overflowY: 'auto',
                                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                    border: '1px solid #374151'
                                }}>
                                    {Object.entries(OBJECT_TYPES).map(([key, val]) => (
                                        <button key={key} onClick={() => addObject(key)} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 12px', background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', borderRadius: 4, fontSize: 14 }}
                                            onMouseOver={e => e.currentTarget.style.background = '#374151'}
                                            onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                                            <span style={{ fontSize: 18 }}>{val.icon}</span> {val.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div style={{ width: 1, height: 24, background: '#475569', margin: '0 8px' }} />

                        {/* Selected Object Controls */}
                        {selectedObj ? (
                            <>
                                <span style={{ color: '#94a3b8', fontSize: 14 }}>Selected: <strong style={{ color: '#fff' }}>{selectedObj.label}</strong></span>
                                <button className="btn btn-outline btn-sm" onClick={() => rotateSelected(-Math.PI / 4)}><RotateCcw size={16} /></button>
                                <button className="btn btn-outline btn-sm" onClick={() => rotateSelected(Math.PI / 4)}><RotateCw size={16} /></button>
                                <button
                                    className={`btn btn-sm ${selectedObj.locked ? 'btn-primary' : 'btn-outline'}`}
                                    onClick={toggleLock}
                                    title={selectedObj.locked ? "Unlock Object" : "Lock Object"}
                                >
                                    {selectedObj.locked ? <Lock size={16} /> : <Unlock size={16} />}
                                </button>
                                <input
                                    type="text"
                                    value={labelInput}
                                    onChange={e => setLabelInput(e.target.value)}
                                    placeholder="Label"
                                    style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 120 }}
                                />
                                <button className="btn btn-outline btn-sm" onClick={updateSelectedLabel}><Type size={16} /></button>

                                {/* Wall Size Controls */}
                                {selectedObj?.type === 'wall' && (
                                    <>
                                        <div style={{ width: 1, height: 24, background: '#475569', margin: '0 4px' }} />
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Size:</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>W</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[0] || 10}
                                                onChange={e => updateObjectSize('width', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="1"
                                                min="1"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>H</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[1] || 3}
                                                onChange={e => updateObjectSize('height', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="0.5"
                                                min="1"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>D</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[2] || 0.3}
                                                onChange={e => updateObjectSize('depth', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="0.1"
                                                min="0.1"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* 2-Layer Shelf Size Controls */}
                                {selectedObj?.type === 'shelf2' && (
                                    <>
                                        <div style={{ width: 1, height: 24, background: '#475569', margin: '0 4px' }} />
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Size:</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>W</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[0] || 1.5}
                                                onChange={e => updateObjectSize('width', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="0.1"
                                                min="0.5"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>H</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[1] || 1.2}
                                                onChange={e => updateObjectSize('height', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="0.1"
                                                min="0.5"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>D</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[2] || 0.8}
                                                onChange={e => updateObjectSize('depth', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="0.1"
                                                min="0.3"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Floor Size Controls */}
                                {selectedObj?.type === 'floor' && (
                                    <>
                                        <div style={{ width: 1, height: 24, background: '#475569', margin: '0 4px' }} />
                                        <span style={{ color: '#9ca3af', fontSize: 12 }}>Size:</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>W</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[0] || 10}
                                                onChange={e => updateObjectSize('width', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="1"
                                                min="1"
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>D</span>
                                            <input
                                                type="number"
                                                value={selectedObj.size?.[2] || 10}
                                                onChange={e => updateObjectSize('depth', e.target.value)}
                                                style={{ padding: '4px 6px', borderRadius: 4, border: '1px solid #475569', background: '#0f172a', color: '#fff', width: 50, fontSize: 12 }}
                                                step="1"
                                                min="1"
                                            />
                                        </div>
                                    </>
                                )}

                                {/* Location Code for Shelves */}
                                {(selectedObj?.type === 'shelf' || selectedObj?.type === 'shelf2') && (
                                    <>
                                        <div style={{ width: 1, height: 24, background: '#475569', margin: '0 8px' }} />
                                        <span style={{ color: '#fbbf24', fontSize: 12, fontWeight: 600 }}>Location:</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>Aisle</span>
                                            <input
                                                type="text"
                                                value={selectedObj.aisle || ''}
                                                onChange={e => {
                                                    const updated = layout.objects.map(o =>
                                                        o.id === selectedObj.id ? { ...o, aisle: e.target.value.toUpperCase() } : o
                                                    );
                                                    setLayout({ ...layout, objects: updated });
                                                }}
                                                placeholder="A"
                                                maxLength={1}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 4,
                                                    border: '1px solid #fbbf24',
                                                    background: '#0f172a',
                                                    color: '#fbbf24',
                                                    width: 40,
                                                    fontSize: 14,
                                                    fontWeight: 600,
                                                    textAlign: 'center',
                                                    textTransform: 'uppercase'
                                                }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span style={{ color: '#64748b', fontSize: 11 }}>Shelf</span>
                                            <input
                                                type="number"
                                                value={selectedObj.shelfNum || ''}
                                                onChange={e => {
                                                    const updated = layout.objects.map(o =>
                                                        o.id === selectedObj.id ? { ...o, shelfNum: parseInt(e.target.value) || '' } : o
                                                    );
                                                    setLayout({ ...layout, objects: updated });
                                                }}
                                                placeholder="1"
                                                min={1}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: 4,
                                                    border: '1px solid #fbbf24',
                                                    background: '#0f172a',
                                                    color: '#fbbf24',
                                                    width: 50,
                                                    fontSize: 14,
                                                    fontWeight: 600,
                                                    textAlign: 'center'
                                                }}
                                            />
                                        </div>
                                        {selectedObj.aisle && selectedObj.shelfNum && (
                                            <div style={{
                                                padding: '4px 8px',
                                                background: 'rgba(251, 191, 36, 0.1)',
                                                border: '1px solid #fbbf24',
                                                borderRadius: 4,
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: '#fbbf24',
                                                fontFamily: 'monospace'
                                            }}>
                                                {selectedObj.aisle}-{selectedObj.shelfNum}
                                            </div>
                                        )}
                                    </>
                                )}

                                <button className="btn btn-outline btn-sm" style={{ color: '#ef4444' }} onClick={deleteSelected}><Trash2 size={16} /></button>
                            </>
                        ) : (
                            <span style={{ color: '#64748b', fontSize: 14 }}>Click an object to select it</span>
                        )}

                        <div style={{ flex: 1 }} />

                        {/* Current Layout Name */}
                        <span style={{ color: '#94a3b8', fontSize: 13, marginRight: 8 }}>
                            <Database size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                            {currentLayoutName}
                        </span>

                        {/* Load Layouts Dropdown */}
                        <div ref={layoutMenuRef} style={{ position: 'relative' }}>
                            <button className="btn btn-outline" onClick={() => setLayoutMenuOpen(true)}>
                                <FolderOpen size={18} /> Load {layoutMenuOpen ? '▲' : '▼'}
                            </button>
                            {layoutMenuOpen && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        zIndex: 9999,
                                        background: '#1e293b',
                                        borderRadius: 8,
                                        padding: 8,
                                        marginTop: 4,
                                        minWidth: 280,
                                        maxHeight: 300,
                                        overflowY: 'auto',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                                        border: '1px solid #374151'
                                    }}>
                                    {savedLayouts.length === 0 ? (
                                        <div style={{ padding: 12, color: '#64748b', textAlign: 'center' }}>
                                            No saved layouts yet
                                        </div>
                                    ) : (
                                        savedLayouts.map(l => (
                                            <div key={l.id} style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                padding: '10px 12px',
                                                borderRadius: 6,
                                                background: currentLayoutId === l.id ? '#374151' : 'transparent',
                                                marginBottom: 4,
                                                border: l.is_default ? '1px solid #22c55e' : '1px solid transparent'
                                            }}
                                                onMouseOver={e => e.currentTarget.style.background = '#374151'}
                                                onMouseOut={e => e.currentTarget.style.background = currentLayoutId === l.id ? '#374151' : 'transparent'}
                                            >
                                                {renamingId === l.id ? (
                                                    <div style={{ flex: 1, display: 'flex', gap: 4, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <input
                                                            id={`rename-input-${l.id}`}
                                                            autoFocus
                                                            defaultValue={l.name}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') submitRename(l.id, e.target.value);
                                                                if (e.key === 'Escape') setRenamingId(null);
                                                            }}
                                                            style={{ flex: 1, padding: '4px 8px', borderRadius: 4, border: '1px solid #60a5fa', background: '#0f172a', color: 'white', fontSize: 13 }}
                                                        />
                                                        <button onClick={() => {
                                                            const input = document.getElementById(`rename-input-${l.id}`);
                                                            if (input) submitRename(l.id, input.value);
                                                        }} style={{ padding: 4, color: '#22c55e', background: 'none', border: 'none', cursor: 'pointer' }} title="Save">
                                                            <Check size={16} />
                                                        </button>
                                                        <button onClick={() => setRenamingId(null)} style={{ padding: 4, color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }} title="Cancel">
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                ) : deleteConfirmId === l.id ? (
                                                    <div style={{ flex: 1, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end', color: '#ef4444', fontSize: 13, fontWeight: 'bold' }} onClick={e => e.stopPropagation()}>
                                                        <span>Confirm Delete?</span>
                                                        <button onClick={() => deleteLayoutFromDB(l.id)} style={{ padding: '4px 8px', background: '#ef4444', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11 }}>Yes</button>
                                                        <button onClick={() => setDeleteConfirmId(null)} style={{ padding: '4px 8px', background: '#475569', color: 'white', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11 }}>No</button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div style={{ flex: 1, cursor: 'pointer', overflow: 'hidden' }} onClick={() => loadLayout(l)}>
                                                            <div style={{ color: '#fff', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                {l.name}
                                                                {l.is_default && <span style={{ color: '#22c55e', fontSize: 10 }}>⭐ PRIORITY</span>}
                                                            </div>
                                                            <div style={{ color: '#64748b', fontSize: 11 }}>{l.description}</div>
                                                        </div>
                                                        <div
                                                            style={{ display: 'flex', gap: 4, position: 'relative', zIndex: 10, flexShrink: 0 }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            onMouseOver={(e) => e.stopPropagation()}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setPriorityLayout(l.id); }}
                                                                style={{ background: 'none', border: 'none', color: l.is_default ? '#22c55e' : '#64748b', cursor: 'pointer', padding: 6 }}
                                                                title={l.is_default ? 'Priority Layout' : 'Set as Priority'}
                                                            >
                                                                <Star size={16} fill={l.is_default ? '#22c55e' : 'none'} style={{ pointerEvents: 'none' }} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setRenamingId(l.id); }}
                                                                style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer', padding: 6 }}
                                                                title="Rename"
                                                            >
                                                                <Edit2 size={16} style={{ pointerEvents: 'none' }} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); if (!l.is_default) setDeleteConfirmId(l.id); }}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: l.is_default ? '#475569' : '#ef4444',
                                                                    cursor: l.is_default ? 'not-allowed' : 'pointer',
                                                                    padding: 6,
                                                                    opacity: l.is_default ? 0.5 : 1
                                                                }}
                                                                title={l.is_default ? 'Cannot delete priority layout' : 'Delete'}
                                                                disabled={l.is_default}
                                                            >
                                                                <Trash2 size={16} style={{ pointerEvents: 'none' }} />
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Save Buttons */}
                        <button className="btn btn-secondary" onClick={saveLayout} disabled={layoutSaving}>
                            <Save size={18} /> {layoutSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button className="btn btn-outline" onClick={() => setShowSaveAsModal(true)}>
                            <Plus size={18} /> Save As
                        </button>
                        <button className="btn btn-outline" onClick={resetLayout}><Home size={18} /> Reset</button>
                    </div>

                    {/* Save As Modal */}
                    {showSaveAsModal && (
                        <div style={{
                            position: 'fixed',
                            inset: 0,
                            background: 'rgba(0,0,0,0.7)',
                            zIndex: 10000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }} onClick={() => setShowSaveAsModal(false)}>
                            <div style={{
                                background: '#1e293b',
                                borderRadius: 12,
                                padding: 24,
                                minWidth: 350,
                                boxShadow: '0 16px 64px rgba(0,0,0,0.5)'
                            }} onClick={e => e.stopPropagation()}>
                                <h3 style={{ marginBottom: 16, color: '#fff' }}>Save Layout As</h3>
                                <input
                                    type="text"
                                    value={saveAsName}
                                    onChange={e => setSaveAsName(e.target.value)}
                                    placeholder="Enter layout name (e.g., Main Store)"
                                    style={{
                                        width: '100%',
                                        padding: '12px 16px',
                                        borderRadius: 8,
                                        border: '1px solid #475569',
                                        background: '#0f172a',
                                        color: '#fff',
                                        fontSize: 16,
                                        marginBottom: 16
                                    }}
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && saveLayoutAs(saveAsName)}
                                />
                                <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                                    <button className="btn btn-outline" onClick={() => setShowSaveAsModal(false)}>Cancel</button>
                                    <button
                                        className="btn btn-primary"
                                        onClick={() => saveLayoutAs(saveAsName)}
                                        disabled={!saveAsName.trim() || layoutSaving}
                                    >
                                        <Check size={18} /> {layoutSaving ? 'Saving...' : 'Save'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Selected Item Nav */}
            {selectedItem && (
                <div className="card" style={{ marginBottom: 16 }}>
                    <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={24} color="white" />
                            </div>
                            <div>
                                <h3 style={{ fontWeight: 600 }}>Navigating to: {selectedItem.material || selectedItem.partNumber}</h3>
                                <p className="text-muted">
                                    {selectedItem.shortName || selectedItem.materialDescription} • Location: <strong>{selectedItem.location?.code || 'Unknown'}</strong>
                                </p>
                            </div>
                        </div>
                        <button className="btn btn-ghost btn-icon" onClick={clearSelection}><X size={20} /></button>
                    </div>
                </div>
            )}

            {/* 3D Canvas */}
            <div className="card stockroom-canvas-container" style={{ height: 600, padding: 0, overflow: 'hidden', position: 'relative' }}>
                {/* Floor Transition Overlay */}
                <div style={{
                    position: 'absolute',
                    inset: 0,
                    background: 'linear-gradient(180deg, #1e3a5f, #0f172a)',
                    zIndex: isTransitioning ? 100 : -1,
                    opacity: isTransitioning ? 1 : 0,
                    transition: 'opacity 0.3s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none'
                }}>
                    <div style={{ textAlign: 'center', color: '#fff' }}>
                        <div style={{ fontSize: 48, marginBottom: 12 }}>{currentFloor === 1 ? '⬇️' : '⬆️'}</div>
                        <div style={{ fontSize: 20, fontWeight: 600 }}>Going to {currentFloor === 1 ? '1st' : '2nd'} Floor</div>
                    </div>
                </div>

                <Canvas
                    camera={{ position: viewMode === '2d' ? [0, 40, 0.1] : [0, 20, 25], fov: 50 }}
                    style={{
                        background: 'linear-gradient(180deg, #1e3a5f, #2d4a6f, #1e3a5f)',
                        opacity: isTransitioning ? 0.3 : 1,
                        transition: 'opacity 0.3s ease-in-out'
                    }}
                >
                    <StockroomScene
                        objects={layout.objects}
                        editMode={editMode}
                        currentFloor={currentFloor}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        onPositionChange={handlePositionChange}
                        onRotationChange={handleRotationChange}
                        viewMode={viewMode}
                        highlightedLocation={highlightedLocation}
                        isDragging={isDragging}
                        onDragStart={() => setIsDragging(true)}
                        onDragEnd={() => setIsDragging(false)}
                        onStairClick={handleStairClick}
                    />
                    <OrbitControls
                        ref={controlsRef}
                        enableRotate={viewMode === '3d' && !isDragging}
                        enablePan={true}
                        enableZoom={!isDragging}
                        minDistance={2}
                        maxDistance={80}
                        maxPolarAngle={viewMode === '2d' ? 0.01 : Math.PI / 2.1}
                    />
                    {/* <CameraAnimator highlightedPart={highlightedPart} viewMode={viewMode} controlsRef={controlsRef} /> */}
                    <PathRenderer points={pathPoints} start={pathStart} end={pathEnd} />
                    {pathPoints && pathPoints.length > 0 && (
                        <PathWalker pathPoints={pathPoints} />
                    )}
                    {/* Enable Debug Grid to see obstacles */}
                    {/* <GridDebugger objects={layout?.objects || []} floor={currentFloor} /> */}
                    <HighlightMarker highlightedPart={highlightedPart} />

                    {/* Pathfinding Debug Overlay */}
                    {/*
                    <Html position={[0, 5, 0]}>
                        <div style={{ background: 'rgba(0,0,0,0.8)', color: 'lime', padding: 8, fontFamily: 'monospace', fontSize: 12, borderRadius: 4, minWidth: 200 }}>
                            <div>Path Status: {pathPoints.length > 2 ? 'OK' : 'FAIL (Fallback)'}</div>
                            <div>Mode: High Res (0.1)</div>
                            <div>Points: {pathPoints.length}</div>
                            <div>Start: {pathStart ? `${pathStart.x.toFixed(1)}, ${pathStart.z.toFixed(1)}` : 'N/A'}</div>
                            <div>End: {pathEnd ? `${pathEnd.x.toFixed(1)}, ${pathEnd.z.toFixed(1)}` : 'N/A'}</div>
                        </div>
                    </Html>
                    */}

                    {/* Ghost Shelf for Virtual Parts */}
                    {highlightedPart?.isVirtual && (
                        <group position={[highlightedPart.position.x, 0, highlightedPart.position.z]}>
                            <mesh position={[0, 1.0, 0]}>
                                <boxGeometry args={[1.5, 2, 0.5]} />
                                <meshBasicMaterial color="#22c55e" wireframe transparent opacity={0.3} />
                            </mesh>
                            <Text position={[0, 2.2, 0]} fontSize={0.2} color="#22c55e" anchorX="center">
                                VIRTUAL LOCATION
                            </Text>
                        </group>
                    )}
                </Canvas>

                {/* Legend */}
                <div style={{ position: 'absolute', bottom: 16, left: 16, background: 'rgba(30,41,59,0.95)', padding: 16, borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', maxWidth: 200 }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 600 }}>
                        {currentFloor === 1 ? '1ST FLOOR' : '2ND FLOOR'}
                    </div>
                    <div style={{ fontSize: 13, display: 'grid', gap: 4 }}>
                        <span>📦 {layout.objects.filter(o => o.floor === currentFloor && (o.type === 'shelf' || o.type === 'shelf2')).length} Shelves</span>
                        <span>💳 {layout.objects.filter(o => o.floor === currentFloor && o.type === 'counter').length} Counters</span>
                        <span>🪜 {layout.objects.filter(o => o.floor === currentFloor && o.type === 'stairs').length} Stairs</span>
                    </div>
                </div>

                {/* Zoom Controls */}
                <div style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <button
                        onClick={() => {
                            const canvas = document.querySelector('canvas');
                            if (canvas) {
                                canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }));
                            }
                        }}
                        style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(30,41,59,0.95)', border: '1px solid #475569', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Zoom In"
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        onClick={() => {
                            const canvas = document.querySelector('canvas');
                            if (canvas) {
                                canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
                            }
                        }}
                        style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(30,41,59,0.95)', border: '1px solid #475569', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Zoom Out"
                    >
                        <ZoomOut size={20} />
                    </button>
                </div>

                <div style={{ position: 'absolute', bottom: 16, right: 16, background: 'rgba(30,41,59,0.9)', padding: 12, borderRadius: 8, fontSize: 13 }}>
                    {viewMode === '2d' ? '🔍 2D View • Drag to pan • Scroll to zoom' : '🖱️ Drag to rotate • Scroll to zoom'}
                </div>
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-4" style={{ marginTop: 24 }}>
                {[
                    { icon: '📦', title: 'Shelves', count: layout.objects.filter(o => o.type === 'shelf' || o.type === 'shelf2').length },
                    { icon: '💳', title: 'Counters', count: layout.objects.filter(o => o.type === 'counter').length },
                    { icon: '🚪', title: 'Entrances', count: layout.objects.filter(o => o.type === 'entrance').length },
                    { icon: '🏢', title: 'Floors', count: 2 }
                ].map((item, i) => (
                    <div key={i} className="card">
                        <div className="flex items-center" style={{ gap: '16px' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow: '0 4px 12px rgba(6, 182, 212, 0.2)' }}>{item.icon}</div>
                            <div>
                                <h4 style={{ fontWeight: 600, fontSize: 16 }}>{item.count} {item.title}</h4>
                                <p className="text-muted" style={{ fontSize: 13 }}>Total</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default StockroomViewer;
