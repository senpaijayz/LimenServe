import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
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
  const padding = 2.2;
  const baseWidth = width + padding * 2;
  const baseHeight = depth + padding * 2;
  const viewWidth = baseWidth / zoomLevel;
  const viewHeight = baseHeight / zoomLevel;

  return {
    x: width / 2 - (viewWidth / 2),
    y: depth / 2 - (viewHeight / 2),
    width: viewWidth,
    height: viewHeight,
  };
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

function buildRoutePath(points: Vec2[]) {
  if (!points.length) {
    return '';
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const commands: string[] = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = points[index - 1];
    const cx = (previous.x + current.x) / 2;
    const cy = (previous.y + current.y) / 2;
    commands.push(`Q ${previous.x} ${previous.y} ${cx} ${cy}`);
  }

  const tail = points[points.length - 1];
  commands.push(`T ${tail.x} ${tail.y}`);
  return commands.join(' ');
}

function entityBounds(entity: SceneEntity) {
  return {
    x: entity.position.x - entity.size.x / 2,
    y: entity.position.y - entity.size.z / 2,
    width: entity.size.x,
    height: entity.size.z,
  };
}

function ZoneShape({
  entity,
  selected,
  theme,
}: {
  entity: SceneEntity;
  selected: boolean;
  theme: 'viewer' | 'admin';
}) {
  const bounds = entityBounds(entity);
  const palette = theme === 'admin' ? ADMIN_SCENE_THEME : VIEWER_SCENE_THEME;
  const zoneFill = entity.style.zoneColor ?? (entity.position.x < entity.size.x ? palette.zoneLeft : palette.zoneRight);

  return (
    <g opacity={selected ? 0.92 : 0.72}>
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.width}
        height={bounds.height}
        rx={0.5}
        fill={zoneFill}
        fillOpacity={theme === 'admin' ? 0.16 : 0.13}
        stroke={zoneFill}
        strokeOpacity={0.35}
        strokeWidth={0.05}
      />
      <text
        x={entity.position.x}
        y={entity.position.y}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.34}
        fontWeight={700}
        letterSpacing="0.08em"
        fill={palette.zoneLabel}
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
  const bounds = entityBounds(entity);
  const bays = entity.style.variant === '3-bay' || entity.size.x >= 3.2 ? 3 : 2;
  const edge = target ? '#ff879b' : selected ? '#45e1ff' : '#38516c';

  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.24}
        fill="url(#plan-shelf-fill)"
        stroke={edge}
        strokeWidth={selected || target ? 0.12 : 0.06}
      />
      <rect
        x={-entity.size.x / 2 + 0.08}
        y={-entity.size.z / 2 + 0.08}
        width={entity.size.x - 0.16}
        height={0.18}
        rx={0.08}
        fill="#eff9ff"
        opacity={0.95}
      />
      {Array.from({ length: bays - 1 }).map((_, index) => {
        const x = -entity.size.x / 2 + ((index + 1) * entity.size.x) / bays;
        return (
          <line
            key={`${entity.entityKey}-divider-${index}`}
            x1={x}
            y1={-entity.size.z / 2 + 0.16}
            x2={x}
            y2={entity.size.z / 2 - 0.12}
            stroke="#5a7897"
            strokeWidth={0.05}
          />
        );
      })}
      <text
        x={0}
        y={0.05}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={0.2}
        fontWeight={800}
        letterSpacing="0.05em"
        fill={target ? '#fff1f3' : '#dff6ff'}
      >
        {entity.label}
      </text>
      {selected || target ? (
        <rect
          x={bounds.x - entity.position.x - 0.1}
          y={bounds.y - entity.position.y - 0.1}
          width={bounds.width + 0.2}
          height={bounds.height + 0.2}
          rx={0.3}
          fill="none"
          stroke={edge}
          strokeOpacity={0.55}
          strokeWidth={0.04}
          strokeDasharray="0.14 0.1"
        />
      ) : null}
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
        fill={lowered ? '#2f5166' : '#15273d'}
        fillOpacity={lowered ? 0.22 : softened ? 0.58 : 0.92}
      />
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.08}
        fill="none"
        stroke={viewerMode ? '#5adfff' : '#4f6b8a'}
        strokeOpacity={lowered ? 0.22 : 0.14}
        strokeWidth={0.04}
      />
    </g>
  );
}

