import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react';
import type { SceneEntity, SceneModel, StockroomFloor, StockroomItemDetails, Vec2 } from '../types';
import { DEFAULT_SNAP_GRID, snapPosition, snapRotation } from '../utils/sceneModel';
import { ADMIN_SCENE_THEME, VIEWER_SCENE_THEME } from './StockroomScenePrimitives';

interface StockroomPlanViewProps {
  bootstrap: { floors: StockroomFloor[] } | null;
  scene: SceneModel;
  currentFloor: number;
  selectedItemDetails?: StockroomItemDetails | null;
  selectedEntityKey?: string | null;
  editable?: boolean;
  theme?: 'viewer' | 'admin';
  zoomLevel?: number;
  onEntitySelect?: (entity: SceneEntity | null) => void;
  onEntityPreview?: (entityKey: string, patch: Partial<SceneEntity>) => void;
  onEntityCommit?: (entity: SceneEntity) => void;
  onFloorSwitch?: (nextFloor: number) => void;
}

type DragState = {
  entityKey: string;
  offset: Vec2;
};

function createViewBox(width: number, depth: number, zoomLevel: number) {
  const padding = 1.5;
  const fullWidth = width + padding * 2;
  const fullHeight = depth + padding * 2;
  const viewWidth = fullWidth / zoomLevel;
  const viewHeight = fullHeight / zoomLevel;

  return {
    x: width / 2 - viewWidth / 2,
    y: depth / 2 - viewHeight / 2,
    width: viewWidth,
    height: viewHeight,
  };
}

function entityBounds(entity: SceneEntity) {
  return {
    x: entity.position.x - entity.size.x / 2,
    y: entity.position.y - entity.size.z / 2,
    width: entity.size.x,
    height: entity.size.z,
  };
}

function buildRoutePath(points: Vec2[]) {
  if (points.length === 0) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const start = points[0];
  const commands = [`M ${start.x} ${start.y}`];

  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const midX = (previous.x + current.x) / 2;
    const midY = (previous.y + current.y) / 2;
    commands.push(`Q ${previous.x} ${previous.y} ${midX} ${midY}`);
  }

  const last = points[points.length - 1];
  commands.push(`T ${last.x} ${last.y}`);
  return commands.join(' ');
}

function useSvgPoint(svgRef: RefObject<SVGSVGElement | null>, viewBox: ReturnType<typeof createViewBox>) {
  return useCallback((event: PointerEvent | ReactPointerEvent) => {
    const svg = svgRef.current;
    if (!svg) {
      return { x: 0, y: 0 };
    }

    const bounds = svg.getBoundingClientRect();
    return {
      x: viewBox.x + ((event.clientX - bounds.left) / bounds.width) * viewBox.width,
      y: viewBox.y + ((event.clientY - bounds.top) / bounds.height) * viewBox.height,
    };
  }, [svgRef, viewBox]);
}

function ZoneShape({ entity }: { entity: SceneEntity }) {
  const bounds = entityBounds(entity);
  return (
    <g>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={0.42}
        fill={entity.style.zoneColor || '#d9c5b2'}
        fillOpacity={0.28}
      />
      <text
        x={entity.position.x}
        y={entity.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.46}
        fontWeight={600}
        fill="#475569"
      >
        {entity.label}
      </text>
    </g>
  );
}

function ShelfShape({
  entity,
  selected,
  target,
}: {
  entity: SceneEntity;
  selected: boolean;
  target: boolean;
}) {
  const dividerCount = entity.style.variant === '3-bay' ? 2 : 1;
  const highlight = selected ? '#0ea5e9' : target ? '#ef4444' : '#0f172a';

  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.18}
        fill="#17212d"
        stroke={highlight}
        strokeWidth={selected || target ? 0.08 : 0.04}
      />
      <rect
        x={-entity.size.x / 2 + 0.08}
        y={-entity.size.z / 2 + 0.08}
        width={entity.size.x - 0.16}
        height={0.22}
        rx={0.06}
        fill="#f3f7fb"
        opacity={0.92}
      />
      {Array.from({ length: dividerCount }).map((_, index) => {
        const x = -entity.size.x / 2 + ((index + 1) * entity.size.x) / (dividerCount + 1);
        return (
          <line
            key={`${entity.entityKey}-divider-${index}`}
            x1={x}
            y1={-entity.size.z / 2 + 0.18}
            x2={x}
            y2={entity.size.z / 2 - 0.12}
            stroke="#94a3b8"
            strokeWidth={0.06}
          />
        );
      })}
      <text
        x={0}
        y={0.04}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.24}
        fontWeight={700}
        fill={target ? '#991b1b' : '#0f172a'}
      >
        {entity.label}
      </text>
    </g>
  );
}

