import { useMemo } from 'react';
import { isShelfObject, normalizeAisle } from '../data/locatorScene';
import { useLocator3DStore } from '../store/useLocator3DStore';
import { getFloorBounds } from '../utils/locatorViewport';

export default function StockroomFloorPlan({ onShelfClick }) {
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const bounds = useMemo(() => getFloorBounds(sceneObjects, activeFloor), [sceneObjects, activeFloor]);
    const objects = sceneObjects.filter((object) => object.type !== 'floor' && object.type !== 'wall' && object.type !== 'walls'
        && (Number(object.floor || 1) === activeFloor || object.type === 'stairs'));
    const activate = (object) => {
        if (object.type === 'stairs') useLocator3DStore.getState().goToFloor(activeFloor === 1 ? 2 : 1);
        else if (isShelfObject(object)) onShelfClick?.(object);
    };

    return (
        <section aria-label={`Floor ${activeFloor} floor plan`} className="flex h-full flex-col bg-slate-50 p-4 sm:p-6">
            <div className="pr-16">
                <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Floor {activeFloor} · Floor plan</p>
                <p className="mt-1 text-xs text-slate-600">Select a shelf to see its parts. Select stairs to change floors.</p>
            </div>
            <svg aria-label={`Floor ${activeFloor} shelf positions`} className="min-h-0 w-full flex-1" viewBox={`${bounds.x - bounds.width / 2 - 2} ${bounds.z - bounds.depth / 2 - 2} ${bounds.width + 4} ${bounds.depth + 4}`}>
                <rect x={bounds.x - bounds.width / 2} y={bounds.z - bounds.depth / 2} width={bounds.width} height={bounds.depth} rx="0.2" fill="white" stroke="#cbd5e1" strokeWidth="0.12" />
                {objects.map((object) => {
                    const [x = 0, , z = 0] = object.position || [];
                    const { width = 1, depth = 1 } = object.dimensions || {};
                    const shelf = isShelfObject(object);
                    const stairs = object.type === 'stairs';
                    const located = locatedProduct?.shelfObjectId === object.id;
                    const interactive = stairs || (shelf && Boolean(onShelfClick));
                    const label = stairs ? `Stairs to Floor ${activeFloor === 1 ? 2 : 1}` : object.name;
                    return (
                        <g key={object.id} role={interactive ? 'button' : undefined} tabIndex={interactive ? 0 : undefined}
                            aria-label={label} onClick={() => activate(object)}
                            onKeyDown={(event) => { if (interactive && ['Enter', ' '].includes(event.key)) { event.preventDefault(); activate(object); } }}
                            className={interactive ? 'cursor-pointer outline-none [&:focus-visible>rect]:stroke-blue-600 [&:focus-visible>rect]:stroke-[0.2] [&:hover>rect]:brightness-95' : ''}
                            transform={`translate(${x} ${z}) rotate(${-Number(object.rotation?.[1] || 0) * 180 / Math.PI})`}>
                            <title>{label}</title>
                            <rect x={-width / 2} y={-depth / 2} width={width} height={depth} rx="0.1"
                                fill={located ? '#fef08a' : shelf ? '#dbeafe' : stairs ? '#fef3c7' : '#e2e8f0'}
                                stroke={located ? '#ca8a04' : shelf ? '#2563eb' : stairs ? '#b45309' : '#64748b'} strokeWidth={located ? 0.16 : 0.07} />
                            {shelf && [-0.25, 0.25].map((offset) => <line key={offset} x1={width * offset} x2={width * offset} y1={-depth / 2} y2={depth / 2} stroke="#93c5fd" strokeWidth="0.04" />)}
                            <text textAnchor="middle" dominantBaseline="central" fontSize={Math.min(0.36, depth * 0.42)} fontWeight="700" fill="#1e293b" pointerEvents="none">
                                {shelf ? `${normalizeAisle(object.aisle)}-${object.shelfNumber || ''}` : stairs ? (activeFloor === 1 ? 'UP ↑' : 'DOWN ↓') : object.type === 'counter-computer' ? 'COUNTER' : object.type === 'entrance-door' ? 'DOOR' : ''}
                            </text>
                        </g>
                    );
                })}
            </svg>
            <div className="flex flex-wrap justify-center gap-4 text-[11px] font-medium text-slate-600">
                <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-blue-500 bg-blue-100" />Shelf</span>
                <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-amber-500 bg-amber-100" />Stairs</span>
                <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm border border-yellow-600 bg-yellow-200" />Located part</span>
            </div>
        </section>
    );
}
