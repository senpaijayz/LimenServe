import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
    ChevronDown,
    ChevronUp,
    Database,
    Eye,
    FolderOpen,
    Grid3X3,
    Home,
    Lock,
    Move,
    Plus,
    Printer,
    RotateCcw,
    RotateCw,
    Save,
    Search,
    Star,
    Target,
    Trash2,
    Type,
    Unlock,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { OBJECT_TYPES, usePartsMappingStore } from './usePartsMappingStore';
import { useToast } from '../../components/ui/Toast';
import { getStockroomItemDetails, searchStockroomItems } from '../../services/stockroomApi';
import MitsubishiGenuinePartsLabel from '../inventory/components/MitsubishiGenuinePartsLabel';
import ProductLabelPreviewModal from '../inventory/components/ProductLabelPreviewModal';

const Scene3D = lazy(() => import('./Scene3D'));

function formatLocatorLocation(item: any, details?: any) {
    const source = details?.location || item;
    const parts = [
        source?.floor?.name || source?.floor?.code,
        source?.zone?.code,
        source?.aisle?.code,
        source?.shelf?.code,
        source?.slot?.slotLabel || source?.slot?.number,
    ].filter(Boolean);

    return parts.join(' • ') || 'Unassigned';
}

function parseAisleCode(value: string | undefined) {
    const match = String(value || '').toUpperCase().match(/[A-Z]+/);
    return match ? match[0] : null;
}

function parseShelfNumber(value: string | undefined) {
    const match = String(value || '').match(/(\d+)/);
    return match ? Number(match[1]) : null;
}

