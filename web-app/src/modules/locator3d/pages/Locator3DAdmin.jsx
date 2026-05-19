import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
    AlertTriangle,
    ArrowLeft,
    Box,
    Boxes,
    BrickWall,
    Camera,
    CheckCircle2,
    ChevronDown,
    DoorOpen,
    ExternalLink,
    Grid3X3,
    LayoutDashboard,
    Lock,
    Maximize2,
    Monitor,
    Minimize2,
    MapPin,
    Navigation,
    Package,
    PanelLeftClose,
    PanelLeftOpen,
    RefreshCw,
    Route,
    Save,
    Search,
    SlidersHorizontal,
    Store,
    Trash2,
    Unlock,
    Waypoints,
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
    getProductLocation,
    getProductLocations,
    listStoreLayouts,
    loadStoreLayout,
    saveStoreLayout,
} from '../services/locator3DApi';
import { useLocator3DStore } from '../store/useLocator3DStore';

const libraryIconMap = {
    Box,
    Boxes,
    BrickWall,
    DoorOpen,
    Monitor,
    Package,
    Store,
    Waypoints,
};

function cx(...classes) {
    return classes.filter(Boolean).join(' ');
}

function formatNumber(value) {
    return Number(Number(value || 0).toFixed(3));
}

function toDegrees(value) {
    return Math.round((Number(value || 0) * 180) / Math.PI);
}

function toRadians(value) {
    return (Number(value || 0) * Math.PI) / 180;
}

function DesignModeSwitch() {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const setDesignMode = useLocator3DStore((state) => state.setDesignMode);

    return (
        <button
            aria-checked={isDesignMode}
            aria-label="Design Mode"
            className={cx(
                'group flex min-h-11 min-w-[220px] items-center justify-between gap-4 rounded-xl border px-4 text-left transition',
                isDesignMode
                    ? 'border-sky-300/60 bg-sky-400/15 text-sky-50 shadow-sm shadow-sky-950/20'
                    : 'border-emerald-300/30 bg-emerald-400/10 text-emerald-50 hover:border-emerald-300/50 hover:bg-emerald-400/15',
            )}
            onClick={() => setDesignMode(!isDesignMode)}
            role="switch"
            type="button"
        >
            <span>
                <span className="block text-sm font-black">{isDesignMode ? 'Edit Layout mode' : 'Locate / View mode'}</span>
                <span className="block text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">
                    {isDesignMode ? 'Editing enabled' : 'Product locating'}
                </span>
            </span>
            <span className={cx('flex h-6 w-11 items-center rounded-full p-1 transition', isDesignMode ? 'bg-sky-200/25' : 'bg-emerald-100/25')}>
                <span className={cx('h-4 w-4 rounded-full bg-white shadow transition', isDesignMode ? 'translate-x-5' : 'translate-x-0')} />
            </span>
        </button>
    );
}

function TopButton({ children, className = '', ...props }) {
    return (
        <button
            className={cx(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-200 shadow-sm transition hover:border-sky-300/40 hover:bg-white/[0.1] disabled:cursor-wait disabled:opacity-60',
                className,
            )}
            type="button"
            {...props}
        >
            {children}
        </button>
    );
}

const PRODUCT_LOCATION_INITIAL_STATE = {
    location: null,
    message: '',
    product: null,
    status: 'idle',
};

function getProductStock(product = {}) {
    const value = product.quantity ?? product.stock ?? product.onHand ?? product.on_hand ?? 0;
    const numericValue = Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
}

function resolveProductDetails({ catalogProducts = [], fallbackProduct = null, location = null, productId = '', productName = '', productSku = '' }) {
    const matchedProduct = catalogProducts.find((product) => product.id === productId) ?? fallbackProduct ?? {};

    return {
        ...matchedProduct,
        id: matchedProduct.id || productId,
        name: matchedProduct.name || location?.productName || productName || 'Selected product',
        quantity: getProductStock(matchedProduct),
        sku: matchedProduct.sku || location?.sku || productSku || '',
        stock: getProductStock(matchedProduct),
    };
}

function formatLocatorTextLocation(location) {
    if (!location) {
        return 'Unassigned';
    }

    return [
        location.aisle ? `Aisle ${normalizeAisle(location.aisle)}` : null,
        location.shelfNumber ? `Shelf ${location.shelfNumber}` : null,
        location.binNumber ? `Bin ${location.binNumber}` : null,
    ].filter(Boolean).join(' - ') || 'Unassigned';
}