function WallShape({
  entity,
  viewerMode,
}: {
  entity: SceneEntity;
  viewerMode: boolean;
}) {
  const lowered = viewerMode && /south|east/i.test(entity.label);
  const softened = viewerMode && !lowered;
  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.08}
        fill={lowered ? '#94a3b8' : '#1f2937'}
        fillOpacity={lowered ? 0.18 : softened ? 0.48 : 0.95}
      />
      {lowered ? (
        <rect
          x={-entity.size.x / 2}
          y={-entity.size.z / 2}
          width={entity.size.x}
          height={entity.size.z}
          rx={0.08}
          fill="none"
          stroke="#94a3b8"
          strokeDasharray="0.18 0.14"
          strokeWidth={0.04}
        />
      ) : null}
    </g>
  );
}

function BlockShape({
  entity,
  fill,
  stroke,
  showLabel = true,
}: {
  entity: SceneEntity;
  fill: string;
  stroke?: string;
  showLabel?: boolean;
}) {
  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.18}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 0.05 : 0}
      />
      {showLabel ? (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={0.22}
          fontWeight={600}
          fill={fill === '#e2e8f0' ? '#0f172a' : '#f8fafc'}
        >
          {entity.label}
        </text>
      ) : null}
    </g>
  );
}

function StairShape({
  entity,
  selected,
}: {
  entity: SceneEntity;
  selected: boolean;
}) {
  const steps = 6;
  const stepWidth = entity.size.x;
  const stepDepth = entity.size.z / steps;

  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.16}
        fill="#d8b382"
        stroke={selected ? '#0ea5e9' : '#9a6d3b'}
        strokeWidth={0.06}
      />
      {Array.from({ length: steps }).map((_, index) => (
        <rect
          key={`${entity.entityKey}-step-${index}`}
          x={-stepWidth / 2}
          y={-entity.size.z / 2 + stepDepth * index}
          width={stepWidth}
          height={stepDepth - 0.02}
          fill={index % 2 === 0 ? '#e4c49b' : '#cda476'}
          opacity={0.9}
        />
      ))}
    </g>
  );
}

