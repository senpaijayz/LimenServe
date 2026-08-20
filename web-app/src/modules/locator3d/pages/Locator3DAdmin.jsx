import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import {
    AlertTriangle,
    Box,
    Boxes,
    BrickWall,
    Camera,
    CheckCircle2,
    ChevronDown,
    Copy,
    DoorOpen,
    Grid3X3,
    LayoutDashboard,
    Layers3,
    LoaderCircle,
    Lock,
    MapPin,
    Maximize2,
    Minimize2,
    Monitor,
    MousePointer2,
    MoreHorizontal,
    Package,
    PencilLine,
    Plus,
    Ruler,
    Redo2,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    Star,
    Trash2,
    Undo2,
    Unlock,
    X,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import AuthContext from '../../../context/auth-context';
import { getFullProductCatalog } from '../../../services/catalogApi';
import Locator3DScene from '../components/Locator3DScene';
import {
    LOCATOR_LAYOUT_NAME,
    SHELF_BIN_RANGE,
    getLocatorObjectById,
    getLocatorObjectSummary,
    getShelfObjectByLocation,
    isShelfObject,
    normalizeAisle,
} from '../data/locatorScene';
import {
    assignProductLocation,
    getProductLocations,
    listStoreLayouts,
    loadStoreLayout,
    saveStoreLayout,
    setStoreLayoutPriority,
} from '../services/locator3DApi';
import { getLocatorAutosave, useLocator3DStore } from '../store/useLocator3DStore';

const libraryIconMap = {
    Archive: Box,
    Box,
    Boxes,
    BrickWall,
    DoorOpen,
    Monitor,
    Package,
};

const EMPTY_LOCATION_NOTICE = {
    message: '',
    tone: 'neutral',
};

function cx(...classes) {
    return classes.filter(Boolean).join(' ');
}

function getProductStock(product = {}) {
    const value = product.quantity ?? product.stock ?? product.onHand ?? product.on_hand ?? 0;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
}

function resolveProductDetails({ catalogProducts = [], fallbackProduct = null, location = null, productId = '', productName = '', productSku = '' }) {
    const matched = catalogProducts.find((product) => String(product.id) === String(productId)) ?? fallbackProduct ?? {};

    return {
        ...matched,
        id: matched.id || productId,
        name: matched.name || location?.productName || productName || 'Selected product',
        quantity: getProductStock(matched),
        sku: matched.sku || location?.sku || productSku || '',
        stock: getProductStock(matched),
    };
}

function formatLocation(location) {
    if (!location) {
        return 'Location not assigned';
    }

    const parts = [
        location.floor ? 'Floor ' + location.floor : null,
        location.aisle ? 'Aisle ' + normalizeAisle(location.aisle) : null,
        location.shelfNumber ? 'Shelf ' + location.shelfNumber : null,
        location.binNumber ? 'Bin ' + location.binNumber : null,
    ].filter(Boolean);

    return parts.join(' · ') || 'Location not assigned';
}

function Button({ children, className = '', tone = 'secondary', type = 'button', ...props }) {
    const tones = {
        danger: 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
        primary: 'border-indigo-600 bg-indigo-600 text-white shadow-[0_8px_20px_rgba(79,70,229,0.24)] hover:bg-indigo-500',
        secondary: 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
        subtle: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-950',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    };

    return (
        <button
            className={cx(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50',
                tones[tone],
                className,
            )}
            type={type}
            {...props}
        >
            {children}
        </button>
    );
}

function IconButton({ label, children, className = '', ...props }) {
    return (
        <button
            aria-label={label}
            className={cx(
                'inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-45',
                className,
            )}
            title={label}
            type="button"
            {...props}
        >
            {children}
        </button>
    );
}

function ProductSearch({ isLoading, notice, onLocateProduct, productLocations, products, sceneObjects }) {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const normalizedQuery = query.trim().toLowerCase();
    const searchableProducts = useMemo(() => {
        const knownIds = new Set(products.map((product) => String(product.id)));
        const mappedFallbacks = productLocations
            .filter((location) => location.productId && !knownIds.has(String(location.productId)))
            .map((location) => ({
                id: location.productId,
                name: location.productName || 'Mapped product',
                sku: location.sku || '',
            }));

        return [...products, ...mappedFallbacks];
    }, [productLocations, products]);

    const results = useMemo(() => {
        if (!normalizedQuery) {
            return [];
        }

        return searchableProducts
            .map((product) => {
                const location = productLocations.find((item) => String(item.productId) === String(product.id)) ?? null;
                const shelf = location ? getShelfObjectByLocation(location, sceneObjects) : null;
                const searchable = [
                    product.name,
                    product.sku,
                    product.barcode,
                    product.materialCode,
                    product.material_code,
                    product.partCode,
                    product.part_number,
                    location?.aisle,
                    location?.shelfNumber,
                    location?.binNumber,
                    location?.productName,
                    location?.sku,
                ].filter(Boolean).join(' ').toLowerCase();

                return { location, product, searchable, shelf };
            })
            .filter((item) => item.searchable.includes(normalizedQuery))
            .slice(0, 7);
    }, [normalizedQuery, productLocations, sceneObjects, searchableProducts]);

    const chooseResult = (result) => {
        setQuery(result.product.name || result.product.sku || '');
        setIsOpen(false);
        onLocateProduct(result.product);
    };

    return (
        <div className="relative w-full max-w-3xl">
            <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                    aria-controls="locator-product-results"
                    aria-expanded={isOpen && Boolean(query.trim())}
                    aria-label="Search products, material codes, shelves, or barcodes"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100"
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    placeholder="Search product, material code, SKU, shelf, bin, or barcode..."
                    role="combobox"
                    value={query}
                />
                {query && (
                    <button
                        aria-label="Clear product search"
                        className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-200 hover:text-slate-700"
                        onClick={() => {
                            setQuery('');
                            setIsOpen(false);
                        }}
                        type="button"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}
            </div>

            {notice.message && (
                <p className={cx(
                    'mt-2 text-xs font-medium',
                    notice.tone === 'warning' ? 'text-amber-700' : notice.tone === 'success' ? 'text-emerald-700' : 'text-slate-500',
                )}
                >
                    {notice.message}
                </p>
            )}

            {isOpen && normalizedQuery && (
                <div
                    className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_48px_rgba(15,23,42,0.16)]"
                    id="locator-product-results"
                    role="listbox"
                >
                    {results.length ? (
                        results.map((result) => (
                            <button
                                aria-label={'Locate ' + result.product.name}
                                className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-3 text-left transition hover:bg-indigo-50"
                                key={String(result.product.id)}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => chooseResult(result)}
                                type="button"
                            >
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-bold text-slate-900">{result.product.name || 'Unnamed product'}</span>
                                    <span className="mt-1 block truncate font-mono text-xs text-slate-500">{result.product.sku || result.product.materialCode || 'No SKU'}</span>
                                </span>
                                <span className={cx(
                                    'max-w-[54%] shrink-0 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold',
                                    result.location && result.shelf ? 'bg-indigo-50 text-indigo-700' : 'bg-amber-50 text-amber-700',
                                )}
                                >
                                    {result.location && result.shelf ? formatLocation(result.location) : 'Not mapped'}
                                </span>
                            </button>
                        ))
                    ) : isLoading ? (
                        <div className="px-4 py-5 text-sm font-medium text-slate-500">Loading products...</div>
                    ) : (
                        <div className="px-4 py-5 text-sm font-medium text-slate-500">No matching products or saved locations.</div>
                    )}
                </div>
            )}
        </div>
    );
}

function HeaderActions({
    canEditLayout,
    hasUnsavedChanges,
    isSaving,
    layoutName,
    layoutOptions,
    onChangeLayoutName,
    onExitDesignMode,
    onLoadLayout,
    onSaveLayout,
    onSetPriority,
    onSelectLayout,
    priorityLayoutName,
}) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const goToFloor = useLocator3DStore((state) => state.goToFloor);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const requestCameraPreset = useLocator3DStore((state) => state.requestCameraPreset);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [saveAsName, setSaveAsName] = useState('');
    const [saveAsPriority, setSaveAsPriority] = useState(false);

    return (
        <div className="flex flex-wrap items-center justify-end gap-2">
            <div aria-label="Floor selector" className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[1, 2].map((floor) => (
                    <button
                        className={cx(
                            'min-h-8 rounded-lg px-3 text-xs font-bold transition',
                            activeFloor === floor ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-950',
                        )}
                        key={floor}
                        onClick={() => goToFloor(floor)}
                        type="button"
                    >
                        Floor {floor}
                    </button>
                ))}
            </div>
            <Button
                aria-label="Top-down 2D floor view"
                className="hidden sm:inline-flex"
                onClick={() => requestCameraPreset('topDown')}
            >
                <Grid3X3 className="h-4 w-4" />
                2D View
            </Button>
            {canEditLayout && (
                <Button
                    onClick={() => {
                        if (isDesignMode) {
                            onExitDesignMode();
                        } else {
                            useLocator3DStore.getState().setDesignMode(true);
                        }
                    }}
                    tone={isDesignMode ? 'success' : 'primary'}
                >
                    {isDesignMode ? <CheckCircle2 className="h-4 w-4" /> : <MousePointer2 className="h-4 w-4" />}
                    {isDesignMode ? 'Exit Design' : 'Design Mode'}
                </Button>
            )}
            <div className="relative">
                <IconButton label="More stockroom actions" onClick={() => setIsMoreOpen((value) => !value)}>
                    <MoreHorizontal className="h-5 w-5" />
                </IconButton>
                {isMoreOpen && (
                    <div className="absolute right-0 top-12 z-50 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_20px_48px_rgba(15,23,42,0.16)]">
                        <p className="px-2 pb-2 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Saved layouts</p>
                        <select
                            aria-label="Select saved layout"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-indigo-400"
                            onChange={(event) => onSelectLayout(event.target.value)}
                            value={layoutName}
                        >
                            {layoutOptions.map((name) => <option key={name} value={name}>{name === priorityLayoutName ? `★ ${name}` : name}</option>)}
                        </select>
                        <Button className="mt-2 w-full" onClick={() => {
                            setIsMoreOpen(false);
                            onLoadLayout(layoutName);
                        }}
                        >
                            <RefreshCw className="h-4 w-4" />
                            Load selected layout
                        </Button>
                        <div className="my-3 border-t border-slate-100" />
                        <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Save a copy</p>
                        <input
                            aria-label="Save layout as"
                            className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-indigo-400"
                            onChange={(event) => setSaveAsName(event.target.value)}
                            placeholder="e.g. Layout Backup"
                            value={saveAsName}
                        />
                        <label className="mt-2 flex items-center gap-2 px-1 text-[11px] font-semibold text-slate-600">
                            <input checked={saveAsPriority} onChange={(event) => setSaveAsPriority(event.target.checked)} type="checkbox" />
                            Use as priority stockroom
                        </label>
                        <Button
                            className="mt-2 w-full"
                            disabled={!saveAsName.trim() || isSaving}
                            onClick={() => {
                                onChangeLayoutName(saveAsName.trim());
                                onSaveLayout(saveAsName.trim(), { priority: saveAsPriority });
                                setSaveAsName('');
                                setSaveAsPriority(false);
                                setIsMoreOpen(false);
                            }}
                            tone="primary"
                        >
                            <Save className="h-4 w-4" />
                            Save As
                        </Button>
                        {onSetPriority && layoutName !== priorityLayoutName && (
                            <Button className="mt-2 w-full" onClick={() => onSetPriority(layoutName)}>
                                <Star className="h-4 w-4" />
                                Set current as priority
                            </Button>
                        )}
                        {hasUnsavedChanges && <p className="px-2 pt-3 text-[11px] font-medium text-amber-700">Unsaved design changes are open in this browser.</p>}
                    </div>
                )}
            </div>
        </div>
    );
}

