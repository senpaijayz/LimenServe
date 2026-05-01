import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
    AlertTriangle,
    Box,
    ChevronDown,
    ChevronUp,
    CheckCircle2,
    Database,
    Eye,
    FolderOpen,
    Grid3X3,
    Home,
    Layers3,
    Lock,
    Move,
    Plus,
    Printer,
    RotateCcw,
    RotateCw,
    Ruler,
    Save,
    Search,
    SlidersHorizontal,
    Star,
    Target,
    Trash2,
    Type,
    Unlock,
    X,
    ZoomIn,
    ZoomOut,
} from 'lucide-react';
import { getDefaultObjectSize, OBJECT_TYPES, SIZE_LIMITS, usePartsMappingStore } from './usePartsMappingStore';
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

const OBJECT_GROUPS = [
    { label: 'Fixtures', items: ['shelf', 'shelf2', 'counter', 'table', 'stand', 'signage', 'label'] },
    { label: 'Structure', items: ['floor', 'wall', 'room', 'stairs', 'entrance', 'parking'] },
];

function formatNumber(value: number | undefined) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return '';
    return Number(numericValue.toFixed(2)).toString();
}

function formatLastSaved(value: string | null) {
    if (!value) return 'Not saved yet';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Saved recently';
    return `Saved ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function ValidatedNumberInput({
    label,
    value,
    min = SIZE_LIMITS.min,
    max,
    step = 0.1,
    onValidChange,
}: {
    label: string;
    value: number;
    min?: number;
    max: number;
    step?: number;
    onValidChange: (value: number) => void;
}) {
    const [inputValue, setInputValue] = useState(formatNumber(value));

    useEffect(() => {
        setInputValue(formatNumber(value));
    }, [value]);

    const numericValue = Number(inputValue);
    const hasError = inputValue.trim() === '' || !Number.isFinite(numericValue) || numericValue < min || numericValue > max;

    return (
        <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
            <input
                type="number"
                step={step}
                min={min}
                max={max}
                className={`h-10 w-full rounded-xl border bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:ring-2 ${
                    hasError ? 'border-red-300 focus:border-red-500 focus:ring-red-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'
                }`}
                value={inputValue}
                onChange={(event) => {
                    const nextValue = event.target.value;
                    const nextNumber = Number(nextValue);
                    setInputValue(nextValue);

                    if (nextValue.trim() !== '' && Number.isFinite(nextNumber) && nextNumber >= min && nextNumber <= max) {
                        onValidChange(nextNumber);
                    }
                }}
                onBlur={() => {
                    if (hasError) {
                        setInputValue(formatNumber(value));
                    }
                }}
            />
            {hasError && <span className="mt-1 block text-[10px] font-semibold text-red-500">{min}-{max}</span>}
        </label>
    );
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
        <div className="w-full lg:max-w-[520px]" style={{ position: 'relative' }}>
            <div className="relative flex items-center w-full">
                <Search className="absolute left-3 text-slate-400" size={18} />
                <input
                    type="text"
                    className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-3 text-sm font-semibold text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                    placeholder={disabled ? 'Exit design mode to search stockroom parts...' : 'Search by part number, name, category, or scan...'}
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
                        background: '#ffffff',
                        border: '1px solid #e2e8f0',
                        borderRadius: 14,
                        marginTop: 4,
                        zIndex: 9999,
                        overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(15,23,42,0.16)',
                    }}
                >
                    {results.map((result) => (
                        <button
                            key={result.productId}
                            type="button"
                            className="w-full px-3 py-3 text-left transition hover:bg-blue-50"
                            style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}
                            onClick={() => {
                                void onPartSelect(result);
                                setQuery('');
                                setResults([]);
                            }}
                        >
                            <div>
                                <div style={{ color: '#0f172a', fontSize: 13, fontWeight: 700 }}>{result.sku}</div>
                                <div style={{ color: '#475569', fontSize: 12 }}>{result.name}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 700 }}>{formatLocatorLocation(result)}</div>
                                <div style={{ color: '#2563eb', fontSize: 11 }}>{result.category || 'General Parts & Accessories'}</div>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {isSearching && query && (
                <div style={{ marginTop: 8, color: '#64748b', fontSize: 12 }}>
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
    const selectedSize = selectedObj?.size || (selectedObj ? getDefaultObjectSize(selectedObj.type) : null);
    const selectedSizeMax = selectedObj?.type === 'floor' ? SIZE_LIMITS.floorMax : SIZE_LIMITS.objectMax;

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

    const handleToggleDesignMode = () => {
        if (store.editMode && store.isDirty && !window.confirm('You have unsaved layout changes. Exit design mode anyway?')) {
            return;
        }

        store.toggleDesignMode();
    };

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
        <div className="stockroom-viewer animate-fade-in min-h-[calc(100dvh-100px)] rounded-3xl border border-slate-200 bg-slate-50 p-3 pb-10 text-slate-900 shadow-xl sm:p-6">
            <header className="page-header rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                    <div className="w-full min-w-0">
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-blue-700">
                                <Layers3 size={14} /> Digital Twin
                            </span>
                            {store.editMode && (
                                <span className="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-red-600">
                                    <SlidersHorizontal size={14} /> Design Mode
                                </span>
                            )}
                            {store.isDirty && (
                                <span className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700">
                                    <AlertTriangle size={14} /> Unsaved changes
                                </span>
                            )}
                            {store.editMode && !store.isDirty && (
                                <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                                    <CheckCircle2 size={14} /> Synced
                                </span>
                            )}
                        </div>
                        <h1 className="mb-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
                                {store.currentFloor === 1 ? '1st' : '2nd'} Floor
                            </span>{' '}
                            <span>- Parts Mapping</span>
                        </h1>
                        <p className="text-slate-500 text-sm font-medium">
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

                        <button className={`btn ${store.editMode ? 'btn-primary' : 'btn-outline'}`} onClick={handleToggleDesignMode}>
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
                <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                    <span>{store.initializationError}</span>
                </div>
            )}

            {store.editMode && (
                <div className="relative z-[100] mb-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Design workspace</p>
                                <h2 className="mt-1 text-lg font-bold text-slate-950">{store.currentLayoutName}</h2>
                                <p className="mt-1 text-sm text-slate-500">
                                    {store.isDirty ? 'Unsaved edits are waiting to be saved to Supabase.' : formatLastSaved(store.lastSavedAt)}
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <div style={{ position: 'relative' }}>
                                    <button className="btn btn-secondary" onClick={() => setAddMenuOpen((value) => !value)}>
                                        <Plus size={18} /> Add Object
                                    </button>

                                    {addMenuOpen && (
                                        <div className="absolute left-0 top-full z-[9999] mt-2 w-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
                                            {OBJECT_GROUPS.map((group) => (
                                                <div key={group.label} className="border-b border-slate-100 last:border-b-0">
                                                    <div className="bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{group.label}</div>
                                                    <div className="grid grid-cols-1">
                                                        {group.items.map((key) => {
                                                            const value = OBJECT_TYPES[key];
                                                            if (!value) return null;

                                                            return (
                                                                <button
                                                                    key={key}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        store.addObject(key);
                                                                        setAddMenuOpen(false);
                                                                    }}
                                                                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                                                                >
                                                                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-base">{value.icon}</span>
                                                                    {value.label}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <div ref={layoutMenuRef} style={{ position: 'relative' }}>
                                    <button className="btn btn-outline" onClick={() => setLayoutMenuOpen((value) => !value)}>
                                        <FolderOpen size={18} /> Load
                                    </button>

                                    {layoutMenuOpen && (
                                        <div className="absolute right-0 top-full z-[9999] mt-2 max-h-[320px] w-[340px] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
                                            {store.savedLayouts.length === 0 ? (
                                                <div className="p-5 text-center text-sm font-semibold text-slate-500">No layouts found</div>
                                            ) : (
                                                store.savedLayouts.map((layout) => (
                                                    <div
                                                        key={layout.id}
                                                        className="flex items-center justify-between gap-3 border-b border-slate-100 p-3 transition hover:bg-slate-50"
                                                        style={{
                                                            borderLeft: layout.is_default ? '4px solid #DC2626' : '4px solid transparent',
                                                            background: store.currentLayoutId === layout.id ? '#eff6ff' : undefined,
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="min-w-0 flex-1 text-left"
                                                            onClick={() => {
                                                                store.loadLayout(layout);
                                                                setLayoutMenuOpen(false);
                                                                success(`Loaded "${layout.name}".`);
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                                                                {layout.name}
                                                                {layout.is_default && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600">PRIORITY</span>}
                                                            </div>
                                                            <div className="mt-1 truncate text-xs text-slate-500">{layout.description || formatLastSaved(layout.updated_at || layout.created_at || null)}</div>
                                                        </button>

                                                        <div className="flex gap-1">
                                                            <button
                                                                type="button"
                                                                className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-700"
                                                                onClick={() => void handleSetPriorityLayout(layout.id, layout.name)}
                                                                title="Set Priority"
                                                            >
                                                                <Star size={14} fill={layout.is_default ? '#DC2626' : 'none'} color={layout.is_default ? '#DC2626' : 'currentColor'} />
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                                                                onClick={() => {
                                                                    if (!layout.is_default && window.confirm(`Delete ${layout.name}?`)) {
                                                                        void handleDeleteLayout(layout.id, layout.name);
                                                                    }
                                                                }}
                                                                title="Delete"
                                                                disabled={layout.is_default}
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

                                <button className="btn btn-secondary" disabled={store.isSaving} onClick={() => void handleSaveLayout()}>
                                    {store.isSaving ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={18} />}
                                    {store.isSaving ? 'Saving' : 'Save'}
                                </button>
                                <button className="btn btn-outline" disabled={store.isSaving} onClick={() => setSaveAsModal(true)}><Plus size={18} /> Save As</button>
                                <button
                                    className="btn btn-outline"
                                    onClick={() => {
                                        if (window.confirm('Reset layout to the default shell? Save afterward to persist the reset.')) {
                                            store.resetLayout();
                                            success('Layout reset. Save to persist this change.');
                                        }
                                    }}
                                    title="Reset layout"
                                >
                                    <Home size={18} /> Reset
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        {selectedObj && selectedSize ? (
                            <div className="space-y-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Selected object</p>
                                        <h3 className="mt-1 truncate text-lg font-bold text-slate-950">{selectedObj.label}</h3>
                                        <p className="text-sm text-slate-500">{OBJECT_TYPES[selectedObj.type]?.label || selectedObj.type} on Floor {selectedObj.floor}</p>
                                    </div>
                                    <button className={`btn btn-sm ${selectedObj.locked ? 'btn-primary' : 'btn-outline'}`} onClick={() => store.toggleLock(selectedObj.id)} title="Lock Object">
                                        {selectedObj.locked ? <Lock size={16} /> : <Unlock size={16} />}
                                        {selectedObj.locked ? 'Locked' : 'Unlocked'}
                                    </button>
                                </div>

                                <label>
                                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Label</span>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                                            value={labelInput}
                                            onChange={(event) => setLabelInput(event.target.value)}
                                            onBlur={() => store.updateLabel(selectedObj.id, labelInput)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    store.updateLabel(selectedObj.id, labelInput);
                                                }
                                            }}
                                            placeholder="Object label"
                                        />
                                        <button className="btn btn-outline btn-sm" onClick={() => store.updateLabel(selectedObj.id, labelInput)}><Type size={16} /></button>
                                    </div>
                                </label>

                                <div>
                                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                                        <Ruler size={16} /> Size
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <ValidatedNumberInput label="W" value={selectedSize[0]} max={selectedSizeMax} onValidChange={(value) => store.updateObjectSize(selectedObj.id, 'width', value)} />
                                        <ValidatedNumberInput label="H" value={selectedSize[1]} max={SIZE_LIMITS.heightMax} onValidChange={(value) => store.updateObjectSize(selectedObj.id, 'height', value)} />
                                        <ValidatedNumberInput label="D" value={selectedSize[2]} max={selectedSizeMax} onValidChange={(value) => store.updateObjectSize(selectedObj.id, 'depth', value)} />
                                    </div>
                                </div>

                                <div>
                                    <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-900">
                                        <Move size={16} /> Position and rotation
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ValidatedNumberInput label="X" value={selectedObj.x} min={-80} max={80} step={0.5} onValidChange={(value) => store.updatePosition(selectedObj.id, value, selectedObj.z)} />
                                        <ValidatedNumberInput label="Z" value={selectedObj.z} min={-80} max={80} step={0.5} onValidChange={(value) => store.updatePosition(selectedObj.id, selectedObj.x, value)} />
                                    </div>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(-Math.PI / 4)} title="Rotate Left"><RotateCcw size={16} /> -45</button>
                                        <button className="btn btn-outline btn-sm" onClick={() => store.rotateSelected(Math.PI / 4)} title="Rotate Right"><RotateCw size={16} /> +45</button>
                                        <button className="btn btn-outline btn-sm text-error border-error/50 hover:bg-error hover:text-white" onClick={() => store.deleteSelected()}>
                                            <Trash2 size={16} /> Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                                <Box size={32} className="text-slate-400" />
                                <h3 className="mt-3 text-base font-bold text-slate-950">Select an object to edit</h3>
                                <p className="mt-2 text-sm text-slate-500">Click any shelf, floor, room, wall, counter, or label in the scene to adjust label, W, H, D, position, rotation, lock, or delete.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!isLargeViewport && !showMobileScene && (
                <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:hidden">
                    <div className="flex flex-col gap-4">
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">Mobile locator mode</p>
                            <h2 className="mt-2 text-lg font-semibold text-slate-950">Search a part first, then open 3D only when needed.</h2>
                            <p className="mt-2 text-sm text-slate-400">
                                Floor {store.currentFloor} is ready with {stats.shelves} shelves in the locator shell.
                            </p>
                        </div>

                        {selectedItem && (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                <p className="text-sm font-semibold text-slate-950">{selectedItem.sku}</p>
                                <p className="text-sm text-slate-600">{selectedItem.name}</p>
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
            <div className="h-[min(560px,calc(100dvh-9rem))] overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-blue-50 via-slate-100 to-white shadow-inner lg:h-[640px]" style={{ padding: 0, position: 'relative' }}>
                {!isLargeViewport && (
                    <button
                        className="absolute right-4 top-4 z-[120] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm"
                        onClick={() => setShowMobileScene(false)}
                    >
                        Close 3D
                    </button>
                )}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(180deg, rgba(219,234,254,0.96), rgba(248,250,252,0.96))',
                        zIndex: store.isTransitioning ? 100 : -1,
                        opacity: store.isTransitioning ? 1 : 0,
                        transition: 'opacity 0.3s ease-in-out',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'none',
                    }}
                >
                    <div className="px-4 text-center text-slate-950">
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
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-base font-bold text-slate-950 shadow-sm sm:text-lg">
                            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                            Loading Warehouse Digital Twin...
                        </div>
                    </div>
                )}

                <div className="absolute bottom-4 left-4 max-w-[calc(100%-2rem)] rounded-2xl border border-slate-200 bg-white/90 p-3 text-slate-900 shadow-sm backdrop-blur sm:p-4">
                    <div className="text-xs font-bold text-slate-400 mb-2">{store.currentFloor === 1 ? '1ST FLOOR' : '2ND FLOOR'}</div>
                    <div className="text-sm flex flex-col gap-1 font-semibold text-slate-700">
                        <span>Shelves: {store.layout.objects.filter((object) => object.floor === store.currentFloor && (object.type === 'shelf' || object.type === 'shelf2')).length}</span>
                        <span>Counters: {store.layout.objects.filter((object) => object.floor === store.currentFloor && object.type === 'counter').length}</span>
                        <span>Entrances: {store.layout.objects.filter((object) => object.floor === store.currentFloor && object.type === 'entrance').length}</span>
                    </div>
                </div>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex flex-col gap-2">
                    <button
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none"
                        onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true }))}
                    >
                        <ZoomIn size={20} />
                    </button>
                    <button
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white/90 text-slate-700 shadow-sm backdrop-blur transition hover:bg-blue-50 hover:text-blue-700 focus:outline-none"
                        onClick={() => document.querySelector('canvas')?.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }))}
                    >
                        <ZoomOut size={20} />
                    </button>
                </div>

                <div className="absolute bottom-4 right-4 hidden rounded-xl border border-slate-200 bg-white/85 px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm backdrop-blur sm:block">
                    {store.viewMode === '2d' ? '2D View • Drag to pan' : '3D View • Drag to rotate • Scroll to zoom'}
                </div>
            </div>

            )}

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                {[
                    { id: 'shelves', label: 'Shelves', total: stats.shelves },
                    { id: 'counters', label: 'Counters', total: stats.counters },
                    { id: 'entrances', label: 'Entrances', total: stats.entrances },
                    { id: 'floors', label: 'Floors', total: stats.floors },
                ].map((item) => (
                    <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-2xl shadow-glow-primary" style={{ background: 'var(--gradient-primary)' }}>
                                <Database size={24} color="white" />
                            </div>
                            <div>
                                <h4 className="text-3xl font-bold tracking-tight text-slate-950">{item.total}</h4>
                                <p className="mt-1 text-sm font-bold uppercase tracking-wider text-slate-500">{item.label}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {saveAsModal && (
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
                    <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border border-slate-200 bg-white p-4 shadow-2xl sm:p-6">
                        <h3 className="mb-2 text-xl font-bold text-slate-950">Save Layout As</h3>
                        <p className="mb-5 text-sm text-slate-500">Create a new Supabase-backed stockroom map from the current scene.</p>
                        <div className="form-group mb-6">
                            <label className="mb-2 block text-sm font-bold text-slate-700">Layout Name</label>
                            <input
                                type="text"
                                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
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
                            <button className="btn btn-primary" disabled={!saveName.trim() || store.isSaving} onClick={() => void handleSaveLayoutAs()}>
                                {store.isSaving ? 'Saving...' : 'Save Layout'}
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
