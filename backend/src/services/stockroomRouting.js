const FLOOR_SWITCH_COST = 6;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePoint(point, fallback = { x: 0, y: 0 }) {
  if (!point || typeof point !== 'object') {
    return fallback;
  }

  return {
    x: toNumber(point.x, fallback.x),
    y: toNumber(point.y, fallback.y),
  };
}

function manhattanDistance(left, right) {
  return Math.abs(left.x - right.x) + Math.abs(left.y - right.y);
}

function addNode(graph, node) {
  graph.nodes.set(node.id, node);
  if (!graph.edges.has(node.id)) {
    graph.edges.set(node.id, []);
  }
}

function addEdge(graph, fromId, toId, weight) {
  if (!graph.edges.has(fromId) || !graph.edges.has(toId)) {
    return;
  }

  graph.edges.get(fromId).push({ to: toId, weight });
  graph.edges.get(toId).push({ to: fromId, weight });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getAisleAccessPoint(aisle, shelf) {
  const start = {
    x: toNumber(aisle.start_x),
    y: toNumber(aisle.start_y),
  };
  const end = {
    x: toNumber(aisle.end_x),
    y: toNumber(aisle.end_y),
  };
  const isVertical = Math.abs(start.x - end.x) <= Math.abs(start.y - end.y);

  if (isVertical) {
    return {
      x: start.x,
      y: clamp(toNumber(shelf.position_y), Math.min(start.y, end.y), Math.max(start.y, end.y)),
    };
  }

  return {
    x: clamp(toNumber(shelf.position_x), Math.min(start.x, end.x), Math.max(start.x, end.x)),
    y: start.y,
  };
}

function groupBy(items, key) {
  return items.reduce((map, item) => {
    const groupKey = item[key];
    if (!map.has(groupKey)) {
      map.set(groupKey, []);
    }
    map.get(groupKey).push(item);
    return map;
  }, new Map());
}

export function buildStockroomGraph({ floors, aisles, shelves, layout }) {
  const graph = {
    nodes: new Map(),
    edges: new Map(),
  };

  const aisleByFloor = groupBy(aisles, 'floor_id');
  const shelvesByFloor = groupBy(shelves, 'floor_id');
  const staircaseAnchors = new Map([
    [1, normalizePoint(layout.staircase_floor_1_anchor, { x: 0, y: 0 })],
    [2, normalizePoint(layout.staircase_floor_2_anchor, { x: 0, y: 0 })],
  ]);

  floors.forEach((floor) => {
    const floorNumber = toNumber(floor.floor_number);
    const entryPoint = normalizePoint(floor.entry_anchor, { x: 0, y: 0 });
    const stairPoint = staircaseAnchors.get(floorNumber) ?? { x: 0, y: 0 };

    addNode(graph, {
      id: `entry:${floor.id}`,
      kind: 'entry',
      floorId: floor.id,
      floorNumber,
      point: entryPoint,
    });

    addNode(graph, {
      id: `stair:${floor.id}`,
      kind: 'stair',
      floorId: floor.id,
      floorNumber,
      point: stairPoint,
    });

    const floorAisles = aisleByFloor.get(floor.id) ?? [];

    floorAisles.forEach((aisle) => {
      const startPoint = {
        x: toNumber(aisle.start_x),
        y: toNumber(aisle.start_y),
      };
      const endPoint = {
        x: toNumber(aisle.end_x),
        y: toNumber(aisle.end_y),
      };

      addNode(graph, {
        id: `aisle-start:${aisle.id}`,
        kind: 'aisle-start',
        floorId: floor.id,
        floorNumber,
        point: startPoint,
        aisleId: aisle.id,
      });

      addNode(graph, {
        id: `aisle-end:${aisle.id}`,
        kind: 'aisle-end',
        floorId: floor.id,
        floorNumber,
        point: endPoint,
        aisleId: aisle.id,
      });

      addEdge(graph, `aisle-start:${aisle.id}`, `aisle-end:${aisle.id}`, manhattanDistance(startPoint, endPoint));
      addEdge(graph, `entry:${floor.id}`, `aisle-start:${aisle.id}`, manhattanDistance(entryPoint, startPoint));
      addEdge(graph, `entry:${floor.id}`, `aisle-end:${aisle.id}`, manhattanDistance(entryPoint, endPoint));
      addEdge(graph, `stair:${floor.id}`, `aisle-start:${aisle.id}`, manhattanDistance(stairPoint, startPoint));
      addEdge(graph, `stair:${floor.id}`, `aisle-end:${aisle.id}`, manhattanDistance(stairPoint, endPoint));
    });

    const floorAisleNodes = floorAisles.flatMap((aisle) => ([
      graph.nodes.get(`aisle-start:${aisle.id}`),
      graph.nodes.get(`aisle-end:${aisle.id}`),
    ]));

    for (let index = 0; index < floorAisleNodes.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < floorAisleNodes.length; compareIndex += 1) {
        const left = floorAisleNodes[index];
        const right = floorAisleNodes[compareIndex];
        addEdge(graph, left.id, right.id, manhattanDistance(left.point, right.point));
      }
    }

    (shelvesByFloor.get(floor.id) ?? []).forEach((shelf) => {
      const aisle = floorAisles.find((candidate) => candidate.id === shelf.aisle_id);
      if (!aisle) {
        return;
      }

      const accessPoint = getAisleAccessPoint(aisle, shelf);
      addNode(graph, {
        id: `shelf:${shelf.id}`,
        kind: 'shelf',
        floorId: floor.id,
        floorNumber,
        point: accessPoint,
        shelfId: shelf.id,
        aisleId: aisle.id,
      });

      addEdge(graph, `shelf:${shelf.id}`, `aisle-start:${aisle.id}`, manhattanDistance(accessPoint, graph.nodes.get(`aisle-start:${aisle.id}`).point));
      addEdge(graph, `shelf:${shelf.id}`, `aisle-end:${aisle.id}`, manhattanDistance(accessPoint, graph.nodes.get(`aisle-end:${aisle.id}`).point));
    });
  });

  if (floors.length === 2) {
    const [firstFloor, secondFloor] = [...floors].sort((left, right) => left.floor_number - right.floor_number);
    addEdge(graph, `stair:${firstFloor.id}`, `stair:${secondFloor.id}`, FLOOR_SWITCH_COST);
  }

  return graph;
}

