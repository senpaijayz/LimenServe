import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    Boxes,
    BrickWall,
    Camera,
    CheckCircle2,
    ChevronDown,
    DoorOpen,
    HelpCircle,
    LayoutDashboard,
    Lock,
    Monitor,
    Package,
    PanelLeftClose,
    PanelLeftOpen,
    RefreshCw,
    Save,
    Search,
    Store,
    Trash2,
    Unlock,
    Waypoints,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { getFullProductCatalog } from '../../../services/catalogApi';
import Locator3DScene from '../components/Locator3DScene';
import {
    LOCATOR_LAYOUT_NAME,
    SHELF_BIN_RANGE,
    getLocatorObjectById,
    getLocatorObjectSummary,
    isShelfObject,
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
                    ? 'border-accent-primary bg-accent-primary text-white shadow-sm'
                    : 'border-primary-200 bg-white text-primary-700 hover:border-primary-300 hover:bg-primary-50',
            )}
            onClick={() => setDesignMode(!isDesignMode)}
            role="switch"
            type="button"
        >
            <span>
                <span className="block text-sm font-black">Design Mode</span>
                <span className="block text-[11px] font-bold uppercase tracking-[0.18em] opacity-70">
                    {isDesignMode ? 'Editing enabled' : 'View only'}
                </span>
            </span>
            <span className={cx('flex h-6 w-11 items-center rounded-full p-1 transition', isDesignMode ? 'bg-white/25' : 'bg-primary-200')}>
                <span className={cx('h-4 w-4 rounded-full bg-white shadow transition', isDesignMode ? 'translate-x-5' : 'translate-x-0')} />
            </span>
        </button>
    );
}

function TopButton({ children, className = '', ...props }) {
    return (
        <button
            className={cx(
                'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-3 text-xs font-black text-primary-700 shadow-sm transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-60',
                className,
            )}
            type="button"
            {...props}
        >
            {children}
        </button>
    );
}