function TopBar({
    isSidebarOpen,
    isLoadingLayout,
    isSavingLayout,
    layoutName,
    layoutOptions,
    onConfirmSaveLayout,
    onLoadLayout,
    onResetLayout,
    onSaveNameChange,
    onSelectLayout,
    onToggleSidebar,
    selectedLayoutName,
}) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const goToFloor = useLocator3DStore((state) => state.goToFloor);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const toggleObjectLock = useLocator3DStore((state) => state.toggleObjectLock);
    const selectedObject = getLocatorObjectById(selectedObjectId, sceneObjects);
    const [isSaveOpen, setIsSaveOpen] = useState(false);
    const busy = isLoadingLayout || isSavingLayout;

    const handleSaveClick = () => {
        if (!isSaveOpen) {
            setIsSaveOpen(true);
            return;
        }

        onConfirmSaveLayout();
    };

    return (
        <header className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-[0_18px_60px_rgba(2,6,23,0.18)]">
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                    <button
                        aria-label={isSidebarOpen ? 'Collapse locator sidebar' : 'Expand locator sidebar'}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-200 transition hover:border-sky-300/40 hover:bg-white/[0.1] xl:hidden"
                        onClick={onToggleSidebar}
                        type="button"
                    >
                        {isSidebarOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
                    </button>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200 ring-1 ring-sky-300/25">
                        <LayoutDashboard className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-slate-500">Stockroom intelligence</p>
                        <h1 className="truncate text-2xl font-black text-white">3D Stockroom Locator</h1>
                    </div>
                </div>

                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] 2xl:min-w-[720px]">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <div className="min-w-[210px] rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Current layout</p>
                            <div className="mt-1 flex items-center gap-2">
                                <span className="truncate text-sm font-black text-slate-100">{selectedLayoutName || LOCATOR_LAYOUT_NAME}</span>
                                <select
                                    aria-label="Saved layouts"
                                    className="h-8 min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-900 px-2 text-xs font-black text-slate-200 outline-none transition focus:border-sky-300/50"
                                    onChange={(event) => onSelectLayout(event.target.value)}
                                    value={selectedLayoutName}
                                >
                                    {layoutOptions.map((layout) => (
                                        <option key={layout} value={layout}>{layout}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="inline-flex min-h-11 rounded-xl border border-white/10 bg-white/[0.05] p-1" aria-label="Floor switching">
                            {[1, 2].map((floor) => (
                                <button
                                    aria-label={`Go to Floor ${floor}`}
                                    className={cx(
                                        'min-h-9 rounded-lg px-4 text-xs font-black transition',
                                        activeFloor === floor
                                            ? 'bg-white text-slate-950 shadow-sm'
                                            : 'text-slate-400 hover:bg-white/[0.08] hover:text-slate-100',
                                    )}
                                    key={floor}
                                    onClick={() => goToFloor(floor)}
                                    type="button"
                                >
                                    Floor {floor}
                                </button>
                            ))}
                        </div>

                        <Link
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-black text-slate-200 transition hover:border-sky-300/40 hover:bg-white/[0.1]"
                            to="/inventory"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Back to Inventory
                        </Link>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 md:justify-end">
                        <DesignModeSwitch />
                        <div className="relative flex items-center gap-2">
                            {isSaveOpen && (
                                <input
                                    aria-label="Layout name"
                                    className="h-10 w-44 rounded-xl border border-white/10 bg-slate-900 px-3 text-xs font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50"
                                    onChange={(event) => onSaveNameChange(event.target.value)}
                                    placeholder="Layout name"
                                    value={layoutName}
                                />
                            )}
                            <TopButton
                                aria-label={isSaveOpen ? 'Confirm Save Layout' : 'Save Layout'}
                                className="border-sky-300/40 bg-sky-400/20 text-sky-50 hover:bg-sky-400/25"
                                disabled={busy}
                                onClick={handleSaveClick}
                            >
                                <Save className="h-4 w-4" />
                                {isSavingLayout ? 'Saving' : isSaveOpen ? 'Save' : 'Save Layout'}
                            </TopButton>
                        </div>
                        <TopButton aria-label="Load Layout" disabled={busy} onClick={onLoadLayout}>
                            <RefreshCw className={cx('h-4 w-4', isLoadingLayout && 'animate-spin')} />
                            Load Layout
                        </TopButton>
                        <TopButton aria-label="Reset to Default" onClick={onResetLayout}>
                            <Store className="h-4 w-4" />
                            Reset
                        </TopButton>

                        {isDesignMode && selectedObject && (
                            <TopButton
                                aria-label={selectedObject.isLocked ? 'Unlock selected object' : 'Lock selected object'}
                                className={selectedObject.isLocked ? 'border-emerald-300/30 bg-emerald-400/12 text-emerald-100' : 'border-amber-300/30 bg-amber-400/12 text-amber-100'}
                                onClick={() => toggleObjectLock(selectedObject.id)}
                            >
                                {selectedObject.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                {selectedObject.isLocked ? 'Unlock' : 'Lock'}
                            </TopButton>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
}

function ObjectLibraryDropdown() {
    const addSceneObject = useLocator3DStore((state) => state.addSceneObject);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const lockAllObjects = useLocator3DStore((state) => state.lockAllObjects);
    const objectLibrary = useLocator3DStore((state) => state.objectLibrary);
    const unlockAllObjects = useLocator3DStore((state) => state.unlockAllObjects);
    const [isOpen, setIsOpen] = useState(false);

    if (!isDesignMode) {
        return null;
    }

    return (
        <div className="absolute left-4 top-4 z-20 w-[280px]">
            <button
                aria-expanded={isOpen}
                aria-label="Object Library"
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-slate-950/88 px-4 py-3 text-sm font-black text-white shadow-[0_18px_48px_rgba(2,6,23,0.32)] backdrop-blur-xl transition hover:border-sky-400/40"
                onClick={() => setIsOpen((value) => !value)}
                type="button"
            >
                <span className="flex items-center gap-2">
                    <Box className="h-4 w-4 text-sky-300" />
                    Object Library
                </span>
                <ChevronDown className={cx('h-4 w-4 transition', isOpen && 'rotate-180')} />
            </button>
            {isOpen && (
                <div className="mt-2 rounded-2xl border border-white/10 bg-slate-950/94 p-2 shadow-[0_24px_70px_rgba(2,6,23,0.46)] backdrop-blur-xl">
                    <div className="grid gap-2">
                        {objectLibrary.map((object) => {
                            const Icon = libraryIconMap[object.icon] ?? Box;

                            return (
                                <button
                                    aria-label={`Add ${object.label}`}
                                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-left transition hover:border-sky-400/40 hover:bg-sky-400/10"
                                    key={object.type}
                                    onClick={() => addSceneObject(object.type)}
                                    type="button"
                                >
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10" style={{ backgroundColor: object.color }}>
                                        <Icon className="h-4 w-4 text-white" />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black text-white">{object.label}</span>
                                        <span className="block truncate text-xs font-semibold text-slate-500">{object.description}</span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 border-t border-white/10 pt-2">
                        <button
                            aria-label="Lock All Objects"
                            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs font-black text-amber-100 transition hover:bg-amber-400/15"
                            onClick={lockAllObjects}
                            type="button"
                        >
                            Lock All
                        </button>
                        <button
                            aria-label="Unlock All Objects"
                            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/15"
                            onClick={unlockAllObjects}
                            type="button"
                        >
                            Unlock All
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function ProductLocatorSidebar({ isLoadingLayout, isLoadingProducts, isOpen, onCollapse, onLocateProduct, productLocations, products, sceneObjects }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLowerCase();
    const mappedProducts = useMemo(() => (
        productLocations
            .map((location) => {
                const shelf = getShelfObjectByLocation(location, sceneObjects);

                if (!shelf) {
                    return null;
                }

                const product = resolveProductDetails({
                    catalogProducts: products,
                    location,
                    productId: location.productId,
                    productName: location.productName,
                    productSku: location.sku,
                });

                return {
                    location: {
                        ...location,
                        floor: Number(location.floor || shelf.floor || 1),
                        shelfObjectId: shelf.id || location.shelfObjectId,
                    },
                    product,
                    shelf,
                };
            })
            .filter(Boolean)
            .sort((left, right) => {
                const floorDelta = Number(left.location.floor || 1) - Number(right.location.floor || 1);

                if (floorDelta !== 0) {
                    return floorDelta;
                }

                return String(left.product.name).localeCompare(String(right.product.name));
            })
    ), [productLocations, products, sceneObjects]);
    const filteredProducts = useMemo(() => {
        if (!normalizedQuery) {
            return mappedProducts;
        }

        return mappedProducts.filter(({ location, product }) => {
            const haystack = [
                product.name,
                product.sku,
                location.productName,
                location.sku,
                formatLocatorTextLocation(location),
                `floor ${location.floor}`,
            ].filter(Boolean).join(' ').toLowerCase();

            return haystack.includes(normalizedQuery);
        });
    }, [mappedProducts, normalizedQuery]);
    const recentlyLocated = locatedProduct
        ? mappedProducts.find(({ product }) => product.id === locatedProduct.productId)
        : null;
    const sidebarIsBusy = isLoadingLayout || isLoadingProducts;

    return (
        <AnimatePresence initial={false}>
            {isOpen && (
                <Motion.aside
                    animate={{ opacity: 1, x: 0 }}
                    aria-label="Product locator sidebar"
                    className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950 text-white shadow-[0_20px_70px_rgba(2,6,23,0.22)]"
                    exit={{ opacity: 0, x: -18 }}
                    initial={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                    <div className="border-b border-white/10 p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-slate-500">Product finder</p>
                                <h2 className="mt-1 text-lg font-black text-white">Located Products</h2>
                            </div>
                            <button
                                aria-label="Collapse locator sidebar"
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-300 transition hover:bg-white/[0.09] xl:hidden"
                                onClick={onCollapse}
                                type="button"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <p className="mt-2 text-xs font-semibold leading-5 text-slate-400">
                            Search by product name or SKU, then jump straight to the matching shelf in the 3D stockroom.
                        </p>
                        <label className="mt-4 block">
                            <span className="sr-only">Product Search</span>
                            <span className="relative block">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                                <input
                                    aria-label="Product Search"
                                    className="h-12 w-full rounded-xl border border-white/10 bg-white/[0.06] pl-10 pr-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 focus:bg-white/[0.09]"
                                    onChange={(event) => setQuery(event.target.value)}
                                    placeholder="Search name, SKU, aisle, bin"
                                    value={query}
                                />
                            </span>
                        </label>
                    </div>

                    <div className="max-h-[calc(76vh-180px)] min-h-[360px] overflow-auto p-3">
                        {sidebarIsBusy ? (
                            <div className="space-y-3" aria-label="Loading mapped products">
                                {[1, 2, 3, 4].map((item) => (
                                    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3" key={item}>
                                        <div className="h-4 w-2/3 animate-pulse rounded bg-white/10" />
                                        <div className="mt-3 h-3 w-1/2 animate-pulse rounded bg-white/10" />
                                    </div>
                                ))}
                            </div>
                        ) : filteredProducts.length > 0 ? (
                            <div className="space-y-2">
                                {recentlyLocated && (
                                    <div className="mb-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3">
                                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Recently located</p>
                                        <p className="mt-1 truncate text-sm font-black text-white">{recentlyLocated.product.name}</p>
                                    </div>
                                )}
                                {filteredProducts.map(({ location, product }) => {
                                    const isSelected = locatedProduct?.productId === product.id;
                                    const stock = getProductStock(product);

                                    return (
                                        <button
                                            aria-label={`Locate ${product.name} in 3D`}
                                            className={cx(
                                                'w-full rounded-xl border p-3 text-left transition',
                                                isSelected
                                                    ? 'border-emerald-300/60 bg-emerald-400/15 shadow-[0_12px_35px_rgba(16,185,129,0.16)]'
                                                    : 'border-white/10 bg-white/[0.04] hover:border-sky-300/35 hover:bg-white/[0.07]',
                                            )}
                                            key={`${product.id}-${location.shelfObjectId || location.aisle}-${location.binNumber}`}
                                            onClick={() => onLocateProduct(product)}
                                            type="button"
                                        >
                                            <span className="flex items-start justify-between gap-3">
                                                <span className="min-w-0">
                                                    <span className="block truncate text-sm font-black text-white">{product.name}</span>
                                                    <span className="mt-1 block truncate font-mono text-xs font-bold text-slate-400">{product.sku || 'No SKU'}</span>
                                                </span>
                                                <span className={cx(
                                                    'shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em]',
                                                    Number(location.floor || 1) === activeFloor
                                                        ? 'bg-sky-400/15 text-sky-100 ring-1 ring-sky-300/25'
                                                        : 'bg-white/10 text-slate-300',
                                                )}
                                                >
                                                    F{location.floor || 1}
                                                </span>
                                            </span>
                                            <span className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-slate-400">
                                                <span className="truncate">{formatLocatorTextLocation(location)}</span>
                                                <span className={stock > 0 ? 'text-emerald-200' : 'text-rose-200'}>{formatNumber(stock)} stock</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4 text-sm font-semibold leading-6 text-slate-400">
                                {mappedProducts.length === 0
                                    ? 'No products are mapped to shelves in this layout yet.'
                                    : 'No located products match that search.'}
                            </div>
                        )}
                    </div>

                    <div className={cx(
                        'border-t border-white/10 px-4 py-3 text-xs font-black uppercase tracking-[0.18em]',
                        isDesignMode ? 'bg-sky-400/10 text-sky-100' : 'bg-emerald-400/10 text-emerald-100',
                    )}
                    >
                        {isDesignMode ? 'Edit Layout mode' : 'Locate / View mode'}
                    </div>
                </Motion.aside>
            )}
        </AnimatePresence>
    );
}

function ProductLocationCard({ canEditLayout, onAnimatePath, onOpenEditLayout, state }) {
    const product = state?.product || {};
    const location = state?.location;
    const stock = formatNumber(getProductStock(product));
    const sku = product.sku || location?.sku || 'No part number';
    const productName = product.name || location?.productName || 'Selected product';
    const stockStatus = Number(stock) <= 0
        ? { className: 'border-rose-300/30 bg-rose-400/12 text-rose-100', label: 'Out of Stock' }
        : Number(stock) <= 5
            ? { className: 'border-amber-300/30 bg-amber-400/12 text-amber-100', label: 'Low Stock' }
            : { className: 'border-emerald-300/30 bg-emerald-400/12 text-emerald-100', label: 'In Stock' };

    if (!state || state.status === 'idle') {
        return (
            <section className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]" aria-label="Product Location">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Product Location</p>
                <h2 className="mt-2 text-lg font-black text-white">Ready to locate a product</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                    Pick a mapped item from the sidebar or arrive from Inventory to focus the camera on its shelf and bin.
                </p>
            </section>
        );
    }

    if (state.status === 'loading') {
        return (
            <section className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]" aria-label="Product Location">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200">
                        <MapPin className="h-5 w-5 animate-pulse" />
                    </span>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Product Location</p>
                        <h2 className="mt-1 text-base font-black text-white">Loading stockroom location...</h2>
                    </div>
                </div>
                <div className="mt-5 space-y-3">
                    <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
                    <div className="h-20 animate-pulse rounded-xl bg-white/[0.06]" />
                    <div className="h-11 animate-pulse rounded-xl bg-white/[0.06]" />
                </div>
            </section>
        );
    }

    if (state.status === 'error') {
        return (
            <section className="rounded-2xl border border-rose-300/30 bg-rose-950/70 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]" aria-label="Product Location">
                <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-400/15 text-rose-100">
                        <AlertTriangle className="h-5 w-5" />
                    </span>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-rose-200">Product Location</p>
                        <h2 className="mt-1 text-base font-black text-white">Unable to load product location</h2>
                        <p className="mt-2 text-xs font-semibold leading-5 text-rose-100/80">{state.message || 'Please reload the locator and try again.'}</p>
                    </div>
                </div>
            </section>
        );
    }

    if (state.status === 'empty') {
        return (
            <section className="rounded-2xl border border-amber-300/30 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]" aria-label="Product Location">
                <p className="text-[11px] font-black uppercase tracking-[0.22em] text-amber-200">Product Location</p>
                <h2 className="mt-2 text-base font-black text-white">This product has no stockroom location assigned yet</h2>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <p className="truncate text-sm font-black text-white">{productName}</p>
                    <p className="mt-1 font-mono text-xs font-bold text-slate-400">{sku}</p>
                </div>
                <p className="mt-3 text-xs font-semibold leading-5 text-amber-100/80">
                    {state.message || 'Assign this item to a shelf and bin before using 3D locate mode.'}
                </p>
                {canEditLayout && (
                    <button
                        className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/12 px-3 text-xs font-black text-amber-100 shadow-sm transition hover:bg-amber-400/18"
                        onClick={onOpenEditLayout}
                        type="button"
                    >
                        <Box className="h-4 w-4" />
                        Open Edit Layout
                    </button>
                )}
            </section>
        );
    }

    return (
        <section className="rounded-2xl border border-emerald-300/25 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]" aria-label="Product Location">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-200">Product Location</p>
                    <h2 className="mt-2 truncate text-lg font-black text-white">{productName}</h2>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className="rounded-full border border-emerald-300/30 bg-emerald-400/12 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-100">Mapped</span>
                    <span className={cx('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em]', stockStatus.className)}>{stockStatus.label}</span>
                </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Part No.</p>
                    <p className="mt-1 truncate font-mono text-xs font-black text-slate-100">{sku}</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.05] p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Stock</p>
                    <p className="mt-1 text-xs font-black text-slate-100">{stock} in stock</p>
                </div>
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-300/25 bg-emerald-400/10 p-3 text-sm font-black text-emerald-50">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{formatLocatorTextLocation(location)}</span>
            </div>
            <div className="mt-4 grid gap-2">
                <button
                    aria-label="Animate Path from Counter"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-xs font-black text-slate-950 shadow-sm transition hover:bg-emerald-400"
                    onClick={onAnimatePath}
                    type="button"
                >
                    <Route className="h-4 w-4" />
                    Animate Path from Counter
                </button>
                <Link
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-4 text-xs font-black text-slate-200 transition hover:border-sky-300/40 hover:bg-white/[0.09]"
                    to={product.id ? `/inventory?productId=${product.id}` : '/inventory'}
                >
                    <ExternalLink className="h-4 w-4" />
                    View Full Details
                </Link>
            </div>
        </section>
    );
}

function NumberField({ label, onChange, step = '0.1', value }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{label}</span>
            <input
                aria-label={label}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-bold text-white outline-none transition placeholder:text-slate-500 focus:border-sky-300/50 focus:bg-white/[0.09]"
                onChange={(event) => onChange(event.target.value)}
                step={step}
                type="number"
                value={value}
            />
        </label>
    );
}

function ShelfEditor({ object }) {
    const updateShelfProperties = useLocator3DStore((state) => state.updateShelfProperties);

    return (
        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <h3 className="text-sm font-black text-white">Shelf Details</h3>
            <div className="mt-4 space-y-3">
                <label className="block">
                    <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">Aisle name</span>
                    <input
                        aria-label="Aisle name"
                        className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm font-bold text-white outline-none transition focus:border-sky-300/50"
                        onChange={(event) => updateShelfProperties(object.id, { aisle: event.target.value })}
                        value={object.aisle}
                    />
                </label>
                <NumberField
                    label="Shelf Number"
                    onChange={(value) => updateShelfProperties(object.id, { shelfNumber: value })}
                    step="1"
                    value={object.shelfNumber}
                />
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400" htmlFor="locator-bin-count">Number of Bins</label>
                        <span className="rounded-full border border-sky-300/25 bg-sky-400/12 px-2 py-1 text-xs font-black text-sky-100 shadow-sm">{object.binCount}</span>
                    </div>
                    <input
                        aria-label="Number of Bins"
                        className="w-full accent-accent-primary"
                        id="locator-bin-count"
                        max={SHELF_BIN_RANGE.MAX}
                        min={SHELF_BIN_RANGE.MIN}
                        onChange={(event) => updateShelfProperties(object.id, { binCount: event.target.value })}
                        type="range"
                        value={object.binCount}
                    />
                </div>
            </div>
        </section>
    );
}

function ProductAssignmentModal({ isOpen, onClose, shelf }) {
    const { success, error: showError } = useToast();
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const upsertProductLocation = useLocator3DStore((state) => state.upsertProductLocation);
    const [products, setProducts] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isSavingLocation, setIsSavingLocation] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [selectedShelfId, setSelectedShelfId] = useState(shelf?.id || '');
    const [binNumber, setBinNumber] = useState(1);
    const availableShelves = useMemo(() => sceneObjects.filter(isShelfObject), [sceneObjects]);
    const selectedShelf = availableShelves.find((object) => object.id === selectedShelfId) ?? shelf ?? null;
    const binOptions = Array.from({ length: selectedShelf?.binCount || 0 }, (_, index) => index + 1);

    useEffect(() => {
        if (!isOpen) {
            return undefined;
        }

        let active = true;
        setIsLoadingProducts(true);

        void getFullProductCatalog()
            .then((catalogProducts) => {
                if (!active) {
                    return;
                }

                setProducts(catalogProducts);
                setSelectedProductId(catalogProducts[0]?.id || '');
                setSelectedShelfId(shelf?.id || availableShelves[0]?.id || '');
                setBinNumber(1);
            })
            .catch((loadError) => {
                if (active) {
                    showError(loadError.message || 'Unable to load products for assignment.');
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
    }, [availableShelves, isOpen, shelf?.id, showError]);

    const selectedProduct = useMemo(() => (
        products.find((product) => product.id === selectedProductId) ?? null
    ), [products, selectedProductId]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!selectedShelf || !selectedProduct) {
            return;
        }

        setIsSavingLocation(true);
        try {
            const savedLocation = await assignProductLocation({
                aisle: selectedShelf.aisle,
                binNumber,
                floor: selectedShelf.floor,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                shelfNumber: selectedShelf.shelfNumber,
                shelfObjectId: selectedShelf.id,
                sku: selectedProduct.sku,
            });

            upsertProductLocation(savedLocation);
            success(`${selectedProduct.name} assigned to Aisle ${savedLocation.aisle}, Shelf ${savedLocation.shelfNumber}, Bin ${savedLocation.binNumber}.`);
            onClose();
        } catch (saveError) {
            showError(saveError.message || 'Unable to save product location.');
        } finally {
            setIsSavingLocation(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Assign Product to Shelf">
            <form className="space-y-4" onSubmit={handleSubmit}>
                <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-primary-500">Product</span>
                    <select
                        aria-label="Product"
                        className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950"
                        disabled={isLoadingProducts}
                        onChange={(event) => setSelectedProductId(event.target.value)}
                        value={selectedProductId}
                    >
                        {products.map((product) => (
                            <option key={product.id} value={product.id}>
                                {[product.sku, product.name].filter(Boolean).join(' / ')}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-primary-500">Shelf object</span>
                    <select
                        aria-label="Shelf object"
                        className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950"
                        onChange={(event) => {
                            setSelectedShelfId(event.target.value);
                            setBinNumber(1);
                        }}
                        value={selectedShelfId}
                    >
                        {availableShelves.map((shelfObject) => (
                            <option key={shelfObject.id} value={shelfObject.id}>
                                {shelfObject.name} / Floor {shelfObject.floor || 1} / Aisle {normalizeAisle(shelfObject.aisle)} Shelf {shelfObject.shelfNumber}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-primary-500">Bin</span>
                    <select
                        aria-label="Bin Number"
                        className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950"
                        disabled={!selectedShelf}
                        onChange={(event) => setBinNumber(Number(event.target.value))}
                        value={binNumber}
                    >
                        {binOptions.map((bin) => (
                            <option key={bin} value={bin}>Bin {bin}</option>
                        ))}
                    </select>
                </label>
                <div className="flex justify-end gap-3">
                    <button className="min-h-11 rounded-xl border border-primary-200 bg-white px-4 text-sm font-black text-primary-700" onClick={onClose} type="button">
                        Cancel
                    </button>
                    <button
                        aria-label="Save Product Location"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-950 px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                        disabled={!selectedProduct || !selectedShelf || isSavingLocation}
                        type="submit"
                    >
                        <CheckCircle2 className="h-4 w-4" />
                        {isSavingLocation ? 'Saving...' : 'Save Product Location'}
                    </button>
                </div>
            </form>
        </Modal>
    );
}

function PropertiesPanel() {
    const centerCameraOnSelected = useLocator3DStore((state) => state.centerCameraOnSelected);
    const deleteSelectedObject = useLocator3DStore((state) => state.deleteSelectedObject);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const toggleObjectLock = useLocator3DStore((state) => state.toggleObjectLock);
    const updateObjectDimensions = useLocator3DStore((state) => state.updateObjectDimensions);
    const updateObjectTransform = useLocator3DStore((state) => state.updateObjectTransform);
    const [isAssigningProduct, setIsAssigningProduct] = useState(false);
    const selectedObject = getLocatorObjectById(selectedObjectId, sceneObjects);
    const selectedIsShelf = isShelfObject(selectedObject);
    const shelfAssignments = useMemo(() => (
        selectedIsShelf
            ? productLocations.filter((location) => location.shelfObjectId === selectedObject.id)
            : []
    ), [productLocations, selectedIsShelf, selectedObject]);

    if (!selectedObject) {
        return null;
    }

    const updateDimension = (key, value) => {
        updateObjectDimensions(selectedObject.id, { [key]: value });
    };
    const updatePosition = (index, value) => {
        const position = [...selectedObject.position];
        position[index] = Number(value);
        updateObjectTransform(selectedObject.id, { position, rotation: selectedObject.rotation });
    };
    const updateRotation = (index, value) => {
        const rotation = [...(selectedObject.rotation || [0, 0, 0])];
        rotation[index] = toRadians(value);
        updateObjectTransform(selectedObject.id, { position: selectedObject.position, rotation });
    };

    return (
        <aside
            aria-label="Properties"
            className="max-h-[76vh] min-w-0 overflow-auto rounded-2xl border border-white/10 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]"
            role="complementary"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-sky-200">Properties</p>
                    <h2 className="mt-1 text-xl font-black text-white">{selectedObject.name}</h2>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{selectedObject.type}</p>
                </div>
                <span className={cx('rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]', selectedObject.isLocked ? 'border-amber-300/30 bg-amber-400/12 text-amber-100' : 'border-emerald-300/30 bg-emerald-400/12 text-emerald-100')}>
                    {selectedObject.isLocked ? 'Locked' : 'Editable'}
                </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
                <NumberField label="Width" onChange={(value) => updateDimension('width', value)} value={selectedObject.dimensions.width} />
                <NumberField label="Height" onChange={(value) => updateDimension('height', value)} value={selectedObject.dimensions.height} />
                <NumberField label="Depth" onChange={(value) => updateDimension('depth', value)} value={selectedObject.dimensions.depth} />
            </div>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <h3 className="text-sm font-black text-white">Position</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <NumberField label="Position X" onChange={(value) => updatePosition(0, value)} value={formatNumber(selectedObject.position[0])} />
                    <NumberField label="Position Y" onChange={(value) => updatePosition(1, value)} value={formatNumber(selectedObject.position[1])} />
                    <NumberField label="Position Z" onChange={(value) => updatePosition(2, value)} value={formatNumber(selectedObject.position[2])} />
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
                <h3 className="text-sm font-black text-white">Rotation</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <NumberField label="Rotation X" onChange={(value) => updateRotation(0, value)} step="1" value={toDegrees(selectedObject.rotation?.[0])} />
                    <NumberField label="Rotation Y" onChange={(value) => updateRotation(1, value)} step="1" value={toDegrees(selectedObject.rotation?.[1])} />
                    <NumberField label="Rotation Z" onChange={(value) => updateRotation(2, value)} step="1" value={toDegrees(selectedObject.rotation?.[2])} />
                </div>
            </div>

            {selectedIsShelf && (
                <div className="mt-4">
                    <ShelfEditor object={selectedObject} />
                </div>
            )}

            {selectedIsShelf && (
                <section className="mt-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black text-white">Assigned Products</h3>
                        <button
                            aria-label="Assign Product to Shelf"
                            className="rounded-xl border border-emerald-300/30 bg-emerald-400/12 px-3 py-2 text-xs font-black text-emerald-100 transition hover:bg-emerald-400/18"
                            onClick={() => setIsAssigningProduct(true)}
                            type="button"
                        >
                            Assign
                        </button>
                    </div>
                    {shelfAssignments.length > 0 ? (
                        <div className="mt-3 space-y-2">
                            {shelfAssignments.map((location) => (
                                <div key={location.productId} className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-2 text-xs font-bold text-slate-300 shadow-sm">
                                    {location.sku || location.productName} / Bin {location.binNumber}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-xs font-semibold text-slate-400">No products assigned to this shelf yet.</p>
                    )}
                </section>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                    aria-label="Center Camera on Selected Object"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-xs font-black text-slate-200 shadow-sm transition hover:border-sky-300/40 hover:bg-white/[0.09]"
                    onClick={centerCameraOnSelected}
                    type="button"
                >
                    <Camera className="h-4 w-4" />
                    Center
                </button>
                <button
                    aria-label="Toggle selected object lock"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-300/30 bg-amber-400/12 px-3 text-xs font-black text-amber-100 transition hover:bg-amber-400/18"
                    onClick={() => toggleObjectLock(selectedObject.id)}
                    type="button"
                >
                    {selectedObject.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {selectedObject.isLocked ? 'Unlock' : 'Lock'}
                </button>
                <button
                    aria-label="Delete selected object"
                    className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-rose-300/30 bg-rose-400/12 px-3 text-xs font-black text-rose-100 transition hover:bg-rose-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={selectedObject.isLocked}
                    onClick={deleteSelectedObject}
                    type="button"
                >
                    <Trash2 className="h-4 w-4" />
                    Delete
                </button>
            </div>
            <ProductAssignmentModal
                isOpen={isAssigningProduct}
                onClose={() => setIsAssigningProduct(false)}
                shelf={selectedIsShelf ? selectedObject : null}
            />
        </aside>
    );
}

function SceneStats() {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const summary = getLocatorObjectSummary(sceneObjects);

    return (
        <div className="pointer-events-none absolute right-4 bottom-4 z-10 flex flex-wrap justify-end gap-2">
            <span className="rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-xs font-black text-slate-300 backdrop-blur">{summary.floors} floors</span>
            <span className="rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-xs font-black text-slate-300 backdrop-blur">{summary.objects} objects</span>
            <span className="rounded-full border border-white/10 bg-slate-950/75 px-3 py-1 text-xs font-black text-slate-300 backdrop-blur">{summary.shelves} shelves</span>
            {isDesignMode && <span className="rounded-full border border-sky-400/30 bg-sky-400/15 px-3 py-1 text-xs font-black text-sky-100 backdrop-blur">0.5 snap grid</span>}
            {locatedProduct && <span className="rounded-full border border-emerald-400/30 bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-100 backdrop-blur">Locate mode</span>}
        </div>
    );
}

function SceneControlButton({ children, className = '', ...props }) {
    return (
        <button
            className={cx(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/78 px-3 text-xs font-black text-slate-200 shadow-sm backdrop-blur-xl transition hover:border-sky-300/40 hover:bg-slate-900/90 disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            type="button"
            {...props}
        >
            {children}
        </button>
    );
}

function SceneToggleButton({ active, children, option }) {
    const toggleSceneOption = useLocator3DStore((state) => state.toggleSceneOption);

    return (
        <button
            aria-label={children}
            aria-pressed={active}
            className={cx(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition',
                active
                    ? 'border-emerald-300/35 bg-emerald-400/15 text-emerald-50'
                    : 'border-white/10 bg-slate-950/70 text-slate-400 hover:border-sky-300/35 hover:text-slate-100',
            )}
            onClick={() => toggleSceneOption(option)}
            type="button"
        >
            <span className={cx('h-2 w-2 rounded-full', active ? 'bg-emerald-300' : 'bg-slate-600')} />
            {children}
        </button>
    );
}

function SceneControlsDock({ canvasShellRef }) {
    const requestCameraPreset = useLocator3DStore((state) => state.requestCameraPreset);
    const resetCamera = useLocator3DStore((state) => state.resetCamera);
    const showGrid = useLocator3DStore((state) => state.showGrid);
    const showLabels = useLocator3DStore((state) => state.showLabels);
    const showPaths = useLocator3DStore((state) => state.showPaths);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const [isFullscreen, setIsFullscreen] = useState(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
        };
    }, []);

    const handleFullscreenToggle = () => {
        const target = canvasShellRef.current;

        if (!target || typeof document === 'undefined') {
            return;
        }

        if (document.fullscreenElement) {
            void document.exitFullscreen?.();
            return;
        }

        void target.requestFullscreen?.();
    };

    return (
        <section
            aria-label="Camera and scene controls"
            className="pointer-events-auto absolute inset-x-4 bottom-4 z-20 rounded-2xl border border-white/10 bg-slate-950/72 p-3 text-white shadow-[0_22px_70px_rgba(2,6,23,0.35)] backdrop-blur-xl lg:inset-x-auto lg:right-4 lg:max-w-[620px]"
            role="region"
        >
            <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/[0.05] px-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        <Camera className="h-4 w-4" />
                        Camera
                    </span>
                    <SceneControlButton aria-label="Overview camera" onClick={() => requestCameraPreset('overview')}>
                        <Monitor className="h-4 w-4" />
                        Overview
                    </SceneControlButton>
                    <SceneControlButton aria-label="Counter View camera" onClick={() => requestCameraPreset('counter')}>
                        <Navigation className="h-4 w-4" />
                        Counter View
                    </SceneControlButton>
                    <SceneControlButton aria-label="Top-down camera" onClick={() => requestCameraPreset('topDown')}>
                        <Grid3X3 className="h-4 w-4" />
                        Top-down
                    </SceneControlButton>
                    <SceneControlButton
                        aria-label="Focus on Selected camera"
                        disabled={!selectedObjectId && !locatedProduct}
                        onClick={() => requestCameraPreset('selected')}
                    >
                        <MapPin className="h-4 w-4" />
                        Focus on Selected
                    </SceneControlButton>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-white/[0.05] px-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">
                        <SlidersHorizontal className="h-4 w-4" />
                        View
                    </span>
                    <SceneToggleButton active={showLabels} option="showLabels">Show Labels</SceneToggleButton>
                    <SceneToggleButton active={showPaths} option="showPaths">Show Paths</SceneToggleButton>
                    <SceneToggleButton active={showGrid} option="showGrid">Show Grid</SceneToggleButton>
                    <SceneControlButton aria-label="Reset Camera" onClick={resetCamera}>
                        <RefreshCw className="h-4 w-4" />
                        Reset Camera
                    </SceneControlButton>
                    <SceneControlButton aria-label={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} onClick={handleFullscreenToggle}>
                        {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                        {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    </SceneControlButton>
                </div>
            </div>
        </section>
    );
}

function CanvasLoadingOverlay({ isLoading }) {
    if (!isLoading) {
        return null;
    }

    return (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-slate-950/68 backdrop-blur-sm">
            <div className="w-[min(420px,calc(100%-2rem))] rounded-2xl border border-white/10 bg-slate-950/90 p-5 text-white shadow-[0_22px_70px_rgba(2,6,23,0.35)]">
                <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-400/15 text-sky-200">
                        <Grid3X3 className="h-5 w-5 animate-pulse" />
                    </span>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Loading workspace</p>
                        <h2 className="mt-1 text-base font-black text-white">Loading stockroom workspace...</h2>
                    </div>
                </div>
                <div className="mt-5 grid gap-3">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-white/10" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-white/10" />
                    <div className="h-24 animate-pulse rounded-xl bg-white/[0.06]" />
                </div>
            </div>
        </div>
    );
}

function EditModeContextCard() {
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);

    return (
        <section className="rounded-2xl border border-sky-300/25 bg-slate-950 p-4 text-white shadow-[0_20px_70px_rgba(2,6,23,0.18)]">
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-sky-200">Edit Layout mode</p>
            <h2 className="mt-2 text-lg font-black text-white">
                {selectedObjectId ? 'Object controls active' : 'Select an object to edit'}
            </h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-400">
                Use the object library on the canvas, then adjust dimensions, shelf bins, locks, and assignments here.
            </p>
        </section>
    );
}

function LocatorContextPanel({ canEditLayout, onAnimatePath, onOpenEditLayout, productLocationState }) {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);

    return (
        <AnimatePresence initial={false}>
            <Motion.div
                animate={{ opacity: 1, x: 0 }}
                className="min-w-0 space-y-3"
                exit={{ opacity: 0, x: 16 }}
                initial={{ opacity: 0, x: 16 }}
                key={isDesignMode ? 'edit-context' : 'locate-context'}
                transition={{ duration: 0.2, ease: 'easeOut' }}
            >
                {isDesignMode ? (
                    <>
                        <EditModeContextCard />
                        <PropertiesPanel />
                    </>
                ) : (
                    <ProductLocationCard
                        canEditLayout={canEditLayout}
                        onAnimatePath={onAnimatePath}
                        onOpenEditLayout={onOpenEditLayout}
                        state={productLocationState}
                    />
                )}
            </Motion.div>
        </AnimatePresence>
    );
}

function useLocatorKeyboardShortcuts(onSaveLayout) {
    const clearSelection = useLocator3DStore((state) => state.clearSelection);
    const deleteSelectedObject = useLocator3DStore((state) => state.deleteSelectedObject);

    useEffect(() => {
        const handleKeyDown = (event) => {
            const targetTag = event.target?.tagName?.toLowerCase();
            const isEditingInput = targetTag === 'input' || targetTag === 'textarea' || targetTag === 'select';

            if (event.key === 'Escape') {
                clearSelection();
                return;
            }

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                onSaveLayout?.();
                return;
            }

            if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditingInput) {
                deleteSelectedObject();
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [clearSelection, deleteSelectedObject, onSaveLayout]);
}

export default function Locator3DAdmin() {
    const { success, error: showError, info, warning } = useToast();
    const authContext = useContext(AuthContext);
    const routeLocation = useLocation();
    const [searchParams] = useSearchParams();
    const routeStateProduct = routeLocation.state?.product ?? null;
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const animatePathFromCounter = useLocator3DStore((state) => state.animatePathFromCounter);
    const loadLayoutData = useLocator3DStore((state) => state.loadLayoutData);
    const locateProduct = useLocator3DStore((state) => state.locateProduct);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const resetToDefaultLayout = useLocator3DStore((state) => state.resetToDefaultLayout);
    const setDesignMode = useLocator3DStore((state) => state.setDesignMode);
    const setProductLocations = useLocator3DStore((state) => state.setProductLocations);
    const setSelectedProductForLocation = useLocator3DStore((state) => state.setSelectedProductForLocation);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [isLoadingLayout, setIsLoadingLayout] = useState(false);
    const [layoutName, setLayoutName] = useState(LOCATOR_LAYOUT_NAME);
    const [selectedLayoutName, setSelectedLayoutName] = useState(LOCATOR_LAYOUT_NAME);
    const [layoutOptions, setLayoutOptions] = useState([LOCATOR_LAYOUT_NAME]);
    const [products, setProducts] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const [productLocationState, setProductLocationState] = useState(PRODUCT_LOCATION_INITIAL_STATE);
    const canvasShellRef = useRef(null);
    const productId = searchParams.get('productId') || routeLocation.state?.productId || routeStateProduct?.id || '';
    const productName = searchParams.get('name') || routeStateProduct?.name || '';
    const productSku = searchParams.get('sku') || routeStateProduct?.sku || '';
    const canEditLayout = Boolean(authContext?.isAdmin);
    const isWorkspaceLoading = isLoadingLayout || productLocationState.status === 'loading';

    const loadLayoutOptions = useCallback(async () => {
        try {
            const layouts = await listStoreLayouts();
            const names = layouts.map((layout) => layout.layoutName).filter(Boolean);
            setLayoutOptions([...new Set([LOCATOR_LAYOUT_NAME, layoutName, ...names])]);
        } catch {
            setLayoutOptions((current) => [...new Set([LOCATOR_LAYOUT_NAME, layoutName, ...current])]);
        }
    }, [layoutName]);

    const handleSaveLayout = useCallback(async (name = layoutName) => {
        const safeName = String(name || LOCATOR_LAYOUT_NAME).trim() || LOCATOR_LAYOUT_NAME;
        setIsSavingLayout(true);
        try {
            await saveStoreLayout(sceneObjects, safeName);
            setLayoutName(safeName);
            setSelectedLayoutName(safeName);
            setLayoutOptions((current) => [...new Set([safeName, ...current])]);
            success('3D layout saved.');
        } catch (saveError) {
            showError(saveError.message || 'Unable to save 3D layout.');
        } finally {
            setIsSavingLayout(false);
        }
    }, [layoutName, sceneObjects, showError, success]);

    const handleLoadLayout = useCallback(async ({ silent = false, locateProductId = '', layout = selectedLayoutName } = {}) => {
        setIsLoadingLayout(true);
        const fallbackProduct = locateProductId
            ? resolveProductDetails({
                fallbackProduct: routeStateProduct,
                productId: locateProductId,
                productName,
                productSku,
            })
            : null;

        if (locateProductId) {
            setProductLocationState({
                location: null,
                message: '',
                product: fallbackProduct,
                status: 'loading',
            });
            setSelectedProductForLocation(fallbackProduct);
        }

        try {
            const [savedLayout, locations] = await Promise.all([
                loadStoreLayout(layout),
                getProductLocations(),
            ]);

            if (savedLayout?.layoutData) {
                loadLayoutData(savedLayout.layoutData);
                setLayoutName(savedLayout.layoutName || layout);
                setSelectedLayoutName(savedLayout.layoutName || layout);
            } else {
                resetToDefaultLayout();
                if (!silent) {
                    info('No saved layout found. Default layout loaded.');
                }
            }

            setProductLocations(locations);

            if (locateProductId) {
                const [location, catalogProducts] = await Promise.all([
                    getProductLocation(locateProductId),
                    getFullProductCatalog(),
                ]);
                const safeCatalogProducts = Array.isArray(catalogProducts) ? catalogProducts : [];
                const product = resolveProductDetails({
                    catalogProducts: safeCatalogProducts,
                    fallbackProduct,
                    location,
                    productId: locateProductId,
                    productName,
                    productSku,
                });

                setProducts(safeCatalogProducts);
                setSelectedProductForLocation(product);

                if (!location) {
                    locateProduct(null);
                    setProductLocationState({
                        location: null,
                        message: 'Assign this item to a shelf and bin before using 3D locate mode.',
                        product,
                        status: 'empty',
                    });
                    warning('This product does not have a saved 3D bin location yet.');
                    return;
                }

                const activeSceneObjects = useLocator3DStore.getState().sceneObjects;
                const targetShelf = getShelfObjectByLocation(location, activeSceneObjects);

                if (!targetShelf) {
                    locateProduct(null);
                    setProductLocationState({
                        location,
                        message: 'A saved location exists, but its shelf is not in the current layout.',
                        product,
                        status: 'empty',
                    });
                    warning('This product location is not mapped to the current 3D layout.');
                    return;
                }

                const mappedLocation = {
                    ...location,
                    floor: Number(location.floor || targetShelf.floor || 1),
                    productName: product.name || location.productName,
                    shelfObjectId: targetShelf.id || location.shelfObjectId,
                    sku: product.sku || location.sku,
                };

                locateProduct(mappedLocation);
                setProductLocationState({
                    location: mappedLocation,
                    message: '',
                    product,
                    status: 'located',
                });
                success('Product located in the 3D store.');
            } else if (!silent) {
                success('3D layout loaded.');
            }
        } catch (loadError) {
            if (locateProductId) {
                setProductLocationState({
                    location: null,
                    message: loadError.message || 'Unable to load product location.',
                    product: fallbackProduct,
                    status: 'error',
                });
            }
            showError(loadError.message || 'Unable to load 3D layout.');
        } finally {
            setIsLoadingLayout(false);
        }
    }, [info, loadLayoutData, locateProduct, productName, productSku, resetToDefaultLayout, routeStateProduct, selectedLayoutName, setProductLocations, setSelectedProductForLocation, showError, success, warning]);

    const handleResetLayout = useCallback(() => {
        resetToDefaultLayout();
        setProductLocationState(PRODUCT_LOCATION_INITIAL_STATE);
        setSelectedProductForLocation(null);
        success('Default two-floor 3D layout restored.');
    }, [resetToDefaultLayout, setSelectedProductForLocation, success]);

    const handleLocateProductFromSearch = useCallback((product) => {
        const location = productLocations.find((item) => item.productId === product.id);
        const productDetails = resolveProductDetails({
            catalogProducts: products,
            fallbackProduct: product,
            location,
            productId: product.id,
            productName: product.name,
            productSku: product.sku,
        });

        setSelectedProductForLocation(productDetails);

        if (!location) {
            locateProduct(null);
            setProductLocationState({
                location: null,
                message: 'Assign this item to a shelf and bin before using 3D locate mode.',
                product: productDetails,
                status: 'empty',
            });
            warning('This product does not have a saved 3D bin location yet.');
            return;
        }

        const targetShelf = getShelfObjectByLocation(location, useLocator3DStore.getState().sceneObjects);

        if (!targetShelf) {
            locateProduct(null);
            setProductLocationState({
                location,
                message: 'A saved location exists, but its shelf is not in the current layout.',
                product: productDetails,
                status: 'empty',
            });
            warning('This product location is not mapped to the current 3D layout.');
            return;
        }

        const mappedLocation = {
            ...location,
            floor: Number(location.floor || targetShelf.floor || 1),
            productName: productDetails.name || location.productName,
            shelfObjectId: targetShelf.id || location.shelfObjectId,
            sku: productDetails.sku || location.sku,
        };

        locateProduct(mappedLocation);
        setProductLocationState({
            location: mappedLocation,
            message: '',
            product: productDetails,
            status: 'located',
        });
        success('Product located in the 3D store.');
    }, [locateProduct, productLocations, products, setSelectedProductForLocation, success, warning]);

    const handleAnimatePathFromCounter = useCallback(() => {
        animatePathFromCounter();
        info('Path animation restarted from the counter.');
    }, [animatePathFromCounter, info]);

    const handleOpenEditLayout = useCallback(() => {
        setDesignMode(true);
        info('Design mode enabled. Select a shelf to assign this product.');
    }, [info, setDesignMode]);

    useEffect(() => {
        void loadLayoutOptions();
    }, [loadLayoutOptions]);

    useEffect(() => {
        let active = true;
        setIsLoadingProducts(true);

        void Promise.all([
            getFullProductCatalog(),
            getProductLocations(),
        ])
            .then(([catalogProducts, locations]) => {
                if (!active) {
                    return;
                }

                setProducts(catalogProducts || []);
                setProductLocations(locations || []);
            })
            .catch((loadError) => {
                if (active) {
                    showError(loadError.message || 'Unable to load locator search data.');
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

        void handleLoadLayout({ silent: true, locateProductId: productId });
    }, [handleLoadLayout, productId]);

    useLocatorKeyboardShortcuts(() => handleSaveLayout(layoutName));

    return (
        <div className="space-y-5 rounded-[24px] bg-slate-900 p-3 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:p-4">
            <TopBar
                isSidebarOpen={isSidebarOpen}
                isLoadingLayout={isLoadingLayout}
                isSavingLayout={isSavingLayout}
                layoutName={layoutName}
                layoutOptions={layoutOptions}
                onConfirmSaveLayout={() => void handleSaveLayout(layoutName)}
                onLoadLayout={() => void handleLoadLayout()}
                onResetLayout={handleResetLayout}
                onSaveNameChange={setLayoutName}
                onSelectLayout={setSelectedLayoutName}
                onToggleSidebar={() => setIsSidebarOpen((value) => !value)}
                selectedLayoutName={selectedLayoutName}
            />

            <div
                className={cx(
                    'grid items-start gap-4',
                    isSidebarOpen
                        ? 'xl:grid-cols-[320px_minmax(0,1fr)_340px]'
                        : 'xl:grid-cols-[minmax(0,1fr)_340px]',
                )}
            >
                <ProductLocatorSidebar
                    isLoadingLayout={isLoadingLayout}
                    isLoadingProducts={isLoadingProducts}
                    isOpen={isSidebarOpen}
                    onCollapse={() => setIsSidebarOpen(false)}
                    onLocateProduct={handleLocateProductFromSearch}
                    productLocations={productLocations}
                    products={products}
                    sceneObjects={sceneObjects}
                />

                <main
                    aria-label="3D stockroom canvas"
                    className="relative h-[72vh] max-h-[780px] min-h-[540px] overflow-hidden rounded-2xl border border-white/10 bg-slate-950 shadow-[0_20px_70px_rgba(2,6,23,0.25)]"
                    ref={canvasShellRef}
                >
                    <Locator3DScene />
                    <ObjectLibraryDropdown />
                    <SceneControlsDock canvasShellRef={canvasShellRef} />
                    <CanvasLoadingOverlay isLoading={isWorkspaceLoading} />
                    <SceneStats />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-950/50 to-transparent" />
                </main>

                <LocatorContextPanel
                    canEditLayout={canEditLayout}
                    onAnimatePath={handleAnimatePathFromCounter}
                    onOpenEditLayout={handleOpenEditLayout}
                    productLocationState={productLocationState}
                />
            </div>
        </div>
    );
}
