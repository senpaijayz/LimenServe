// Shared by the camera and the floor plan so resized/rotated layouts stay in view.
export function getFloorBounds(objects, activeFloor = 1) {
    const visible = objects.filter((object) => (
        object.floors?.includes(activeFloor) || Number(object.floor || 1) === activeFloor || object.type === 'stairs'
    ));
    const corners = visible.flatMap((object) => {
        const [x = 0, , z = 0] = object.position || [];
        const width = Number(object.dimensions?.width || 1);
        const depth = Number(object.dimensions?.depth || 1);
        const angle = Number(object.rotation?.[1] || 0);
        const halfX = (Math.abs(Math.cos(angle)) * width + Math.abs(Math.sin(angle)) * depth) / 2;
        const halfZ = (Math.abs(Math.sin(angle)) * width + Math.abs(Math.cos(angle)) * depth) / 2;
        return [[x - halfX, z - halfZ], [x + halfX, z + halfZ]];
    });
    if (!corners.length) return { x: 0, z: 0, width: 24, depth: 16 };
    const xs = corners.map(([x]) => x);
    const zs = corners.map(([, z]) => z);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width: Math.max(1, maxX - minX), depth: Math.max(1, maxZ - minZ) };
}

export function getOverviewCamera(objects, activeFloor, floorHeight, aspect = 1.5, topDown = false) {
    const bounds = getFloorBounds(objects, activeFloor);
    const floorY = activeFloor === 2 ? floorHeight : 0;
    const halfFov = 23 * Math.PI / 180;
    const lookAt = [bounds.x, floorY + floorHeight * 0.3, bounds.z];
    const direction = topDown ? [0, 1, 0.0001] : [0.6, 0.62, 0.6];
    const length = Math.hypot(...direction);
    const forward = direction.map((value) => value / length);
    const horizontal = Math.hypot(forward[0], forward[2]);
    const right = [forward[2] / horizontal, 0, -forward[0] / horizontal];
    const up = [-forward[1] * forward[0] / horizontal, horizontal, -forward[1] * forward[2] / horizontal];
    const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
    let distance = 1;
    for (const x of [-bounds.width / 2, bounds.width / 2]) {
        for (const z of [-bounds.depth / 2, bounds.depth / 2]) {
            for (const y of [-floorHeight * 0.3, floorHeight * 0.7]) {
                const point = [x, y, z];
                distance = Math.max(distance, dot(point, forward) + 1.12 * Math.max(
                    Math.abs(dot(point, right)) / (Math.tan(halfFov) * Math.max(0.25, aspect)),
                    Math.abs(dot(point, up)) / Math.tan(halfFov),
                ));
            }
        }
    }
    return { lookAt, position: lookAt.map((value, index) => value + forward[index] * distance) };
}