function TopBar({
    isLoadingLayout,
    isSavingLayout,
    layoutName,
    layoutOptions,
    onConfirmSaveLayout,
    onLoadLayout,
    onResetLayout,
    onSaveNameChange,
    onSelectLayout,
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
        <header className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-[220px] items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-950 text-white shadow-sm">
                        <LayoutDashboard className="h-5 w-5" />
                    </span>
                    <div>
                        <p className="text-[11px] font-black uppercase tracking-[0.28em] text-primary-400">Admin</p>
                        <h1 className="text-xl font-black text-primary-950">3D Locator</h1>
                    </div>
                </div>

                <div className="flex justify-start xl:justify-center">
                    <DesignModeSwitch />
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <div className="relative flex items-center gap-2">
                        {isSaveOpen && (
                            <input
                                aria-label="Layout name"
                                className="h-10 w-44 rounded-xl border border-primary-200 bg-primary-50 px-3 text-xs font-bold text-primary-950 outline-none transition placeholder:text-primary-400 focus:border-accent-primary focus:bg-white"
                                onChange={(event) => onSaveNameChange(event.target.value)}
                                placeholder="Layout name"
                                value={layoutName}
                            />
                        )}
                        <TopButton
                            aria-label={isSaveOpen ? 'Confirm Save Layout' : 'Save Layout'}
                            className="border-accent-primary bg-accent-primary text-white hover:bg-accent-secondary"
                            disabled={busy}
                            onClick={handleSaveClick}
                        >
                            <Save className="h-4 w-4" />
                            {isSavingLayout ? 'Saving' : isSaveOpen ? 'Save' : 'Save Layout'}
                        </TopButton>
                    </div>

                    <select
                        aria-label="Saved layouts"
                        className="h-10 max-w-[180px] rounded-xl border border-primary-200 bg-white px-3 text-xs font-black text-primary-700 outline-none transition focus:border-accent-primary"
                        onChange={(event) => onSelectLayout(event.target.value)}
                        value={selectedLayoutName}
                    >
                        {layoutOptions.map((layout) => (
                            <option key={layout} value={layout}>{layout}</option>
                        ))}
                    </select>
                    <TopButton aria-label="Load Layout" disabled={busy} onClick={onLoadLayout}>
                        <RefreshCw className={cx('h-4 w-4', isLoadingLayout && 'animate-spin')} />
                        Load Layout
                    </TopButton>
                    <TopButton aria-label="Reset to Default" onClick={onResetLayout}>
                        <Store className="h-4 w-4" />
                        Reset
                    </TopButton>

                    <span className="mx-1 hidden h-7 w-px bg-primary-200 md:block" />
                    {[1, 2].map((floor) => (
                        <TopButton
                            aria-label={`Go to Floor ${floor}`}
                            className={activeFloor === floor ? 'border-primary-950 bg-primary-950 text-white' : ''}
                            key={floor}
                            onClick={() => goToFloor(floor)}
                        >
                            Floor {floor}
                        </TopButton>
                    ))}

                    {isDesignMode && selectedObject && (
                        <TopButton
                            aria-label={selectedObject.isLocked ? 'Unlock selected object' : 'Lock selected object'}
                            className={selectedObject.isLocked ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}
                            onClick={() => toggleObjectLock(selectedObject.id)}
                        >
                            {selectedObject.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {selectedObject.isLocked ? 'Unlock' : 'Lock'}
                        </TopButton>
                    )}
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

function ProductSearch({ isLoadingProducts, onLocateProduct, productLocations, products }) {
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLowerCase();
    const matches = useMemo(() => {
        if (!normalizedQuery) {
            return [];
        }

        return products
            .filter((product) => {
                const haystack = [product.name, product.sku, product.model, product.category].filter(Boolean).join(' ').toLowerCase();
                return haystack.includes(normalizedQuery);
            })
            .slice(0, 6);
    }, [normalizedQuery, products]);

    return (
        <div>
            <label className="block">
                <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.22em] text-primary-500">Product Search</span>
                <span className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                    <input
                        aria-label="Product Search"
                        className="h-12 w-full rounded-xl border border-primary-200 bg-primary-50 pl-10 pr-3 text-sm font-bold text-primary-950 outline-none transition placeholder:text-primary-400 focus:border-accent-primary focus:bg-white"
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search by name or part number"
                        value={query}
                    />
                </span>
            </label>
            {normalizedQuery && (
                <div className="mt-3 max-h-64 space-y-2 overflow-auto pr-1">
                    {isLoadingProducts ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-xs font-bold text-primary-500">Loading products...</div>
                    ) : matches.length > 0 ? (
                        matches.map((product) => {
                            const location = productLocations.find((item) => item.productId === product.id);

                            return (
                                <button
                                    aria-label={`Locate ${product.name}`}
                                    className="w-full rounded-xl border border-primary-200 bg-white p-3 text-left shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50"
                                    key={product.id}
                                    onClick={() => onLocateProduct(product)}
                                    type="button"
                                >
                                    <span className="block truncate text-sm font-black text-primary-950">{product.name}</span>
                                    <span className="mt-1 block truncate text-xs font-bold text-primary-500">
                                        {product.sku || 'No part number'}{location ? ` / Aisle ${location.aisle} / Bin ${location.binNumber}` : ' / No 3D bin yet'}
                                    </span>
                                </button>
                            );
                        })
                    ) : (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-xs font-bold text-primary-500">No matching products.</div>
                    )}
                </div>
            )}
        </div>
    );
}

function QuickHelpPanel({ isLoadingProducts, onLocateProduct, productLocations, products }) {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const [isOpen, setIsOpen] = useState(true);

    return (
        <aside className="min-w-0 transition-all">
            <div className="rounded-2xl border border-primary-200 bg-white shadow-sm">
                <button
                    aria-label={isOpen ? 'Collapse Quick Help' : 'Expand Quick Help'}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-black text-primary-950"
                    onClick={() => setIsOpen((value) => !value)}
                    type="button"
                >
                    <span className="flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-accent-primary" />
                        {isDesignMode ? 'Design mode tips' : 'How to locate products'}
                    </span>
                    {isOpen ? <PanelLeftClose className="h-4 w-4 text-primary-400" /> : <PanelLeftOpen className="h-4 w-4 text-primary-400" />}
                </button>
                {isOpen && (
                    <div className="border-t border-primary-100 p-4">
                        {isDesignMode ? (
                            <div className="space-y-3 text-xs font-semibold leading-5 text-primary-500">
                                <p>Use the object library to add floor pieces, walls, shelves, stairs, counters, and doors.</p>
                                <p>Select an unlocked object to move or rotate it with snapping enabled.</p>
                                <p>Edit size, position, rotation, shelf bins, and product assignments from the properties panel.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <ProductSearch
                                    isLoadingProducts={isLoadingProducts}
                                    onLocateProduct={onLocateProduct}
                                    productLocations={productLocations}
                                    products={products}
                                />
                                <p className="text-xs font-semibold leading-5 text-primary-500">
                                    Search by product name or part number, choose a result, and the viewer will highlight the shelf, bin, and route from the counter.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </aside>
    );
}

function NumberField({ label, onChange, step = '0.1', value }) {
    return (
        <label className="block">
            <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-primary-500">{label}</span>
            <input
                aria-label={label}
                className="h-10 w-full rounded-xl border border-primary-200 bg-primary-50 px-3 text-sm font-bold text-primary-950 outline-none transition focus:border-accent-primary focus:bg-white"
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
        <section className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
            <h3 className="text-sm font-black text-primary-950">Shelf Details</h3>
            <div className="mt-4 space-y-3">
                <label className="block">
                    <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.18em] text-primary-500">Aisle name</span>
                    <input
                        aria-label="Aisle name"
                        className="h-10 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950 outline-none transition focus:border-accent-primary"
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
                        <label className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-500" htmlFor="locator-bin-count">Number of Bins</label>
                        <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-accent-primary shadow-sm">{object.binCount}</span>
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
    const upsertProductLocation = useLocator3DStore((state) => state.upsertProductLocation);
    const [products, setProducts] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const [isSavingLocation, setIsSavingLocation] = useState(false);
    const [selectedProductId, setSelectedProductId] = useState('');
    const [binNumber, setBinNumber] = useState(1);

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
    }, [isOpen, showError]);

    const selectedProduct = useMemo(() => (
        products.find((product) => product.id === selectedProductId) ?? null
    ), [products, selectedProductId]);

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (!shelf || !selectedProduct) {
            return;
        }

        setIsSavingLocation(true);
        try {
            const savedLocation = await assignProductLocation({
                aisle: shelf.aisle,
                binNumber,
                floor: shelf.floor,
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                shelfNumber: shelf.shelfNumber,
                shelfObjectId: shelf.id,
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
                    <span className="mb-2 block text-xs font-black uppercase tracking-[0.18em] text-primary-500">Bin Number</span>
                    <input
                        aria-label="Bin Number"
                        className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950"
                        max={shelf?.binCount || SHELF_BIN_RANGE.MAX}
                        min="1"
                        onChange={(event) => setBinNumber(Number(event.target.value))}
                        type="number"
                        value={binNumber}
                    />
                </label>
                <div className="flex justify-end gap-3">
                    <button className="min-h-11 rounded-xl border border-primary-200 bg-white px-4 text-sm font-black text-primary-700" onClick={onClose} type="button">
                        Cancel
                    </button>
                    <button
                        aria-label="Save Product Location"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-950 px-4 text-sm font-black text-white disabled:cursor-wait disabled:opacity-60"
                        disabled={!selectedProduct || isSavingLocation}
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
            className="max-h-[70vh] min-w-0 overflow-auto rounded-2xl border border-primary-200 bg-white p-4 shadow-sm"
            role="complementary"
        >
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-accent-primary">Properties</p>
                    <h2 className="mt-1 text-xl font-black text-primary-950">{selectedObject.name}</h2>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-primary-400">{selectedObject.type}</p>
                </div>
                <span className={cx('rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.18em]', selectedObject.isLocked ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700')}>
                    {selectedObject.isLocked ? 'Locked' : 'Editable'}
                </span>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
                <NumberField label="Width" onChange={(value) => updateDimension('width', value)} value={selectedObject.dimensions.width} />
                <NumberField label="Height" onChange={(value) => updateDimension('height', value)} value={selectedObject.dimensions.height} />
                <NumberField label="Depth" onChange={(value) => updateDimension('depth', value)} value={selectedObject.dimensions.depth} />
            </div>

            <div className="mt-5 rounded-2xl border border-primary-200 bg-primary-50 p-3">
                <h3 className="text-sm font-black text-primary-950">Position</h3>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    <NumberField label="Position X" onChange={(value) => updatePosition(0, value)} value={formatNumber(selectedObject.position[0])} />
                    <NumberField label="Position Y" onChange={(value) => updatePosition(1, value)} value={formatNumber(selectedObject.position[1])} />
                    <NumberField label="Position Z" onChange={(value) => updatePosition(2, value)} value={formatNumber(selectedObject.position[2])} />
                </div>
            </div>

            <div className="mt-4 rounded-2xl border border-primary-200 bg-primary-50 p-3">
                <h3 className="text-sm font-black text-primary-950">Rotation</h3>
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
                <section className="mt-4 rounded-2xl border border-primary-200 bg-primary-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-sm font-black text-primary-950">Assigned Products</h3>
                        <button
                            aria-label="Assign Product to Shelf"
                            className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100"
                            onClick={() => setIsAssigningProduct(true)}
                            type="button"
                        >
                            Assign
                        </button>
                    </div>
                    {shelfAssignments.length > 0 ? (
                        <div className="mt-3 space-y-2">
                            {shelfAssignments.map((location) => (
                                <div key={location.productId} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-primary-600 shadow-sm">
                                    {location.sku || location.productName} / Bin {location.binNumber}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="mt-3 text-xs font-semibold text-primary-500">No products assigned to this shelf yet.</p>
                    )}
                </section>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
                <button
                    aria-label="Center Camera on Selected Object"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-primary-200 bg-white px-3 text-xs font-black text-primary-700 shadow-sm transition hover:border-accent-primary hover:text-accent-primary"
                    onClick={centerCameraOnSelected}
                    type="button"
                >
                    <Camera className="h-4 w-4" />
                    Center
                </button>
                <button
                    aria-label="Toggle selected object lock"
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-700 transition hover:bg-amber-100"
                    onClick={() => toggleObjectLock(selectedObject.id)}
                    type="button"
                >
                    {selectedObject.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                    {selectedObject.isLocked ? 'Unlock' : 'Lock'}
                </button>
                <button
                    aria-label="Delete selected object"
                    className="col-span-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
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

function LocatedProductBanner() {
    const clearLocatedProduct = useLocator3DStore((state) => state.clearLocatedProduct);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);

    if (!locatedProduct) {
        return null;
    }

    return (
        <div className="pointer-events-auto absolute left-1/2 top-4 z-20 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-emerald-400/30 bg-slate-950/90 p-4 shadow-[0_24px_70px_rgba(2,6,23,0.44)] backdrop-blur-xl">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-300">Locate in 3D</p>
                    <h2 className="mt-1 text-lg font-black text-white">{locatedProduct.locationLabel}</h2>
                    {(locatedProduct.productName || locatedProduct.sku) && (
                        <p className="mt-1 text-sm font-semibold text-slate-400">
                            {[locatedProduct.sku, locatedProduct.productName].filter(Boolean).join(' / ')}
                        </p>
                    )}
                </div>
                <button
                    className="min-h-10 rounded-xl border border-white/10 bg-white/[0.06] px-4 text-xs font-black text-slate-200 transition hover:bg-white/[0.1]"
                    onClick={clearLocatedProduct}
                    type="button"
                >
                    Clear
                </button>
            </div>
        </div>
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
    const [searchParams] = useSearchParams();
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const loadLayoutData = useLocator3DStore((state) => state.loadLayoutData);
    const locateProduct = useLocator3DStore((state) => state.locateProduct);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const resetToDefaultLayout = useLocator3DStore((state) => state.resetToDefaultLayout);
    const setProductLocations = useLocator3DStore((state) => state.setProductLocations);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [isLoadingLayout, setIsLoadingLayout] = useState(false);
    const [layoutName, setLayoutName] = useState(LOCATOR_LAYOUT_NAME);
    const [selectedLayoutName, setSelectedLayoutName] = useState(LOCATOR_LAYOUT_NAME);
    const [layoutOptions, setLayoutOptions] = useState([LOCATOR_LAYOUT_NAME]);
    const [products, setProducts] = useState([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(false);
    const productId = searchParams.get('productId');
    const productName = searchParams.get('name');
    const productSku = searchParams.get('sku');
    const hasSelectedObject = Boolean(getLocatorObjectById(selectedObjectId, sceneObjects));

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
                const location = await getProductLocation(locateProductId);

                if (location) {
                    locateProduct({
                        ...location,
                        productName: productName || location.productName,
                        sku: productSku || location.sku,
                    });
                    success('Product located in the 3D store.');
                } else {
                    warning('This product does not have a saved 3D bin location yet.');
                }
            } else if (!silent) {
                success('3D layout loaded.');
            }
        } catch (loadError) {
            showError(loadError.message || 'Unable to load 3D layout.');
        } finally {
            setIsLoadingLayout(false);
        }
    }, [info, loadLayoutData, locateProduct, productName, productSku, resetToDefaultLayout, selectedLayoutName, setProductLocations, showError, success, warning]);

    const handleResetLayout = useCallback(() => {
        resetToDefaultLayout();
        success('Default two-floor 3D layout restored.');
    }, [resetToDefaultLayout, success]);

    const handleLocateProductFromSearch = useCallback((product) => {
        const location = productLocations.find((item) => item.productId === product.id);

        if (!location) {
            warning('This product does not have a saved 3D bin location yet.');
            return;
        }

        locateProduct({
            ...location,
            productName: product.name || location.productName,
            sku: product.sku || location.sku,
        });
        success('Product located in the 3D store.');
    }, [locateProduct, productLocations, success, warning]);

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
        <div className="space-y-5 text-primary-950">
            <TopBar
                isLoadingLayout={isLoadingLayout}
                isSavingLayout={isSavingLayout}
                layoutName={layoutName}
                layoutOptions={layoutOptions}
                onConfirmSaveLayout={() => void handleSaveLayout(layoutName)}
                onLoadLayout={() => void handleLoadLayout()}
                onResetLayout={handleResetLayout}
                onSaveNameChange={setLayoutName}
                onSelectLayout={setSelectedLayoutName}
                selectedLayoutName={selectedLayoutName}
            />

            <div
                className={cx(
                    'grid items-start gap-4',
                    hasSelectedObject
                        ? 'xl:grid-cols-[220px_minmax(0,1fr)_300px] 2xl:grid-cols-[240px_minmax(0,1fr)_320px]'
                        : 'xl:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)]',
                )}
            >
                <QuickHelpPanel
                    isLoadingProducts={isLoadingProducts}
                    onLocateProduct={handleLocateProductFromSearch}
                    productLocations={productLocations}
                    products={products}
                />

                <main className="relative h-[68vh] max-h-[760px] min-h-[520px] overflow-hidden rounded-2xl border border-primary-200 bg-[radial-gradient(circle_at_top_left,rgba(49,130,206,0.16),transparent_34%),linear-gradient(180deg,#020617,#0f172a)] shadow-sm">
                    <Locator3DScene />
                    <ObjectLibraryDropdown />
                    <LocatedProductBanner />
                    <SceneStats />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-slate-950/50 to-transparent" />
                </main>

                <PropertiesPanel />
            </div>
        </div>
    );
}