function SearchBar({ onPartSelect, disabled }: { onPartSelect: (part: any) => Promise<void>; disabled?: boolean }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        let active = true;

        if (!query.trim() || disabled) {
            setResults([]);
            setIsSearching(false);
            return () => {
                active = false;
            };
        }

        const timeoutId = window.setTimeout(async () => {
            try {
                setIsSearching(true);
                const matches = await searchStockroomItems(query.trim());
                if (active) {
                    setResults(matches.slice(0, 10));
                }
            } catch {
                if (active) {
                    setResults([]);
                }
            } finally {
                if (active) {
                    setIsSearching(false);
                }
            }
        }, 180);

        return () => {
            active = false;
            window.clearTimeout(timeoutId);
        };
    }, [query, disabled]);

    return (
        <div className="w-full lg:max-w-[460px]" style={{ position: 'relative' }}>
            <div className="relative flex items-center w-full">
                <Search className="absolute left-3 text-slate-400" size={18} />
                <input
                    type="text"
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl pl-10 pr-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all shadow-inner"
                    placeholder="Search by part number, name, category, or scan..."
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    disabled={disabled}
                />
            </div>

            {results.length > 0 && query && (
                <div
                    style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        background: '#1e293b',
                        border: '1px solid #374151',
                        borderRadius: 8,
                        marginTop: 4,
                        zIndex: 9999,
                        overflow: 'hidden',
                    }}
                >
                    {results.map((result) => (
                        <button
                            key={result.productId}
                            type="button"
                            className="w-full px-3 py-3 text-left transition hover:bg-slate-700"
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}
                            onClick={() => {
                                void onPartSelect(result);
                                setQuery('');
                                setResults([]);
                            }}
                        >
                            <div>
                                <div style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>{result.sku}</div>
                                <div style={{ color: '#cbd5e1', fontSize: 12 }}>{result.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#f87171', fontSize: 12, fontWeight: 700 }}>{formatLocatorLocation(result)}</div>
                                <div style={{ color: '#86efac', fontSize: 11 }}>{result.category || 'General Parts & Accessories'}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {isSearching && query && (
                <div style={{ marginTop: 8, color: '#94a3b8', fontSize: 12 }}>
                    Searching live stockroom index...
                </div>
            )}
        </div>
    );
}

export default function PartsMapping() {
    const store = usePartsMappingStore();
    const initializePartsMapping = usePartsMappingStore((state) => state.initialize);
    const { success, error: showError } = useToast();
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
    const [saveAsModal, setSaveAsModal] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [labelInput, setLabelInput] = useState('');
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedRouteDetails, setSelectedRouteDetails] = useState<any | null>(null);
    const [showLabelPreview, setShowLabelPreview] = useState(false);
    const [showMobileScene, setShowMobileScene] = useState(false);
    const [isLargeViewport, setIsLargeViewport] = useState(true);
    const [isLocatingPart, setIsLocatingPart] = useState(false);
    const layoutMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        void initializePartsMapping();
    }, [initializePartsMapping]);

    useEffect(() => {
        const media = window.matchMedia('(min-width: 1024px)');
        const syncViewport = () => setIsLargeViewport(media.matches);

        syncViewport();
        media.addEventListener('change', syncViewport);

        return () => media.removeEventListener('change', syncViewport);
    }, []);

    const selectedObj = store.layout.objects.find((object) => object.id === store.selectedId);

    useEffect(() => {
        if (selectedObj) {
            setLabelInput(selectedObj.label || '');
        }
    }, [selectedObj]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (layoutMenuRef.current && !layoutMenuRef.current.contains(event.target as Node)) {
                setLayoutMenuOpen(false);
            }
        };

        if (layoutMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [layoutMenuOpen]);

    const clearSelection = () => {
        setSelectedItem(null);
        setSelectedRouteDetails(null);
        store.setHighlightedPart(null);
        store.setPathPoints([]);
    };

    const handlePartSearch = async (part: any) => {
        try {
            setIsLocatingPart(true);
            const details = await getStockroomItemDetails(part.productId, store.currentFloor);
            const aisleCode = parseAisleCode(details?.location?.aisle?.code || part?.aisle?.code);
            const shelfNumber = parseShelfNumber(details?.location?.shelf?.code || part?.shelf?.code);
            const shelfObj = store.layout.objects.find((object) => (
                (object.type === 'shelf' || object.type === 'shelf2')
                && object.aisle === aisleCode
                && object.shelfNum === shelfNumber
            ));
            const targetFloor = Number(details?.targetFloor || part?.floor?.floorNumber || store.currentFloor);
            const locationCode = [
                details?.location?.aisle?.code || part?.aisle?.code,
                details?.location?.shelf?.code || part?.shelf?.code,
            ].filter(Boolean).join('-');

            setSelectedItem({
                ...part,
                category: details?.item?.category || part?.category,
                sourceCategory: details?.item?.sourceCategory || part?.sourceCategory || null,
                classification: details?.item?.classification || part?.classification || null,
            });
            setSelectedRouteDetails(details);

            if (store.currentFloor !== targetFloor) {
                store.setFloor(targetFloor);
            }

            if (!shelfObj) {
                store.setHighlightedPart({
                    ...part,
                    position: { x: 0, y: 1.5, z: 0 },
                    floor: targetFloor,
                    description: part.name,
                    location_code: locationCode,
                    isVirtual: true,
                });
                store.setPathPoints([]);
                success(`Located ${part.sku}.`);
                return;
            }

            store.setHighlightedPart({
                ...part,
                position: { x: shelfObj.x, y: 1.5, z: shelfObj.z },
                floor: shelfObj.floor,
                description: part.name,
                location_code: locationCode,
            });

            try {
                const { findPath } = await import('./objects3d');
                const entrance = store.layout.objects.find((object) => object.type === 'entrance' || object.type === 'counter') || { x: 0, z: 0 };
                const path = findPath(
                    new window.THREE.Vector3(entrance.x, 0.5, entrance.z),
                    new window.THREE.Vector3(shelfObj.x, 0.5, shelfObj.z),
                    store.layout.objects,
                    shelfObj.floor
                );
                store.setPathPoints(path);
            } catch {
                store.setPathPoints([]);
            }

            success(`Located ${part.sku}.`);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to locate the selected part.');
        } finally {
            setIsLocatingPart(false);
        }
    };

    const stats = store.stats();

    const handleSaveLayout = async () => {
        try {
            await store.saveLayout();
            success('Layout saved to database.');
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to save layout.');
        }
    };

    const handleSaveLayoutAs = async () => {
        const trimmedName = saveName.trim();
        if (!trimmedName) {
            return;
        }

        try {
            await store.saveLayoutAs(trimmedName);
            setSaveAsModal(false);
            setSaveName('');
            success(`Saved layout "${trimmedName}".`);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to save layout.');
        }
    };

    const handleDeleteLayout = async (layoutId: string, layoutName: string) => {
        try {
            await store.deleteLayout(layoutId);
            success(`Deleted "${layoutName}".`);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to delete layout.');
        }
    };

    const handleSetPriorityLayout = async (layoutId: string, layoutName: string) => {
        try {
            await store.setPriorityLayout(layoutId);
            success(`"${layoutName}" is now the priority layout.`);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to set priority layout.');
        }
    };

    return (
        <div className="stockroom-viewer animate-fade-in min-h-[calc(100dvh-100px)] rounded-2xl border border-slate-800/50 bg-[#0a0f1a] p-3 pb-10 text-white shadow-2xl sm:p-6">
            <header className="page-header">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="w-full min-w-0">
                        <h1 className="mb-1 text-2xl font-bold tracking-tight sm:text-3xl">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                                {store.currentFloor === 1 ? '1st' : '2nd'} Floor
                            </span>{' '}
                            <span className="text-white">- Parts Mapping</span>
                            {store.editMode && <span className="ml-3 text-base text-red-400">DESIGN MODE</span>}
                        </h1>
                        <p className="text-slate-400 text-sm font-medium">
                            {store.editMode ? 'Drag to move and update the digital twin layout.' : 'Interactive 3D digital twin with live stockroom routing.'}
                        </p>
                        <div style={{ marginTop: 16 }}>
                            <SearchBar onPartSelect={handlePartSearch} disabled={store.editMode} />
                        </div>
                    </div>

                    <div className="flex w-full flex-wrap gap-2 lg:w-auto lg:justify-end">
                        <div className="btn-group flex gap-0" style={{ borderRadius: 8, overflow: 'hidden' }}>
                            <button
                                className={`btn ${store.currentFloor === 1 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => store.setFloor(1)}
                                style={{ borderRadius: '8px 0 0 8px', borderRight: 'none' }}
                                disabled={store.isTransitioning}
                            >
                                <ChevronDown size={16} /> F1
                            </button>
                            <button
                                className={`btn ${store.currentFloor === 2 ? 'btn-primary' : 'btn-outline'}`}
                                onClick={() => store.setFloor(2)}
                                style={{ borderRadius: '0 8px 8px 0' }}
                                disabled={store.isTransitioning}
                            >
                                <ChevronUp size={16} /> F2
                            </button>
                        </div>

                        <button className={`btn ${store.viewMode === '2d' ? 'btn-secondary' : 'btn-outline'}`} onClick={store.toggleViewMode}>
                            {store.viewMode === '2d' ? <Eye size={18} /> : <Grid3X3 size={18} />}
                            {store.viewMode === '2d' ? '3D View' : '2D View'}
                        </button>

                        <button className={`btn ${store.editMode ? 'btn-primary' : 'btn-outline'}`} onClick={store.toggleDesignMode}>
                            <Move size={18} /> {store.editMode ? 'Exit Design' : 'Design Mode'}
                        </button>
                    </div>
                </div>
            </header>

            {store.highlightedPart && !store.editMode && (
                <div className="card shadow-glow-primary mb-4" style={{ borderColor: '#DC2626' }}>
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px_auto] xl:items-start">
                        <div className="flex items-start gap-4">
                            <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--gradient-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Target size={24} color="white" />
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <h3 className="font-bold text-lg text-white">Navigating to: {selectedItem?.sku || 'Selected Part'}</h3>
                                    <p className="text-gray-300">
                                        {selectedItem?.name || store.highlightedPart.description} • Category:{' '}
                                        <strong className="text-white">{selectedItem?.category || selectedRouteDetails?.item?.category || 'General Parts & Accessories'}</strong>
                                    </p>
                                    <p className="mt-1 text-gray-400">
                                        Location:{' '}
                                        <strong className="text-white">
                                            {formatLocatorLocation(selectedItem, selectedRouteDetails) || store.highlightedPart.location_code || 'Unknown'}
                                        </strong>
                                    </p>
                                </div>

                                {selectedRouteDetails?.steps?.length > 0 && (
                                    <div className="space-y-2">
                                        {selectedRouteDetails.steps.slice(0, 3).map((step: string, index: number) => (
                                            <div key={`${step}-${index}`} className="flex items-start gap-2 text-sm text-gray-300">
                                                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[11px] font-bold text-white">{index + 1}</span>
                                                <span>{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex flex-wrap gap-2">
                                    <button className="btn btn-outline" onClick={() => setShowLabelPreview(true)}>
                                        <Printer size={16} /> Open Label
                                    </button>
                                    {isLocatingPart && (
                                        <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-slate-200">
                                            Resolving live route...
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {selectedItem && (
                            <div className="w-full max-w-[320px]">
                                <MitsubishiGenuinePartsLabel product={selectedItem} size="compact" />
                            </div>
                        )}

                        <button className="btn btn-ghost btn-icon self-start" onClick={clearSelection}>
                            <X size={20} />
                        </button>
                    </div>
                </div>
            )}

            {store.initializationError && (
                <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    {store.initializationError}
                </div>
            )}

            {store.editMode && (
                <div className="card mb-4" style={{ position: 'relative', zIndex: 100 }}>
                    <div className="flex gap-4 flex-wrap items-center">
                        <div style={{ position: 'relative' }}>
                            <button className="btn btn-secondary" onClick={() => setAddMenuOpen((value) => !value)}>
                                <Plus size={18} /> Add
                            </button>

                            {addMenuOpen && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        zIndex: 9999,
                                        background: '#1e293b',
                                        border: '1px solid #374151',
                                        borderRadius: 8,
                                        marginTop: 4,
                                        width: 220,
                                        maxHeight: 400,
                                        overflowY: 'auto',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                    }}
                                >
                                    {Object.entries(OBJECT_TYPES).map(([key, value]) => (
                                        <button
                                            key={key}
                                            type="button"
                                            onClick={() => {
                                                store.addObject(key);
                                                setAddMenuOpen(false);
                                            }}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-3"
                                        >
                                            <span className="text-lg">{value.icon}</span> {value.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="w-px h-6 bg-gray-600 mx-1" />

                        {selectedObj ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-gray-400 text-sm mr-2">Selected: <strong className="text-white">{selectedObj.label}</strong></span>
                                <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(-Math.PI / 4)} title="Rotate Left"><RotateCcw size={16} /></button>
                                <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(Math.PI / 4)} title="Rotate Right"><RotateCw size={16} /></button>
                                <button className={`btn btn-sm ${selectedObj.locked ? 'btn-primary' : 'btn-outline'}`} onClick={() => store.toggleLock(selectedObj.id)} title="Lock Object">
                                    {selectedObj.locked ? <Lock size={16} /> : <Unlock size={16} />}
                                </button>
                                <input
                                    type="text"
                                    className="form-input py-1 px-3 text-sm w-32"
                                    value={labelInput}
                                    onChange={(event) => setLabelInput(event.target.value)}
                                    onBlur={() => store.updateLabel(selectedObj.id, labelInput)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            store.updateLabel(selectedObj.id, labelInput);
                                        }
                                    }}
                                    placeholder="Label"
                                />
                                <button className="btn btn-outline btn-sm" onClick={() => store.updateLabel(selectedObj.id, labelInput)}><Type size={16} /></button>
                                <button className="btn btn-outline btn-sm text-error border-error/50 hover:bg-error hover:text-white ml-2" onClick={store.deleteSelected}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ) : (
                            <span className="text-gray-400 text-sm">Select an object on the floor to edit it.</span>
                        )}

                        <div className="flex-1" />

                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-gray-400 text-sm flex items-center gap-2">
                                <Database size={14} /> {store.currentLayoutName}
                            </span>

                            <div ref={layoutMenuRef} style={{ position: 'relative' }}>
                                <button className="btn btn-outline" onClick={() => setLayoutMenuOpen((value) => !value)}>
                                    <FolderOpen size={18} /> Load
                                </button>

                                {layoutMenuOpen && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: '100%',
                                            right: 0,
                                            zIndex: 9999,
                                            background: '#1e293b',
                                            border: '1px solid #374151',
                                            borderRadius: 8,
                                            marginTop: 4,
                                            width: 320,
                                            maxHeight: 300,
                                            overflowY: 'auto',
                                            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
                                        }}
                                    >
                                        {store.savedLayouts.length === 0 ? (
                                            <div className="p-4 text-center text-gray-400">No layouts found</div>
                                        ) : (
                                            store.savedLayouts.map((layout) => (
                                                <div
                                                    key={layout.id}
                                                    className="p-3 border-b border-gray-700/50 hover:bg-gray-700 transition flex items-center justify-between gap-3"
                                                    style={{
                                                        borderLeft: layout.is_default ? '3px solid #DC2626' : '3px solid transparent',
                                                        background: store.currentLayoutId === layout.id ? '#334155' : 'transparent',
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        className="flex-1 text-left overflow-hidden"
                                                        onClick={() => {
                                                            store.loadLayout(layout);
                                                            setLayoutMenuOpen(false);
                                                        }}
                                                    >
                                                        <div className="text-white text-sm font-bold flex items-center gap-2">
                                                            {layout.name}
                                                            {layout.is_default && <span className="text-xs text-primary bg-primary/20 px-2 py-0.5 rounded">PRIORITY</span>}
                                                        </div>
                                                        <div className="text-gray-400 text-xs truncate mt-1">{layout.description}</div>
                                                    </button>

                                                    <div className="flex gap-1">
                                                        <button
                                                            type="button"
                                                            className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-primary transition"
                                                            onClick={() => void handleSetPriorityLayout(layout.id, layout.name)}
                                                            title="Set Priority"
                                                        >
                                                            <Star size={14} fill={layout.is_default ? '#DC2626' : 'none'} color={layout.is_default ? '#DC2626' : 'currentColor'} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="p-1.5 hover:bg-gray-600 rounded text-gray-400 hover:text-error transition"
                                                            onClick={() => {
                                                                if (!layout.is_default && window.confirm(`Delete ${layout.name}?`)) {
                                                                    void handleDeleteLayout(layout.id, layout.name);
                                                                }
                                                            }}
                                                            title="Delete"
                                                            disabled={layout.is_default}
                                                            style={{ opacity: layout.is_default ? 0.3 : 1 }}
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>

                            <button className="btn btn-secondary" onClick={() => void handleSaveLayout()}><Save size={18} /> Save</button>
                            <button className="btn btn-outline" onClick={() => setSaveAsModal(true)}><Plus size={18} /> Save As</button>
                            <button
                                className="btn btn-outline"
                                onClick={() => {
                                    if (window.confirm('Reset layout to default?')) {
                                        store.resetLayout();
                                    }
                                }}
                                title="Reset layout"
                            >
                                <Home size={18} />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {!isLargeViewport && !showMobileScene && (
                <div className="mb-4 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 lg:hidden">
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Mobile locator mode</p>
                            <h2 className="mt-2 text-lg font-semibold text-white">Search a part first, then open 3D only when needed.</h2>
                            <p className="mt-2 text-sm text-slate-400">
                                Floor {store.currentFloor} is ready with {stats.shelves} shelves in the locator shell.
                            </p>
                        </div>

                        {selectedItem && (
                            <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                                <p className="text-sm font-semibold text-white">{selectedItem.sku}</p>
                                <p className="text-sm text-slate-300">{selectedItem.name}</p>
                                <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-red-300">
                                    {formatLocatorLocation(selectedItem, selectedRouteDetails)}
                                </p>
                            </div>
                        )}

                        <button className="btn btn-secondary w-full" onClick={() => setShowMobileScene(true)}>
                            <Eye size={18} /> Open 3D View
                        </button>
                    </div>
                </div>
            )}

            {(isLargeViewport || showMobileScene) && (
            <div className="card h-[min(520px,calc(100dvh-9rem))] shadow-inner lg:h-[600px]" style={{ padding: 0, overflow: 'hidden', position: 'relative', background: '#070b14', border: '1px solid #1e293b' }}>
                {!isLargeViewport && (
                    <button
                        className="absolute right-4 top-4 z-[120] rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-sm font-semibold text-white"
                        onClick={() => setShowMobileScene(false)}
                    >
                        Close 3D
                    </button>
                )}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, #1e293b, #0f172a)',
                        zIndex: store.isTransitioning ? 100 : -1,
                        opacity: store.isTransitioning ? 1 : 0,
                        transition: 'opacity 0.3s ease-in-out',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    <div className="px-4 text-center text-white">
                        <div className="text-5xl mb-4 text-primary">{store.currentFloor === 1 ? <ChevronDown size={64} className="mx-auto" /> : <ChevronUp size={64} className="mx-auto" />}</div>
                        <div className="text-2xl font-bold">Switching to {store.currentFloor === 1 ? '1st' : '2nd'} Floor...</div>
                    </div>
                </div>

                {!store.isLoading && (
                    <Canvas camera={{ position: store.viewMode === '2d' ? [0, 40, 0.1] : [0, 20, 25], fov: 50 }}>
                        <Suspense fallback={null}>
                            <Scene3D />
                        </Suspense>
                    </Canvas>
                )}

                {store.isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-50">
                        <div className="flex items-center gap-3 px-4 text-base font-bold text-white sm:text-lg">
                            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            Loading Warehouse Digital Twin...
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-xl border border-gray-700 bg-gray-900/90 p-3 backdrop-blur sm:p-4">
                    <div className="text-xs font-bold text-gray-400 mb-2">{store.currentFloor === 1 ? '1ST FLOOR' : '2ND FLOOR'}</div>
                    <div className="text-sm flex flex-col gap-1 text-white">
                        <span>Shelves: {store.layout.objects.filter((object) => object.floor === store.currentFloor && (object.type === 'shelf' || object.type === 'shelf2')).length}</span>
                        <span>Counters: {store.layout.objects.filter((object) => object.floor === store.currentFloor && object.type === 'counter').length}</span>
                        <span>Entrances: {store.layout.objects.filter((object) => object.floor === store.currentFloor && object.type === 'entrance').length}</span>
                    </div>
                </div>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                    <button
                        className="w-10 h-10 rounded-lg bg-gray-900/90 border border-gray-700 text-white flex items-center justify-center hover:bg-gray-800 focus:outline-none"
                        onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }))}
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        className="w-10 h-10 rounded-lg bg-gray-900/90 border border-gray-700 text-white flex items-center justify-center hover:bg-gray-800 focus:outline-none"
                        onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))}
                    >
                        <ZoomOut size={20} />
                    </button>
                </div>

                <div className="absolute bottom-4 right-4 hidden rounded-lg bg-gray-900/80 px-4 py-2 text-sm text-gray-300 sm:block">
                    {store.viewMode === '2d' ? '2D View • Drag to pan' : '3D View • Drag to rotate • Scroll to zoom'}
                </div>
            </div>

            )}

            <div className="grid grid-cols-1 gap-4 mt-6 md:grid-cols-4">
                {[
                    { id: 'shelves', label: 'Shelves', total: stats.shelves },
                    { id: 'counters', label: 'Counters', total: stats.counters },
                    { id: 'entrances', label: 'Entrances', total: stats.entrances },
                    { id: 'floors', label: 'Floors', total: stats.floors },
                ].map((item) => (
                    <div key={item.id} className="card bg-[#0f172a] border-slate-800">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl flex items-center justify-center shadow-glow-primary text-2xl" style={{ background: 'var(--gradient-primary)' }}>
                                <Database size={24} color="white" />
                            </div>
                            <div>
                                <h4 className="font-bold text-3xl text-white tracking-tight">{item.total}</h4>
                                <p className="text-slate-400 text-sm uppercase font-bold tracking-wider mt-1">{item.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {saveAsModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-800 p-4 shadow-2xl sm:p-6">
                        <h3 className="text-xl font-bold mb-4 text-white">Save Layout As...</h3>
                        <div className="form-group mb-6">
                            <label className="form-label">Layout Name</label>
                            <input
                                type="text"
                                className="form-input w-full"
                                placeholder="e.g. Optimized Store Layout"
                                value={saveName}
                                onChange={(event) => setSaveName(event.target.value)}
                                autoFocus
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && saveName.trim()) {
                                        void handleSaveLayoutAs();
                                    }
                                }}
                            />
                        </div>
                        <div className="flex flex-col justify-end gap-3 sm:flex-row">
                            <button className="btn btn-outline" onClick={() => setSaveAsModal(false)}>Cancel</button>
                            <button className="btn btn-primary" disabled={!saveName.trim()} onClick={() => void handleSaveLayoutAs()}>
                                Save Layout
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ProductLabelPreviewModal
                isOpen={showLabelPreview}
                onClose={() => setShowLabelPreview(false)}
                product={selectedItem}
                routeDetails={selectedRouteDetails}
                locationLabel={formatLocatorLocation(selectedItem, selectedRouteDetails)}
                title="Stockroom Label Preview"
            />
        </div>
    );
}