function StockroomHeader(props) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);

    return (
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] sm:p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50">
                            <LayoutDashboard className="h-4 w-4" />
                        </span>
                        {activeFloor === 1 ? '1st Floor' : '2nd Floor'} · Parts Mapping
                    </div>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                        {isDesignMode ? '3D Stockroom · Design' : '3D Stockroom'}
                    </h1>
                    <p className="mt-1.5 text-sm font-medium text-slate-500">
                        {isDesignMode ? 'Drag objects to rearrange the stockroom.' : 'Interactive 3D map · Find parts instantly'}
                    </p>
                </div>
                <HeaderActions {...props} />
            </div>
            {!isDesignMode && (
                <div className="mt-6 border-t border-slate-100 pt-5">
                    <ProductSearch
                        isLoading={props.isLoadingProducts}
                        notice={props.locationNotice}
                        onLocateProduct={props.onLocateProduct}
                        productLocations={props.productLocations}
                        products={props.products}
                        sceneObjects={props.sceneObjects}
                    />
                </div>
            )}
        </header>
    );
}

function ViewportControls({ canvasShellRef }) {
    const resetCamera = useLocator3DStore((state) => state.resetCamera);
    const requestCameraPreset = useLocator3DStore((state) => state.requestCameraPreset);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isViewOpen, setIsViewOpen] = useState(false);

    useEffect(() => {
        const updateFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', updateFullscreen);
        return () => document.removeEventListener('fullscreenchange', updateFullscreen);
    }, []);

    const toggleFullscreen = () => {
        const target = canvasShellRef.current;
        if (!target) {
            return;
        }
        if (document.fullscreenElement) {
            void document.exitFullscreen?.();
            return;
        }
        void target.requestFullscreen?.();
    };

    const nudgeZoom = (deltaY) => {
        const canvas = canvasShellRef.current?.querySelector('canvas');
        canvas?.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY }));
    };

    return (
        <>
            <div className="pointer-events-auto absolute right-4 top-4 z-20 flex items-center gap-2">
                <div className="relative">
                    <Button className="bg-white/95 shadow-sm" onClick={() => setIsViewOpen((value) => !value)}>
                        <Camera className="h-4 w-4" />
                        View
                        <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                    {isViewOpen && (
                        <div className="absolute right-0 top-12 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                            {[
                                ['overview', 'Overview'],
                                ['counter', 'Counter View'],
                                ['topDown', 'Top View'],
                                ['selected', 'Focus Selected'],
                            ].map(([preset, label]) => (
                                <button
                                    className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    disabled={preset === 'selected' && !selectedObjectId && !locatedProduct}
                                    key={preset}
                                    onClick={() => {
                                        requestCameraPreset(preset);
                                        setIsViewOpen(false);
                                    }}
                                    type="button"
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <IconButton className="bg-white/95" label="Reset camera" onClick={resetCamera}>
                    <RefreshCw className="h-4 w-4" />
                </IconButton>
                <IconButton className="bg-white/95" label={isFullscreen ? 'Exit fullscreen' : 'Open fullscreen'} onClick={toggleFullscreen}>
                    {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </IconButton>
            </div>
            <div className="pointer-events-auto absolute right-4 top-1/2 z-20 flex -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.16)]">
                <button aria-label="Zoom in" className="flex h-10 w-10 items-center justify-center text-lg font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700" onClick={() => nudgeZoom(-140)} type="button">+</button>
                <span className="mx-2 h-px bg-slate-100" />
                <button aria-label="Zoom out" className="flex h-10 w-10 items-center justify-center text-lg font-medium text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700" onClick={() => nudgeZoom(140)} type="button">−</button>
            </div>
        </>
    );
}

function FloorInfo() {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const objects = sceneObjects.filter((object) => Number(object.floor || 1) === activeFloor);
    const shelfCount = objects.filter((object) => isShelfObject(object)).length;
    const counterCount = objects.filter((object) => object.type === 'counter-computer').length;
    const stairCount = objects.filter((object) => object.type === 'stairs').length;

    return (
        <div className="pointer-events-none absolute bottom-4 left-4 z-10 rounded-xl border border-white/35 bg-white/90 px-3.5 py-3 shadow-sm backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{activeFloor === 1 ? '1st Floor' : '2nd Floor'}</p>
            <p className="mt-1 text-xs font-semibold text-slate-700">{shelfCount} Shelves · {counterCount} Counter · {stairCount} Stair</p>
        </div>
    );
}

function LocatedProductNote({ notice }) {
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);

    if (!locatedProduct) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[min(320px,calc(100%-8rem))] rounded-xl border border-amber-200 bg-amber-50/95 px-3.5 py-3 shadow-sm backdrop-blur">
            <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-amber-950">{locatedProduct.productName || 'Product located'}</span>
                    <span className="mt-0.5 block truncate text-[11px] font-medium text-amber-700">{locatedProduct.locationLabel || notice.message}</span>
                </span>
            </span>
        </div>
    );
}

function DesignToolbar({ isSaving, onDiscardChanges, onOpenAssignment, onRequestDelete, onRequestResetFloor, onRequestResetStockroom, onSave }) {
    const addSceneObject = useLocator3DStore((state) => state.addSceneObject);
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const centerCameraOnSelected = useLocator3DStore((state) => state.centerCameraOnSelected);
    const deleteSelectedObject = useLocator3DStore((state) => state.deleteSelectedObject);
    const duplicateSelectedObject = useLocator3DStore((state) => state.duplicateSelectedObject);
    const history = useLocator3DStore((state) => state.history);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const objectLibrary = useLocator3DStore((state) => state.objectLibrary);
    const redo = useLocator3DStore((state) => state.redo);
    const resetCamera = useLocator3DStore((state) => state.resetCamera);
    const rotateSelectedObject = useLocator3DStore((state) => state.rotateSelectedObject);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const setActiveTool = useLocator3DStore((state) => state.setActiveTool);
    const snapEnabled = useLocator3DStore((state) => state.snapEnabled);
    const toggleObjectLock = useLocator3DStore((state) => state.toggleObjectLock);
    const toggleSceneOption = useLocator3DStore((state) => state.toggleSceneOption);
    const undo = useLocator3DStore((state) => state.undo);
    const updateObjectDimensions = useLocator3DStore((state) => state.updateObjectDimensions);
    const updateShelfProperties = useLocator3DStore((state) => state.updateShelfProperties);
    const selected = getLocatorObjectById(selectedObjectId, sceneObjects);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [isSizeOpen, setIsSizeOpen] = useState(false);
    const [sizeDraft, setSizeDraft] = useState({ depth: '', height: '', width: '' });
    const [layerDraft, setLayerDraft] = useState('');

    if (!isDesignMode) {
        return null;
    }

    const addObject = (type) => {
        addSceneObject(type);
        setActiveTool('move');
        setIsAddOpen(false);
    };

    return (
        <div aria-label="Design toolbar" className="pointer-events-auto absolute inset-x-3 top-3 z-30 flex flex-wrap items-center gap-2 rounded-2xl border border-indigo-100 bg-white/95 p-2 shadow-[0_16px_38px_rgba(15,23,42,0.16)] backdrop-blur">
            <div className="relative">
                <Button onClick={() => setIsAddOpen((value) => !value)} tone="primary">
                    <Plus className="h-4 w-4" />
                    Add Object
                    <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                {isAddOpen && (
                    <div className="absolute left-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                        {objectLibrary.map((object) => {
                            const Icon = libraryIconMap[object.icon] ?? Box;
                            return (
                                <button
                                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-700"
                                    key={object.type}
                                    onClick={() => addObject(object.type)}
                                    type="button"
                                >
                                    <Icon className="h-4 w-4" />
                                    {object.label}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            <Button
                className={activeTool === 'move' || activeTool === 'select' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : ''}
                onClick={() => setActiveTool('move')}
            >
                <MousePointer2 className="h-4 w-4" />
                Select
            </Button>
            {selected && (
                <>
                    <span className="hidden h-6 w-px bg-slate-200 lg:block" />
                    <span className="max-w-36 truncate px-1 text-xs font-bold text-slate-700">Selected: {selected.name}</span>
                    <div className="relative">
                        <Button
                            aria-expanded={isSizeOpen}
                            onClick={() => {
                                setSizeDraft({
                                    depth: String(selected.dimensions?.depth ?? ''),
                                    height: String(selected.dimensions?.height ?? ''),
                                    width: String(selected.dimensions?.width ?? ''),
                                });
                                setLayerDraft(String(selected.layerCount ?? (selected.type === 'shelf-4-layer' ? 4 : 2)));
                                setIsSizeOpen((value) => !value);
                            }}
                        >
                            <Ruler className="h-4 w-4" />
                            Size
                        </Button>
                        {isSizeOpen && (
                            <div className="absolute left-0 top-12 z-40 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Dimensions · metres</p>
                                <div className="mt-2 grid grid-cols-3 gap-2">
                                    {['width', 'height', 'depth'].map((key) => (
                                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-500" key={key}>
                                            {key}
                                            <input
                                                aria-label={`${key} dimension`}
                                                className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                                                inputMode="decimal"
                                                min="0.25"
                                                onChange={(event) => setSizeDraft((current) => ({ ...current, [key]: event.target.value }))}
                                                step="0.25"
                                                type="number"
                                                value={sizeDraft[key]}
                                            />
                                        </label>
                                    ))}
                                </div>
                                {isShelfObject(selected) && selected.type !== 'parts-cabinet' && (
                                    <label className="mt-2 block text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                        Layers (1–12)
                                        <input
                                            aria-label="shelf layer count"
                                            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-bold text-slate-800 outline-none focus:border-indigo-400"
                                            inputMode="numeric"
                                            max="12"
                                            min="1"
                                            onChange={(event) => setLayerDraft(event.target.value)}
                                            step="1"
                                            type="number"
                                            value={layerDraft}
                                        />
                                    </label>
                                )}
                                <Button
                                    className="mt-3 w-full justify-center"
                                    onClick={() => {
                                        const dimensions = Object.fromEntries(Object.entries(sizeDraft).map(([key, value]) => [key, Number(value)]));
                                        if (Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0)) {
                                            updateObjectDimensions(selected.id, dimensions);
                                            if (isShelfObject(selected) && selected.type !== 'parts-cabinet') {
                                                updateShelfProperties(selected.id, { layerCount: Number(layerDraft) });
                                            }
                                            setIsSizeOpen(false);
                                        }
                                    }}
                                    tone="primary"
                                >
                                    Apply size
                                </Button>
                            </div>
                        )}
                    </div>
                    <Button aria-label="Rotate selected object" onClick={() => rotateSelectedObject(-15)}>
                        <RotateCcw className="h-4 w-4" />
                        Rotate
                    </Button>
                    <Button aria-label="Rotate selected object 90 degrees" onClick={() => rotateSelectedObject(90)}>90°</Button>
                    <Button aria-label="Duplicate selected object" onClick={duplicateSelectedObject}>
                        <Copy className="h-4 w-4" />
                        Duplicate
                    </Button>
                    {isShelfObject(selected) && (
                        <Button onClick={() => onOpenAssignment(selected)}>
                            <Package className="h-4 w-4" />
                            Assign Part
                        </Button>
                    )}
                    <Button aria-label="Focus selected object" className="hidden xl:inline-flex" onClick={centerCameraOnSelected}>
                        <Camera className="h-4 w-4" />
                        Focus
                    </Button>
                    <IconButton label={selected.isLocked ? 'Unlock selected object' : 'Lock selected object'} onClick={() => toggleObjectLock(selected.id)}>
                        {selected.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    </IconButton>
                    <IconButton
                        className="border-rose-200 text-rose-700 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                        label="Delete selected object"
                        onClick={() => isShelfObject(selected) ? onRequestDelete(selected) : deleteSelectedObject()}
                    >
                        <Trash2 className="h-4 w-4" />
                    </IconButton>
                </>
            )}
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <IconButton disabled={!history?.past?.length} label="Undo" onClick={undo}><Undo2 className="h-4 w-4" /></IconButton>
            <IconButton disabled={!history?.future?.length} label="Redo" onClick={redo}><Redo2 className="h-4 w-4" /></IconButton>
            <Button
                className={snapEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : ''}
                onClick={() => toggleSceneOption('snapEnabled')}
            >
                Snap {snapEnabled ? '✓' : 'Off'}
            </Button>
            <div className="relative ml-auto">
                <Button onClick={() => setIsMoreOpen((value) => !value)}>
                    More
                    <ChevronDown className="h-3.5 w-3.5" />
                </Button>
                {isMoreOpen && (
                    <div className="absolute right-0 top-12 z-40 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.18)]">
                        <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50" onClick={resetCamera} type="button">Reset Camera</button>
                        <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={onDiscardChanges} type="button">Discard Unsaved Changes</button>
                        <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-amber-700 hover:bg-amber-50" onClick={onRequestResetFloor} type="button">Reset Current Floor</button>
                        <button className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-rose-700 hover:bg-rose-50" onClick={onRequestResetStockroom} type="button">Reset Entire Stockroom</button>
                    </div>
                )}
            </div>
            <Button disabled={isSaving} onClick={onSave} tone="primary">
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving…' : 'Save'}
            </Button>
        </div>
    );
}

function SummaryCards() {
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const summary = getLocatorObjectSummary(sceneObjects);
    const cards = [
        { icon: Boxes, label: 'Shelves', value: summary.shelves },
        { icon: Monitor, label: 'Counters', value: sceneObjects.filter((object) => object.type === 'counter-computer').length },
        { icon: DoorOpen, label: 'Entrances', value: sceneObjects.filter((object) => object.type === 'entrance-door').length },
        { icon: LayoutDashboard, label: 'Floors', value: summary.floors },
    ];

    return (
        <section aria-label="Stockroom summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((card) => {
                const Icon = card.icon;
                return (
                    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,0.04)]" key={card.label}>
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                            <Icon className="h-5 w-5" />
                        </span>
                        <span>
                            <span className="block text-xl font-black leading-none text-slate-950">{card.value}</span>
                            <span className="mt-1 block text-xs font-semibold text-slate-500">{card.label}</span>
                        </span>
                    </div>
                );
            })}
        </section>
    );
}

