import { FLOOR_HEIGHT, getStairLayoutMetrics, normalizeLayoutObjects } from '../data/locatorScene';

const STEP = 0.5;
const CLEARANCE = 0.22;
const SOLIDS = new Set(['wall', 'stairs', 'counter-computer', 'parts-cabinet', 'shelf', 'shelf-2-layer', 'shelf-4-layer']);
const key = (p) => `${p.x}:${p.z}`;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

export function localToWorld(object, x, z, y = 0) {
    const angle = Number(object.rotation?.[1] || 0);
    return [
        Number(object.position?.[0] || 0) + Math.cos(angle) * x + Math.sin(angle) * z,
        y,
        Number(object.position?.[2] || 0) - Math.sin(angle) * x + Math.cos(angle) * z,
    ];
}
function localPoint(point, object) {
    const angle = Number(object.rotation?.[1] || 0);
    const x = point.x - Number(object.position?.[0] || 0);
    const z = point.z - Number(object.position?.[2] || 0);
    return { x: Math.cos(angle) * x - Math.sin(angle) * z, z: Math.sin(angle) * x + Math.cos(angle) * z };
}
function geometry(objects, floor, ignoreObjectIds = []) {
    const base = objects.find((o) => o.type === 'floor')
        || { position: [0, 0, 0], dimensions: { width: 24, depth: 16, height: FLOOR_HEIGHT } };
    const solids = objects.filter((o) => SOLIDS.has(o.type) && !ignoreObjectIds.includes(o.id)
        && (o.type === 'stairs' || (o.floors || [Number(o.floor || 1)]).includes(floor)));
    const inside = (point) => {
        const p = localPoint(point, base);
        return Math.abs(p.x) <= base.dimensions.width / 2 - CLEARANCE
            && Math.abs(p.z) <= base.dimensions.depth / 2 - CLEARANCE;
    };
    const blocked = (point) => solids.some((o) => {
        const p = localPoint(point, o);
        if (o.type === 'stairs') {
            const m = getStairLayoutMetrics(o);
            if (floor === 2) {
                // Same upper-flight opening as stairOpening.js, including its rim.
                return Math.abs(p.x - m.landingX) <= m.flightWidth / 2 + 0.24 + CLEARANCE
                    && Math.abs(p.z) <= m.overallDepth / 2 + 0.24 + CLEARANCE;
            }
            return (Math.abs(p.x) <= m.overallWidth / 2 + CLEARANCE
                && Math.abs(p.z - m.landingZ) <= m.flightWidth / 2 + CLEARANCE)
                || (Math.abs(p.x - m.landingX) <= m.flightWidth / 2 + CLEARANCE
                && Math.abs(p.z) <= m.overallDepth / 2 + CLEARANCE);
        }
        const width = Number(o.dimensions?.width || 1);
        const depth = Number(o.dimensions?.depth || 1);
        if (Math.abs(p.x) > width / 2 + CLEARANCE || Math.abs(p.z) > depth / 2 + CLEARANCE) return false;
        if (o.type === 'wall') {
            const openingWidth = Math.min(width - 0.1, Math.max(0, Number(o.opening?.width || 0)));
            const center = Math.min(width / 2 - openingWidth / 2,
                Math.max(-width / 2 + openingWidth / 2, Number(o.opening?.offset || 0)));
            if (openingWidth > CLEARANCE * 2 && Math.abs(p.x - center) < openingWidth / 2 - CLEARANCE) return false;
        }
        return true;
    });
    const walkable = (p) => inside(p) && !blocked(p);
    const segment = (a, b) => {
        const count = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.z - b.z) / 0.08));
        for (let i = 0; i <= count; i += 1) {
            if (!walkable({ x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count })) return false;
        }
        return true;
    };
    return { base, inside, walkable, segment };
}
function gridEndpoint(point, geo) {
    const actual = { x: Number(point[0]), z: Number(point[2]) };
    if (!geo.walkable(actual)) return null;
    // Grid snapping cannot teleport across a thin wall or move an out-of-room point.
    const center = { x: Math.round(actual.x / STEP) * STEP, z: Math.round(actual.z / STEP) * STEP };
    const candidates = [];
    for (let x = -1; x <= 1; x += 1) for (let z = -1; z <= 1; z += 1) {
        const p = { x: center.x + x * STEP, z: center.z + z * STEP };
        if (geo.segment(actual, p)) candidates.push(p);
    }
    return candidates.sort((a, b) => distance(a, actual) - distance(b, actual))[0] || null;
}
export function findWalkablePath(start, target, objects = [], { floor = 1, ignoreObjectIds = [] } = {}) {
    const geo = geometry(objects, Number(floor), ignoreObjectIds);
    const first = gridEndpoint(start, geo);
    const last = gridEndpoint(target, geo);
    if (!first || !last) return [];
    const open = [first], openKeys = new Set([key(first)]), closed = new Set();
    const previous = new Map(), scores = new Map([[key(first), 0]]);
    let visits = 0;
    while (open.length && visits++ < 30000) {
        open.sort((a, b) => (scores.get(key(a)) + distance(a, last)) - (scores.get(key(b)) + distance(b, last)));
        const current = open.shift(), currentKey = key(current);
        openKeys.delete(currentKey);
        if (currentKey === key(last)) {
            const path = [current];
            while (previous.has(key(path[0]))) path.unshift(previous.get(key(path[0])));
            const y = floor === 2 ? Number(geo.base.dimensions.height || FLOOR_HEIGHT) : 0;
            return [[start[0], y, start[2]], ...path.map((p) => [p.x, y, p.z]), [target[0], y, target[2]]]
                .filter((p, i, all) => !i || p[0] !== all[i - 1][0] || p[2] !== all[i - 1][2]);
        }
        closed.add(currentKey);
        for (const [dx, dz] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
            const next = { x: current.x + dx, z: current.z + dz }, nextKey = key(next);
            if (closed.has(nextKey) || !geo.segment(current, next)) continue;
            const score = scores.get(currentKey) + STEP;
            if (score >= (scores.get(nextKey) ?? Infinity)) continue;
            previous.set(nextKey, current); scores.set(nextKey, score);
            if (!openKeys.has(nextKey)) { open.push(next); openKeys.add(nextKey); }
        }
    }
    return [];
}
function accessPoints(object, y) {
    const w = Number(object.dimensions?.width || 1) / 2 + 0.5;
    const d = Number(object.dimensions?.depth || 1) / 2 + 0.5;
    return [[0, -d], [0, d], [-w, 0], [w, 0]].map(([x, z]) => localToWorld(object, x, z, y));
}
export function buildObstacleAwarePath(sceneObjects = [], locatedProduct = null) {
    if (!locatedProduct) return [];
    const objects = normalizeLayoutObjects(sceneObjects);
    const floor = Number(locatedProduct.floor || 1);
    const counter = objects.find((o) => o.type === 'counter-computer' && Number(o.floor || 1) === 1);
    const shelf = objects.find((o) => o.id === locatedProduct.shelfObjectId && Number(o.floor || 1) === floor);
    if (!counter || !shelf) return [];
    const height = Number(objects.find((o) => o.type === 'floor')?.dimensions.height || FLOOR_HEIGHT);
    const targets = accessPoints(shelf, floor === 2 ? height : 0);
    const starts = accessPoints(counter, 0);
    let best = [];
    const keepShortest = (path) => { if (path.length && (!best.length || path.length < best.length)) best = path; };
    if (floor === 1) {
        for (const start of starts) for (const target of targets) keepShortest(findWalkablePath(start, target, objects));
        return best;
    }
    for (const stairs of objects.filter((o) => o.type === 'stairs')) {
        const m = getStairLayoutMetrics(stairs);
        const bottom = localToWorld(stairs, -m.overallWidth / 2 - 0.55, m.landingZ);
        const landing = localToWorld(stairs, m.landingX, m.landingZ, height / 2);
        const top = localToWorld(stairs, m.landingX, m.overallDepth / 2 + 0.55, height);
        // Check both flights against walls and fixtures (ignore only these stairs).
        const lowGeo = geometry(objects, 1, [stairs.id]);
        const highGeo = geometry(objects, 2, [stairs.id]);
        const point = (p) => ({ x: p[0], z: p[2] });
        if (!lowGeo.segment(point(bottom), point(landing)) || !highGeo.segment(point(landing), point(top))) continue;
        for (const start of starts) {
            const first = findWalkablePath(start, bottom, objects);
            if (!first.length) continue;
            for (const target of targets) {
                const second = findWalkablePath(top, target, objects, { floor: 2 });
                if (second.length) keepShortest([...first, landing, ...second]);
            }
        }
    }
    // Never draw a straight line through obstacles when no safe path exists.
    return best;
}