export function findShortestPath(graph, startId, endId) {
  if (!graph.nodes.has(startId) || !graph.nodes.has(endId)) {
    return [];
  }

  const open = new Set([startId]);
  const cameFrom = new Map();
  const gScore = new Map([[startId, 0]]);
  const fScore = new Map([[startId, manhattanDistance(graph.nodes.get(startId).point, graph.nodes.get(endId).point)]]);

  while (open.size > 0) {
    let currentId = null;
    let currentScore = Number.POSITIVE_INFINITY;

    open.forEach((nodeId) => {
      const score = fScore.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (score < currentScore) {
        currentScore = score;
        currentId = nodeId;
      }
    });

    if (!currentId) {
      break;
    }

    if (currentId === endId) {
      const path = [currentId];
      while (cameFrom.has(currentId)) {
        currentId = cameFrom.get(currentId);
        path.unshift(currentId);
      }
      return path;
    }

    open.delete(currentId);
    (graph.edges.get(currentId) ?? []).forEach((edge) => {
      const tentativeGScore = (gScore.get(currentId) ?? Number.POSITIVE_INFINITY) + edge.weight;
      if (tentativeGScore >= (gScore.get(edge.to) ?? Number.POSITIVE_INFINITY)) {
        return;
      }

      const neighborNode = graph.nodes.get(edge.to);
      const endNode = graph.nodes.get(endId);
      cameFrom.set(edge.to, currentId);
      gScore.set(edge.to, tentativeGScore);
      fScore.set(edge.to, tentativeGScore + manhattanDistance(neighborNode.point, endNode.point));
      open.add(edge.to);
    });
  }

  return [];
}

function dedupePoints(points) {
  return points.filter((point, index) => {
    if (index === 0) {
      return true;
    }

    const previous = points[index - 1];
    return previous.x !== point.x || previous.y !== point.y;
  });
}

function buildRouteSteps({ currentFloorNumber, targetFloorNumber, targetLocation }) {
  const steps = [
    `Start on floor ${currentFloorNumber}.`,
  ];

  if (currentFloorNumber !== targetFloorNumber) {
    steps.push(`Walk to the staircase on floor ${currentFloorNumber}.`);
    steps.push(`Take the staircase to floor ${targetFloorNumber}.`);
  }

  steps.push(`Follow the aisle to shelf ${targetLocation.shelf.code}.`);
  steps.push(`Pick from level ${targetLocation.level.level_number}, slot ${targetLocation.slot.slot_number}.`);
  return steps;
}

export function buildRouteResponse({ snapshot, currentFloorNumber, targetLocation }) {
  const currentFloor = snapshot.floors.find((floor) => Number(floor.floor_number) === Number(currentFloorNumber)) ?? snapshot.floors[0];
  const targetFloor = snapshot.floors.find((floor) => floor.id === targetLocation.floor.id);

  if (!currentFloor || !targetFloor) {
    return {
      currentFloor: currentFloorNumber,
      targetFloor: targetFloor?.floor_number ?? null,
      requiresFloorChange: false,
      steps: [],
      segmentsByFloor: {},
      targetSlot: null,
    };
  }

  const graph = buildStockroomGraph({
    floors: snapshot.floors,
    aisles: snapshot.aisles,
    shelves: snapshot.shelves,
    layout: snapshot.layout,
  });

  const path = findShortestPath(graph, `entry:${currentFloor.id}`, `shelf:${targetLocation.shelf.id}`);
  const segmentsByFloor = {};

  path.forEach((nodeId) => {
    const node = graph.nodes.get(nodeId);
    if (!node) {
      return;
    }

    const floorNumber = String(node.floorNumber);
    if (!segmentsByFloor[floorNumber]) {
      segmentsByFloor[floorNumber] = [];
    }
    segmentsByFloor[floorNumber].push(node.point);
  });

  Object.keys(segmentsByFloor).forEach((floorNumber) => {
    segmentsByFloor[floorNumber] = dedupePoints(segmentsByFloor[floorNumber]);
  });

  const shelfWidth = toNumber(targetLocation.shelf.width, 2.2);
  const slotWidth = toNumber(targetLocation.slot.width, 0.52);
  const targetSlot = {
    floorNumber: Number(targetFloor.floor_number),
    x: toNumber(targetLocation.shelf.position_x) - (shelfWidth / 2) + toNumber(targetLocation.slot.position_x) + (slotWidth / 2),
    y: toNumber(targetLocation.shelf.position_y),
    levelNumber: targetLocation.level.level_number,
    slotNumber: targetLocation.slot.slot_number,
  };

  return {
    currentFloor: Number(currentFloor.floor_number),
    targetFloor: Number(targetFloor.floor_number),
    requiresFloorChange: Number(currentFloor.floor_number) !== Number(targetFloor.floor_number),
    steps: buildRouteSteps({
      currentFloorNumber: Number(currentFloor.floor_number),
      targetFloorNumber: Number(targetFloor.floor_number),
      targetLocation,
    }),
    segmentsByFloor,
    targetShelfId: targetLocation.shelf.id,
    targetSlotId: targetLocation.slot.id,
    targetSlot,
  };
}