export default function StockroomPlanView({
  bootstrap,
  scene,
  currentFloor,
  selectedItemDetails,
  selectedEntityKey,
  editable = false,
  theme = 'viewer',
  zoomLevel = 1,
  onEntitySelect,
  onEntityPreview,
  onEntityCommit,
  onFloorSwitch,
}: StockroomPlanViewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const floor = useMemo(
    () => bootstrap?.floors.find((entry) => entry.floorNumber === currentFloor) ?? bootstrap?.floors[0] ?? null,
    [bootstrap, currentFloor],
  );
  const palette = theme === 'admin' ? ADMIN_SCENE_THEME : VIEWER_SCENE_THEME;
  const activeEntities = scene.entitiesByFloor[currentFloor] ?? [];
  const routePoints = selectedItemDetails?.segmentsByFloor?.[String(currentFloor)] ?? [];
  const routePath = useMemo(() => buildRoutePath(routePoints), [routePoints]);
  const targetShelfId = selectedItemDetails?.targetShelfId ?? null;
  const targetSlot = selectedItemDetails?.targetFloor === currentFloor ? selectedItemDetails.targetSlot : null;
  const floorWidth = floor?.width ?? 18;
  const floorDepth = floor?.depth ?? 16;
  const viewBox = useMemo(() => createViewBox(floorWidth, floorDepth, zoomLevel), [floorDepth, floorWidth, zoomLevel]);
  const getSvgPoint = useSvgPoint(svgRef, viewBox);
  const viewerMode = theme === 'viewer';

  const handlePointerDown = useCallback((entity: SceneEntity, event: ReactPointerEvent<SVGGElement>) => {
    event.stopPropagation();
    onEntitySelect?.(entity);

    if (entity.kind === 'stairs' && !editable) {
      onFloorSwitch?.(entity.floorNumber === 1 ? 2 : 1);
      return;
    }

    if (!editable || entity.locked) {
      return;
    }

    const point = getSvgPoint(event);
    setDragState({
      entityKey: entity.entityKey,
      offset: {
        x: entity.position.x - point.x,
        y: entity.position.y - point.y,
      },
    });
  }, [editable, getSvgPoint, onEntitySelect, onFloorSwitch]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragState) {
      return;
    }

    const point = getSvgPoint(event);
    const nextPosition = snapPosition({
      x: point.x + dragState.offset.x,
      y: point.y + dragState.offset.y,
    }, scene.metadata.snapGrid || DEFAULT_SNAP_GRID);
    onEntityPreview?.(dragState.entityKey, { position: nextPosition });
  }, [dragState, getSvgPoint, onEntityPreview, scene.metadata.snapGrid]);

  const handlePointerUp = useCallback(() => {
    if (!dragState) {
      return;
    }

    const entity = activeEntities.find((entry) => entry.entityKey === dragState.entityKey);
    if (entity) {
      onEntityCommit?.({
        ...entity,
        position: snapPosition(entity.position, scene.metadata.snapGrid || DEFAULT_SNAP_GRID),
        rotation: snapRotation(entity.rotation),
      });
    }

    setDragState(null);
  }, [activeEntities, dragState, onEntityCommit, scene.metadata.snapGrid]);

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    const release = () => handlePointerUp();
    window.addEventListener('pointerup', release);
    return () => window.removeEventListener('pointerup', release);
  }, [dragState, handlePointerUp]);

  return (
    <div className="h-full min-h-[420px] w-full overflow-hidden rounded-[28px]">
      <svg
        ref={svgRef}
        viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
        className="h-full w-full"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={() => onEntitySelect?.(null)}
      >
        <defs>
          <pattern id={`grid-${theme}`} width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke={palette.grid} strokeWidth="0.03" />
          </pattern>
          <filter id={`route-glow-${theme}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.14" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id={`target-glow-${theme}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect x="0" y="0" width={floorWidth} height={floorDepth} rx="0.8" fill={palette.floorUnderlay} />
        <rect x="0.4" y="0.4" width={floorWidth - 0.8} height={floorDepth - 0.8} rx="0.55" fill={palette.floorSurface} />
        <rect x="0.4" y="0.4" width={floorWidth - 0.8} height={floorDepth - 0.8} rx="0.55" fill={`url(#grid-${theme})`} />

        {activeEntities.filter((entity) => entity.kind === 'zone_overlay').map((entity) => (
          <g key={entity.entityKey} onPointerDown={(event) => handlePointerDown(entity, event)}>
            <ZoneShape entity={entity} />
          </g>
        ))}

        {activeEntities.filter((entity) => entity.kind === 'wall').map((entity) => (
          <g key={entity.entityKey} onPointerDown={(event) => handlePointerDown(entity, event)}>
            <WallShape entity={entity} viewerMode={viewerMode} />
          </g>
        ))}

        {activeEntities.filter((entity) => entity.kind !== 'zone_overlay' && entity.kind !== 'wall').map((entity) => {
          const selected = selectedEntityKey === entity.entityKey;
          const target = targetShelfId === entity.id || targetShelfId === entity.linkedResourceId;
          let shape: ReactNode = null;

          if (entity.kind === 'shelf') {
            shape = <ShelfShape entity={entity} selected={selected} target={target} />;
          } else if (entity.kind === 'stairs') {
            shape = <StairShape entity={entity} selected={selected} />;
          } else if (entity.kind === 'door') {
            shape = <BlockShape entity={entity} fill="#dfeaf4" stroke="#94a3b8" showLabel={false} />;
          } else if (entity.kind === 'entrance') {
            shape = <BlockShape entity={entity} fill="#ef4444" stroke="#be123c" showLabel={false} />;
          } else if (entity.kind === 'cashier_counter') {
            shape = <BlockShape entity={entity} fill="#1f2937" stroke="#475569" />;
          } else if (entity.kind === 'comfort_room') {
            shape = <BlockShape entity={entity} fill="#111827" stroke="#334155" />;
          }

          return (
            <g key={entity.entityKey} onPointerDown={(event) => handlePointerDown(entity, event)}>
              {shape}
              {selected ? (
                <rect
                  x={entity.position.x - entity.size.x / 2 - 0.12}
                  y={entity.position.y - entity.size.z / 2 - 0.12}
                  width={entity.size.x + 0.24}
                  height={entity.size.z + 0.24}
                  rx="0.22"
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="0.08"
                  strokeDasharray="0.18 0.14"
                  pointerEvents="none"
                />
              ) : null}
            </g>
          );
        })}

        {routePath ? (
          <g filter={`url(#route-glow-${theme})`}>
            <path d={routePath} fill="none" stroke="#bdf3ff" strokeWidth="0.34" strokeLinecap="round" opacity="0.42" />
            <path d={routePath} fill="none" stroke="#38d6ff" strokeWidth="0.2" strokeLinecap="round" />
          </g>
        ) : null}

        {targetSlot ? (
          <g filter={`url(#target-glow-${theme})`}>
            <circle cx={targetSlot.x} cy={targetSlot.y} r="0.4" fill="#fecaca" opacity="0.4" />
            <circle cx={targetSlot.x} cy={targetSlot.y} r="0.24" fill="#ef4444" />
            <rect x={targetSlot.x - 0.12} y={targetSlot.y - 0.12} width="0.24" height="0.24" fill="#fff5f5" opacity="0.85" />
          </g>
        ) : null}
      </svg>
    </div>
  );
}