function AutosaveRecoveryBanner({ onDiscard, onRecover, snapshot }) {
    if (!snapshot) {
        return null;
    }

    return (
        <section className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-amber-800">An unsaved local layout snapshot is available from {snapshot.createdAt ? new Date(snapshot.createdAt).toLocaleString() : 'an earlier session'}.</p>
            <div className="flex shrink-0 gap-2">
                <Button onClick={onRecover} tone="success">Recover</Button>
                <Button onClick={onDiscard}>Discard</Button>
            </div>
        </section>
    );
}

function ShelfInspector({ onOpenAssignment, productLocations, products }) {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const shelf = getLocatorObjectById(selectedObjectId, sceneObjects);

    if (!isDesignMode || !shelf || !isShelfObject(shelf)) {
        return null;
    }

    return (
        <ShelfInspectorForm
            key={shelf.id}
            onOpenAssignment={onOpenAssignment}
            productLocations={productLocations}
            products={products}
            shelf={shelf}
        />
    );
}

function ShelfInspectorForm({ onOpenAssignment, productLocations, products, shelf }) {
    const updateShelfProperties = useLocator3DStore((state) => state.updateShelfProperties);
    const [nameDraft, setNameDraft] = useState(shelf.name || '');
    const [descriptionDraft, setDescriptionDraft] = useState(shelf.description || '');

    const assignedProducts = useMemo(() => {
        if (!shelf || !isShelfObject(shelf)) {
            return [];
        }

        const layerCount = Math.max(1, Number(shelf.layerCount || 1));
        return productLocations
            .filter((location) => (
                location.shelfObjectId === shelf.id
                || (normalizeAisle(location.aisle) === normalizeAisle(shelf.aisle)
                    && Number(location.shelfNumber) === Number(shelf.shelfNumber))
            ))
            .map((location, index) => ({
                ...location,
                displayLayer: Number(location.layerNumber || ((index % layerCount) + 1)),
                product: products.find((item) => String(item.id) === String(location.productId)),
            }));
    }, [productLocations, products, shelf]);

    const layerCount = Math.max(1, Number(shelf.layerCount || 1));
    const saveDetails = () => {
        updateShelfProperties(shelf.id, {
            description: descriptionDraft,
            name: nameDraft,
        });
    };

    return (
        <aside aria-label="Shelf inspector" className="pointer-events-auto absolute bottom-4 right-4 z-30 w-[min(360px,calc(100%-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.22)] backdrop-blur">
            <div className="border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-sky-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Shelf inspector</p>
                        <h2 className="mt-1 text-sm font-black text-slate-950">{shelf.name || 'Selected shelf'}</h2>
                    </div>
                    <Layers3 className="h-5 w-5 text-indigo-500" />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1.5 text-center text-[10px] font-bold text-slate-600">
                    <span className="rounded-lg bg-white/80 px-1.5 py-2">F{shelf.floor || 1}</span>
                    <span className="rounded-lg bg-white/80 px-1.5 py-2">A{normalizeAisle(shelf.aisle) || '-'}</span>
                    <span className="rounded-lg bg-white/80 px-1.5 py-2">S{shelf.shelfNumber || '-'}</span>
                    <span className="rounded-lg bg-white/80 px-1.5 py-2">{layerCount} layers</span>
                </div>
            </div>
            <div className="space-y-3 p-4">
                <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" htmlFor="shelf-inspector-name">
                    Shelf name
                    <span className="relative mt-1 block">
                        <PencilLine className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                        <input
                            aria-label="Shelf name"
                            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-2 text-xs font-semibold normal-case tracking-normal text-slate-900 outline-none focus:border-indigo-400 focus:bg-white"
                            id="shelf-inspector-name"
                            maxLength={80}
                            onChange={(event) => setNameDraft(event.target.value)}
                            value={nameDraft}
                        />
                    </span>
                </label>
                <label className="block text-[10px] font-black uppercase tracking-[0.12em] text-slate-500" htmlFor="shelf-inspector-description">
                    Location description
                    <textarea
                        aria-label="Shelf description"
                        className="mt-1 min-h-16 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-indigo-400 focus:bg-white"
                        id="shelf-inspector-description"
                        maxLength={240}
                        onChange={(event) => setDescriptionDraft(event.target.value)}
                        placeholder="Example: Fast-moving filters beside the receiving lane"
                        value={descriptionDraft}
                    />
                </label>
                <Button className="w-full justify-center" onClick={saveDetails} tone="primary">
                    Save shelf details
                </Button>

                <div className="border-t border-slate-100 pt-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Products to put here</p>
                        <Button className="px-2.5 py-1.5 text-[10px]" onClick={() => onOpenAssignment?.(shelf)}>
                            <Package className="h-3.5 w-3.5" />
                            Assign
                        </Button>
                    </div>
                    <div className="mt-2 max-h-36 space-y-1.5 overflow-y-auto">
                        {assignedProducts.map((location) => (
                            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={location.productId}>
                                <p className="truncate text-xs font-bold text-slate-800">{location.productName || location.product?.name || location.sku || 'Unnamed product'}</p>
                                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                    Layer {location.displayLayer} · Bin {location.binNumber || '-'} · Floor {location.floor || shelf.floor || 1} · Aisle {normalizeAisle(location.aisle || shelf.aisle) || '-'}
                                </p>
                            </div>
                        ))}
                        {!assignedProducts.length && (
                            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-3 text-xs font-medium leading-5 text-slate-500">
                                No product is mapped yet. Assign one to make its layer and bin easy to find.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}

function ProductAssignmentModal({ isOpen, onAssigned, onClose, products, shelf }) {
    const [query, setQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [binNumber, setBinNumber] = useState(1);
    const [layerNumber, setLayerNumber] = useState(1);
    const [isSaving, setIsSaving] = useState(false);
    const { error, success } = useToast();
    const productLocations = useLocator3DStore((state) => state.productLocations);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const selected = useLocator3DStore.getState().selectedProductForLocation;
        setQuery(selected?.name || selected?.sku || '');
        setSelectedProduct(selected || null);
        setBinNumber(1);
        setLayerNumber(1);
    }, [isOpen, shelf?.id]);

    const assignedProducts = useMemo(() => productLocations.filter((location) => (
        shelf && (
            location.shelfObjectId === shelf.id
            || (normalizeAisle(location.aisle) === normalizeAisle(shelf.aisle)
                && Number(location.shelfNumber) === Number(shelf.shelfNumber))
        )
    )), [productLocations, shelf]);

    const results = useMemo(() => {
        const normalized = query.trim().toLowerCase();
        if (!normalized) {
            return [];
        }
        return products.filter((product) => [
            product.name,
            product.sku,
            product.barcode,
            product.materialCode,
            product.material_code,
        ].filter(Boolean).join(' ').toLowerCase().includes(normalized)).slice(0, 6);
    }, [products, query]);

    const saveAssignment = async () => {
        if (!shelf || !selectedProduct) {
            return;
        }
        setIsSaving(true);
        try {
            const location = await assignProductLocation({
                aisle: shelf.aisle || 'A',
                binNumber,
                floor: shelf.floor || 1,
                layerNumber,
                productId: selectedProduct.id,
                productName: selectedProduct.name || '',
                shelfNumber: shelf.shelfNumber || 1,
                shelfObjectId: shelf.id,
                sku: selectedProduct.sku || '',
            });
            useLocator3DStore.getState().upsertProductLocation(location);
            onAssigned?.(location);
            success('Product location saved.');
            onClose();
        } catch (saveError) {
            error(saveError.message || 'Unable to save product location.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md" title={shelf ? 'Assign product to ' + shelf.name : 'Assign product'}>
            <div className="space-y-4">
                <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
                    <p className="text-xs font-black text-indigo-950">{shelf?.name || 'Shelf'}</p>
                    <p className="mt-1 text-[11px] font-semibold leading-5 text-indigo-700">
                        Floor {shelf?.floor || 1} · Aisle {normalizeAisle(shelf?.aisle) || '-'} · Shelf {shelf?.shelfNumber || '-'} · {shelf?.layerCount || 1} layers · {shelf?.binCount || 0} bins
                    </p>
                    {shelf?.description && <p className="mt-2 text-[11px] font-medium leading-5 text-slate-600">{shelf.description}</p>}
                </div>
                <p className="text-sm leading-6 text-slate-600">Choose the product, layer, and bin. This stays attached to the shelf even when you drag it in Design Mode.</p>
                <div>
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="assignment-product">Product</label>
                    <input
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-400 focus:bg-white"
                        id="assignment-product"
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setSelectedProduct(null);
                        }}
                        placeholder="Search name, SKU, or material code"
                        value={query}
                    />
                    {results.length > 0 && !selectedProduct && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                            {results.map((product) => (
                                <button
                                    className="flex w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left text-sm transition last:border-b-0 hover:bg-indigo-50"
                                    key={product.id}
                                    onClick={() => {
                                        setSelectedProduct(product);
                                        setQuery(product.name || product.sku || '');
                                    }}
                                    type="button"
                                >
                                    <span className="min-w-0 truncate font-semibold text-slate-800">{product.name || 'Unnamed product'}</span>
                                    <span className="shrink-0 font-mono text-xs text-slate-500">{product.sku || 'No SKU'}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="assignment-layer">Layer</label>
                    <select
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-400 focus:bg-white"
                        id="assignment-layer"
                        onChange={(event) => setLayerNumber(Number(event.target.value))}
                        value={layerNumber}
                    >
                        {Array.from({ length: Math.max(1, Math.min(shelf?.layerCount || 1, 12)) }, (_, index) => index + 1).map((layer) => (
                            <option key={layer} value={layer}>Layer {layer}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500" htmlFor="assignment-bin">Bin</label>
                    <select
                        className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-900 outline-none focus:border-indigo-400 focus:bg-white"
                        id="assignment-bin"
                        onChange={(event) => setBinNumber(Number(event.target.value))}
                        value={binNumber}
                    >
                        {Array.from({ length: Math.max(1, Math.min(shelf?.binCount || 1, SHELF_BIN_RANGE.MAX)) }, (_, index) => index + 1).map((bin) => (
                            <option key={bin} value={bin}>Bin {bin}</option>
                        ))}
                    </select>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Current shelf map</p>
                    <div className="mt-2 space-y-1.5">
                        {assignedProducts.map((location) => (
                            <p className="text-xs font-semibold text-slate-600" key={location.productId}>
                                {location.productName || location.sku || 'Unnamed product'} · Layer {location.layerNumber || 1} · Bin {location.binNumber || '-'}
                            </p>
                        ))}
                        {!assignedProducts.length && <p className="text-xs text-slate-400">No products assigned yet.</p>}
                    </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                    <Button onClick={onClose}>Cancel</Button>
                    <Button disabled={!selectedProduct || isSaving} onClick={() => void saveAssignment()} tone="primary">
                        <Save className="h-4 w-4" />
                        {isSaving ? 'Saving…' : 'Save location'}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function useLocatorKeyboardShortcuts(onSaveLayout) {
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const cancelWallDrawing = useLocator3DStore((state) => state.cancelWallDrawing);
    const clearSelection = useLocator3DStore((state) => state.clearSelection);
    const deleteSelectedObject = useLocator3DStore((state) => state.deleteSelectedObject);
    const duplicateSelectedObject = useLocator3DStore((state) => state.duplicateSelectedObject);
    const nudgeSelectedObjects = useLocator3DStore((state) => state.nudgeSelectedObjects);
    const redo = useLocator3DStore((state) => state.redo);
    const undo = useLocator3DStore((state) => state.undo);

    useEffect(() => {
        const onKeyDown = (event) => {
            const tag = event.target?.tagName?.toLowerCase();
            const isEditing = tag === 'input' || tag === 'textarea' || tag === 'select';

            if (event.key === 'Escape') {
                if (activeTool === 'draw-wall') {
                    cancelWallDrawing();
                } else {
                    clearSelection();
                }
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                onSaveLayout?.();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey) {
                event.preventDefault();
                undo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
                event.preventDefault();
                redo();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && !isEditing) {
                event.preventDefault();
                duplicateSelectedObject();
                return;
            }
            if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditing) {
                deleteSelectedObject();
                return;
            }
            if (event.key.startsWith('Arrow') && !isEditing) {
                event.preventDefault();
                nudgeSelectedObjects(event.key, event.shiftKey ? 4 : 1);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeTool, cancelWallDrawing, clearSelection, deleteSelectedObject, duplicateSelectedObject, nudgeSelectedObjects, onSaveLayout, redo, undo]);
}

export default function Locator3DAdmin() {
    const { error: showError, info, success, warning } = useToast();
    const authContext = useContext(AuthContext);
    const routeLocation = useLocation();
    const [searchParams] = useSearchParams();
    const productFromRoute = routeLocation.state?.product ?? null;
    const productId = searchParams.get('productId') || routeLocation.state?.productId || productFromRoute?.id || '';
    const productName = searchParams.get('name') || productFromRoute?.name || '';
    const productSku = searchParams.get('sku') || productFromRoute?.sku || '';

    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const defaultLayoutObjects = useLocator3DStore((state) => state.defaultLayoutObjects);
    const discardAutosave = useLocator3DStore((state) => state.discardAutosave);
    const discardUnsavedChanges = useLocator3DStore((state) => state.discardUnsavedChanges);
    const hasUnsavedChanges = useLocator3DStore((state) => state.hasUnsavedChanges);
    const loadLayoutData = useLocator3DStore((state) => state.loadLayoutData);
    const locateProduct = useLocator3DStore((state) => state.locateProduct);
    const markLayoutSaved = useLocator3DStore((state) => state.markLayoutSaved);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const recoverAutosave = useLocator3DStore((state) => state.recoverAutosave);
    const resetCurrentFloor = useLocator3DStore((state) => state.resetCurrentFloor);
    const resetToDefaultLayout = useLocator3DStore((state) => state.resetToDefaultLayout);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const setDesignMode = useLocator3DStore((state) => state.setDesignMode);
    const setProductLocations = useLocator3DStore((state) => state.setProductLocations);
    const setSelectedProductForLocation = useLocator3DStore((state) => state.setSelectedProductForLocation);

    const [autosaveSnapshot, setAutosaveSnapshot] = useState(null);
    const [assignmentShelf, setAssignmentShelf] = useState(null);
    const [isLoadingLayout, setIsLoadingLayout] = useState(false);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [layoutName, setLayoutName] = useState(LOCATOR_LAYOUT_NAME);
    const [layoutOptions, setLayoutOptions] = useState([LOCATOR_LAYOUT_NAME]);
    const [priorityLayoutName, setPriorityLayoutName] = useState('');
    const [locationNotice, setLocationNotice] = useState(EMPTY_LOCATION_NOTICE);
    const [pendingAction, setPendingAction] = useState(null);
    const [products, setProducts] = useState([]);
    const canvasShellRef = useRef(null);
    const canEditLayout = Boolean(authContext?.isAdmin);

    useEffect(() => {
        setAutosaveSnapshot(getLocatorAutosave());
    }, []);

    useEffect(() => {
        const onBeforeUnload = (event) => {
            if (!hasUnsavedChanges) {
                return;
            }
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => window.removeEventListener('beforeunload', onBeforeUnload);
    }, [hasUnsavedChanges]);

    const refreshLayoutOptions = useCallback(async () => {
        try {
            const layouts = await listStoreLayouts();
            const names = layouts.map((layout) => layout.layoutName).filter(Boolean);
            const priority = layouts.find((layout) => layout.isPriority)?.layoutName;
            if (priority) {
                setPriorityLayoutName(priority);
            }
            setLayoutOptions((current) => [...new Set([LOCATOR_LAYOUT_NAME, layoutName, ...current, ...names])]);
        } catch {
            setLayoutOptions((current) => [...new Set([LOCATOR_LAYOUT_NAME, layoutName, ...current])]);
        }
    }, [layoutName]);

    const handleSaveLayout = useCallback(async (name = layoutName, options = {}) => {
        const safeName = String(name || LOCATOR_LAYOUT_NAME).trim() || LOCATOR_LAYOUT_NAME;
        const priority = options.priority === true || (options.priority === undefined && safeName === priorityLayoutName);
        setIsSavingLayout(true);
        try {
            if (priority) {
                await saveStoreLayout(sceneObjects, safeName, { priority: true });
            } else {
                await saveStoreLayout(sceneObjects, safeName);
            }
            if (priority) {
                await setStoreLayoutPriority(safeName);
                setPriorityLayoutName(safeName);
            }
            markLayoutSaved();
            setAutosaveSnapshot(null);
            setLayoutName(safeName);
            setLayoutOptions((current) => [...new Set([safeName, ...current])]);
            success('Layout saved.');
            return true;
        } catch (saveError) {
            showError(saveError.message || 'Could not save layout. Your changes remain open in this session.');
            return false;
        } finally {
            setIsSavingLayout(false);
        }
    }, [layoutName, markLayoutSaved, priorityLayoutName, sceneObjects, showError, success]);

    const handleSetPriority = useCallback(async (name) => {
        const safeName = String(name || '').trim();
        if (!safeName) {
            return;
        }
        setIsSavingLayout(true);
        try {
            await setStoreLayoutPriority(safeName);
            setPriorityLayoutName(safeName);
            success(`“${safeName}” is now the priority stockroom.`);
        } catch (priorityError) {
            showError(priorityError.message || 'Could not update the priority stockroom.');
        } finally {
            setIsSavingLayout(false);
        }
    }, [showError, success]);

    const locateFromProduct = useCallback((product, locations = productLocations) => {
        const location = locations.find((item) => String(item.productId) === String(product.id)) ?? null;
        const details = resolveProductDetails({
            catalogProducts: products,
            fallbackProduct: product,
            location,
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
        });
        setSelectedProductForLocation(details);

        if (!location) {
            locateProduct(null);
            setLocationNotice({
                message: 'This product has no saved shelf and bin location yet.',
                tone: 'warning',
            });
            warning('This product does not have a saved 3D bin location yet.');
            return;
        }

        const shelf = getShelfObjectByLocation(location, useLocator3DStore.getState().sceneObjects);
        if (!shelf) {
            locateProduct(null);
            setLocationNotice({
                message: 'The saved location belongs to a shelf that is not in this layout.',
                tone: 'warning',
            });
            warning('This product location is not mapped to the current 3D layout.');
            return;
        }

        const mappedLocation = {
            ...location,
            floor: Number(location.floor || shelf.floor || 1),
            productName: details.name || location.productName,
            shelfObjectId: shelf.id || location.shelfObjectId,
            sku: details.sku || location.sku,
        };
        locateProduct(mappedLocation);
        setLocationNotice({
            message: 'Located ' + details.name + ' · ' + formatLocation(mappedLocation),
            tone: 'success',
        });
        success('Product located in the 3D stockroom.');
    }, [locateProduct, productLocations, products, setSelectedProductForLocation, success, warning]);

    const handleLoadLayout = useCallback(async (name = layoutName) => {
        const safeName = String(name || LOCATOR_LAYOUT_NAME).trim() || LOCATOR_LAYOUT_NAME;
        setIsLoadingLayout(true);
        try {
            const [savedLayout, locations] = await Promise.all([
                loadStoreLayout(safeName),
                getProductLocations(),
            ]);
            if (savedLayout?.layoutData) {
                loadLayoutData(savedLayout.layoutData);
                markLayoutSaved();
                setLayoutName(savedLayout.layoutName || safeName);
                if (savedLayout.isPriority) {
                    setPriorityLayoutName(savedLayout.layoutName || safeName);
                }
            } else {
                resetToDefaultLayout();
                markLayoutSaved();
                info('No saved layout was found. The protected default layout is shown.');
            }
            setProductLocations(locations || []);
            setAutosaveSnapshot(null);
            setLocationNotice(EMPTY_LOCATION_NOTICE);
            success('3D layout loaded.');
        } catch (loadError) {
            showError(loadError.message || 'Could not load the 3D layout.');
        } finally {
            setIsLoadingLayout(false);
        }
    }, [info, layoutName, loadLayoutData, markLayoutSaved, resetToDefaultLayout, setProductLocations, showError, success]);

    const addedShelfMappings = useMemo(() => {
        const defaultIds = new Set(defaultLayoutObjects.map((object) => object.id));
        return productLocations.filter((location) => (
            location.shelfObjectId
            && !defaultIds.has(location.shelfObjectId)
            && (activeFloor ? Number(location.floor || 1) === activeFloor : true)
        ));
    }, [activeFloor, defaultLayoutObjects, productLocations]);

    const requestResetFloor = () => {
        if (addedShelfMappings.length) {
            setPendingAction({ count: addedShelfMappings.length, type: 'mapping-safety' });
            return;
        }
        setPendingAction({ type: 'reset-floor' });
    };

    const requestResetStockroom = () => {
        const defaultIds = new Set(defaultLayoutObjects.map((object) => object.id));
        const mappings = productLocations.filter((location) => location.shelfObjectId && !defaultIds.has(location.shelfObjectId));
        if (mappings.length) {
            setPendingAction({ count: mappings.length, type: 'mapping-safety' });
            return;
        }
        setPendingAction({ type: 'reset-all' });
    };

    const requestDeleteShelf = (shelf) => {
        const mappings = productLocations.filter((location) => location.shelfObjectId === shelf.id);
        if (mappings.length) {
            setPendingAction({ count: mappings.length, shelf, type: 'delete-mapped-shelf' });
            return;
        }
        useLocator3DStore.getState().deleteSelectedObject();
    };

    const confirmPendingAction = async () => {
        const type = pendingAction?.type;
        setPendingAction(null);
        if (type === 'reset-floor') {
            resetCurrentFloor();
            locateProduct(null);
            setLocationNotice(EMPTY_LOCATION_NOTICE);
            success('Current floor restored locally. Save when you are ready.');
            return;
        }
        if (type === 'reset-all') {
            resetToDefaultLayout();
            locateProduct(null);
            setLocationNotice(EMPTY_LOCATION_NOTICE);
            success('The protected default stockroom is restored locally. Save when you are ready.');
            return;
        }
        if (type === 'exit-save') {
            if (await handleSaveLayout()) {
                setDesignMode(false);
            }
            return;
        }
        if (type === 'exit-discard') {
            discardUnsavedChanges();
            setAutosaveSnapshot(null);
            setDesignMode(false);
            success('Unsaved layout changes discarded.');
        }
    };

    const exitDesignMode = () => {
        if (!hasUnsavedChanges) {
            setDesignMode(false);
            return;
        }
        setPendingAction({ type: 'exit' });
    };

    useEffect(() => {
        void refreshLayoutOptions();
    }, [refreshLayoutOptions]);

    useEffect(() => {
        let active = true;
        setIsLoadingProducts(true);
        void Promise.all([getFullProductCatalog(), getProductLocations()])
            .then(([catalogProducts, locations]) => {
                if (!active) {
                    return;
                }
                setProducts(Array.isArray(catalogProducts) ? catalogProducts : []);
                setProductLocations(Array.isArray(locations) ? locations : []);
            })
            .catch((loadError) => {
                if (active) {
                    showError(loadError.message || 'Could not load product search data.');
                }
            })
            .finally(() => {
                if (active) {
                    setIsLoadingProducts(false);
                }
            });
        return () => {
            active = false;
        };
    }, [setProductLocations, showError]);

    useEffect(() => {
        if (!productId) {
            return;
        }
        let active = true;
        void Promise.all([loadStoreLayout(layoutName), getProductLocations(), getFullProductCatalog()])
            .then(([savedLayout, locations, catalogProducts]) => {
                if (!active) {
                    return;
                }
                if (savedLayout?.layoutData) {
                    loadLayoutData(savedLayout.layoutData);
                    markLayoutSaved();
                }
                setProductLocations(locations || []);
                setProducts(catalogProducts || []);
                const product = resolveProductDetails({
                    catalogProducts: catalogProducts || [],
                    fallbackProduct: productFromRoute,
                    location: (locations || []).find((item) => String(item.productId) === String(productId)),
                    productId,
                    productName,
                    productSku,
                });
                const location = (locations || []).find((item) => String(item.productId) === String(product.id)) ?? null;
                const shelf = location ? getShelfObjectByLocation(location, useLocator3DStore.getState().sceneObjects) : null;
                if (location && shelf) {
                    locateProduct({ ...location, productName: product.name, shelfObjectId: shelf.id, sku: product.sku || location.sku });
                    setLocationNotice({ message: 'Located ' + product.name + ' · ' + formatLocation(location), tone: 'success' });
                } else {
                    locateProduct(null);
                    setSelectedProductForLocation(product);
                    setLocationNotice({
                        message: product.name + ' has no saved shelf and bin location yet.',
                        tone: 'warning',
                    });
                }
            })
            .catch((loadError) => {
                if (active) {
                    showError(loadError.message || 'Could not load the selected product location.');
                }
            });
        return () => {
            active = false;
        };
    }, [layoutName, loadLayoutData, locateProduct, markLayoutSaved, productFromRoute, productId, productName, productSku, setProductLocations, setSelectedProductForLocation, showError]);

    useLocatorKeyboardShortcuts(() => void handleSaveLayout());

    const pendingTitle = pendingAction?.type === 'exit'
        ? 'Save layout changes?'
        : pendingAction?.type === 'reset-floor'
            ? 'Reset Floor ' + activeFloor + '?'
            : pendingAction?.type === 'reset-all'
                ? 'Reset entire stockroom?'
                : pendingAction?.type === 'delete-mapped-shelf'
                    ? 'Delete ' + (pendingAction?.shelf?.name || 'shelf') + '?'
                    : 'Product locations need attention';

    return (
        <div className="min-w-0 space-y-5 bg-[#f6f8fc] p-3 text-slate-950 sm:p-5 lg:p-7">
            <StockroomHeader
                canEditLayout={canEditLayout}
                hasUnsavedChanges={hasUnsavedChanges}
                isLoadingProducts={isLoadingProducts}
                isSaving={isSavingLayout}
                layoutName={layoutName}
                layoutOptions={layoutOptions}
                priorityLayoutName={priorityLayoutName}
                onSetPriority={(name) => void handleSetPriority(name)}
                locationNotice={locationNotice}
                onChangeLayoutName={setLayoutName}
                onExitDesignMode={exitDesignMode}
                onLoadLayout={(name) => void handleLoadLayout(name)}
                onLocateProduct={locateFromProduct}
                onSaveLayout={(name, options) => void handleSaveLayout(name, options)}
                onSelectLayout={setLayoutName}
                productLocations={productLocations}
                products={products}
                sceneObjects={sceneObjects}
            />

            <AutosaveRecoveryBanner
                onDiscard={() => {
                    discardAutosave();
                    setAutosaveSnapshot(null);
                }}
                onRecover={() => {
                    if (recoverAutosave()) {
                        setAutosaveSnapshot(null);
                        info('Unsaved 3D layout recovered locally.');
                    }
                }}
                snapshot={autosaveSnapshot}
            />

            <main
                aria-label="3D stockroom canvas"
                className="relative h-[min(72vh,800px)] min-h-[520px] overflow-hidden rounded-[20px] border border-slate-200 bg-slate-950 shadow-[0_20px_50px_rgba(15,23,42,0.12)]"
                ref={canvasShellRef}
            >
                <Locator3DScene onShelfClick={canEditLayout ? setAssignmentShelf : undefined} />
                <LocatedProductNote notice={locationNotice} />
                <FloorInfo />
                <ViewportControls canvasShellRef={canvasShellRef} />
                <DesignToolbar
                    isSaving={isSavingLayout}
                    onDiscardChanges={() => {
                        discardUnsavedChanges();
                        setAutosaveSnapshot(null);
                        success('Unsaved layout changes discarded.');
                    }}
                    onOpenAssignment={setAssignmentShelf}
                    onRequestDelete={requestDeleteShelf}
                    onRequestResetFloor={requestResetFloor}
                    onRequestResetStockroom={requestResetStockroom}
                    onSave={() => void handleSaveLayout()}
                />
                <ShelfInspector
                    onOpenAssignment={setAssignmentShelf}
                    productLocations={productLocations}
                    products={products}
                />
                {isLoadingLayout && (
                    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm" role="status">
                        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-xl">
                            <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
                            Loading stockroom…
                        </div>
                    </div>
                )}
                {isSavingLayout && (
                    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm" role="status">
                        <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-4 text-sm font-semibold text-slate-700 shadow-xl">
                            <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600" />
                            Saving stockroom design…
                        </div>
                    </div>
                )}
                <div className="pointer-events-none absolute bottom-4 right-4 z-10 hidden rounded-lg bg-slate-950/55 px-3 py-2 text-[11px] font-medium text-white/80 backdrop-blur sm:block">Drag to rotate · Scroll to zoom</div>
            </main>

            <SummaryCards />

            <ProductAssignmentModal
                isOpen={Boolean(assignmentShelf)}
                onAssigned={(location) => {
                    setLocationNotice({ message: 'Mapped ' + (location.productName || 'product') + ' · ' + formatLocation(location), tone: 'success' });
                }}
                onClose={() => setAssignmentShelf(null)}
                products={products}
                shelf={assignmentShelf}
            />

            <Modal
                closeOnBackdrop={pendingAction?.type !== 'exit'}
                isOpen={Boolean(pendingAction)}
                onClose={() => setPendingAction(null)}
                title={pendingTitle}
                footer={pendingAction?.type === 'exit' ? (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button onClick={() => setPendingAction(null)}>Cancel</Button>
                        <Button onClick={() => setPendingAction({ type: 'exit-discard' })} tone="danger">Discard</Button>
                        <Button onClick={() => setPendingAction({ type: 'exit-save' })} tone="primary">Save & Exit</Button>
                    </div>
                ) : pendingAction?.type === 'mapping-safety' || pendingAction?.type === 'delete-mapped-shelf' ? (
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setPendingAction(null)}>Cancel</Button>
                        <Button onClick={() => {
                            setPendingAction(null);
                            warning('Move the listed product mappings to a different shelf before changing this structure.');
                        }}
                        tone="primary"
                        >
                            Move Products First
                        </Button>
                    </div>
                ) : (
                    <div className="flex justify-end gap-2">
                        <Button onClick={() => setPendingAction(null)}>Cancel</Button>
                        <Button onClick={() => void confirmPendingAction()} tone="danger">
                            {pendingAction?.type === 'reset-floor' ? 'Reset Floor' : 'Reset Stockroom'}
                        </Button>
                    </div>
                )}
            >
                {pendingAction?.type === 'exit' ? (
                    <p className="text-sm leading-6 text-slate-600">Your current layout edits are local and unsaved. Product, inventory, and business records will not be affected.</p>
                ) : pendingAction?.type === 'mapping-safety' ? (
                    <div className="flex gap-3 text-sm leading-6 text-slate-600">
                        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                        <p>{pendingAction.count} product mapping{pendingAction.count === 1 ? '' : 's'} belong to shelves added outside the protected default layout. Reassign those products before reset so no saved location becomes orphaned.</p>
                    </div>
                ) : pendingAction?.type === 'delete-mapped-shelf' ? (
                    <div className="flex gap-3 text-sm leading-6 text-slate-600">
                        <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-600" />
                        <p>This shelf contains {pendingAction.count} mapped product{pendingAction.count === 1 ? '' : 's'}. Reassign them first; the editor will not silently delete any product-location mapping.</p>
                    </div>
                ) : (
                    <p className="text-sm leading-6 text-slate-600">
                        {pendingAction?.type === 'reset-floor'
                            ? 'This restores only the active floor to the protected default layout. Other floors and all business data remain unchanged.'
                            : 'This restores all 3D layout objects to the protected default. Products, inventory, users, sales, and all other business data remain unchanged.'}
                    </p>
                )}
            </Modal>
        </div>
    );
}