function BlockShape({
  entity,
  fill,
  stroke,
  textFill = '#ecf7ff',
  showLabel = true,
}: {
  entity: SceneEntity;
  fill: string;
  stroke?: string;
  textFill?: string;
  showLabel?: boolean;
}) {
  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.22}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke ? 0.06 : 0}
      />
      {showLabel ? (
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={0.18}
          fontWeight={700}
          fill={textFill}
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
  const steps = 7;
  const stepDepth = entity.size.z / steps;

  return (
    <g transform={`translate(${entity.position.x} ${entity.position.y}) rotate(${entity.rotation})`}>
      <rect
        x={-entity.size.x / 2}
        y={-entity.size.z / 2}
        width={entity.size.x}
        height={entity.size.z}
        rx={0.22}
        fill="#ba8452"
        stroke={selected ? '#45e1ff' : '#7f5633'}
        strokeWidth={0.06}
      />
      {Array.from({ length: steps }).map((_, index) => (
        <rect
          key={`${entity.entityKey}-step-${index}`}
          x={-entity.size.x / 2}
          y={-entity.size.z / 2 + stepDepth * index}
          width={entity.size.x}
          height={stepDepth - 0.02}
          fill={index % 2 === 0 ? '#d39d6d' : '#b77d49'}
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
  const floorWidth = floor?.width ?? 18;
  const floorDepth = floor?.depth ?? 16;
  const viewBox = useMemo(() => createViewBox(floorWidth, floorDepth, zoomLevel), [floorDepth, floorWidth, zoomLevel]);
  const getSvgPoint = useSvgPoint(svgRef, viewBox);
  const routePoints = selectedItemDetails?.segmentsByFloor?.[String(currentFloor)] ?? [];
  const routePath = useMemo(() => buildRoutePath(routePoints), [routePoints]);
  const targetShelfId = selectedItemDetails?.targetShelfId ?? null;
  const targetSlot = selectedItemDetails?.targetFloor === currentFloor ? selectedItemDetails.targetSlot : null;
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
    <div className="relative h-full min-h-[460px] w-full overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(61,223,255,0.12),_transparent_26%),linear-gradient(180deg,#071122_0%,#040915_100%)]">
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
          <linearGradient id="plan-stage-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0b1a2d" />
            <stop offset="100%" stopColor="#112640" />
          </linearGradient>
          <linearGradient id="plan-floor-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f2f8fd" />
            <stop offset="100%" stopColor="#d7e6f3" />
          </linearGradient>
          <linearGradient id="plan-shelf-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#17283c" />
            <stop offset="100%" stopColor="#0d1826" />
          </linearGradient>
          <pattern id="plan-grid" width="1" height="1" patternUnits="userSpaceOnUse">
            <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(17,37,62,0.12)" strokeWidth="0.03" />
          </pattern>
          <filter id="plan-route-glow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="0.18" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect
          x={-1}
          y={-1}
          width={floorWidth + 2}
          height={floorDepth + 2}
          rx="1.4"
          fill="#122741"
          opacity="0.86"
        />

        <rect x="0" y="0" width={floorWidth} height={floorDepth} rx="0.95" fill="url(#plan-stage-fill)" />
        <rect x="0.36" y="0.36" width={floorWidth - 0.72} height={floorDepth - 0.72} rx="0.7" fill="url(#plan-floor-fill)" />
        <rect x="0.36" y="0.36" width={floorWidth - 0.72} height={floorDepth - 0.72} rx="0.7" fill="url(#plan-grid)" />

        <rect x={floorWidth * 0.42} y={floorDepth - 0.94} width={floorWidth * 0.16} height={0.4} rx={0.2} fill="#dff7ff" opacity={0.68} />

        {activeEntities.filter((entity) => entity.kind === 'zone_overlay').map((entity) => (
          <g key={entity.entityKey} onPointerDown={(event) => handlePointerDown(entity, event)}>
            <ZoneShape entity={entity} selected={selectedEntityKey === entity.entityKey} theme={theme} />
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
          } else if (entity.kind === 'cashier_counter') {
            shape = <BlockShape entity={entity} fill="#f3f8fc" stroke="#41ddff" textFill="#0f172a" />;
          } else if (entity.kind === 'comfort_room') {
            shape = <BlockShape entity={entity} fill="#dbe7f2" stroke="#6a87a7" textFill="#102033" />;
          } else if (entity.kind === 'door') {
            shape = <BlockShape entity={entity} fill="#dff6ff" stroke="#41ddff" textFill="#0f172a" showLabel={false} />;
          } else if (entity.kind === 'entrance') {
            shape = <BlockShape entity={entity} fill="#ff4c67" stroke="#ff90a3" showLabel={false} />;
          } else if (entity.kind === 'stairs') {
            shape = <StairShape entity={entity} selected={selected} />;
          }

          return (
            <g key={entity.entityKey} onPointerDown={(event) => handlePointerDown(entity, event)}>
              {shape}
            </g>
          );
        })}

        {routePath ? (
          <g filter="url(#plan-route-glow)">
            <path d={routePath} fill="none" stroke="#d6fbff" strokeWidth="0.54" strokeLinecap="round" strokeLinejoin="round" opacity="0.32" />
            <path d={routePath} fill="none" stroke="#34e1ff" strokeWidth="0.24" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ) : null}

        {targetSlot ? (
          <g filter="url(#plan-route-glow)">
            <circle cx={targetSlot.x} cy={targetSlot.y} r="0.58" fill="#ff8c9f" opacity="0.22" />
            <circle cx={targetSlot.x} cy={targetSlot.y} r="0.24" fill="#ff4c67" />
          </g>
        ) : null}
      </svg>

      <div className="pointer-events-none absolute left-4 top-4 rounded-2xl border border-white/10 bg-slate-950/72 px-4 py-3 text-white shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">Plan Mode</p>
        <p className="mt-2 text-sm font-semibold">Floor {currentFloor}</p>
        <p className="mt-1 text-xs text-slate-400">{editable ? 'Drag objects to reposition' : 'Precision path overlay'}</p>
      </div>

      <div className="pointer-events-none absolute bottom-4 right-4 rounded-2xl border border-white/10 bg-slate-950/72 px-4 py-3 text-xs text-slate-300 shadow-[0_18px_40px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        Cyan route = live guidance
        <br />
        Red marker = target slot
      </div>
    </div>
  );
}
