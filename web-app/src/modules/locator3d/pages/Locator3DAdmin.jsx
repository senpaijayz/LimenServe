import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Box,
    Boxes,
    BrickWall,
    Camera,
    CheckCircle2,
    DoorOpen,
    HelpCircle,
    Lock,
    Monitor,
    MousePointer2,
    Move3D,
    Package,
    RefreshCw,
    RotateCw,
    Ruler,
    Save,
    Settings2,
    Store,
    Trash2,
    Unlock,
    Waypoints,
} from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { useToast } from '../../../components/ui/Toast';
import { getFullProductCatalog } from '../../../services/catalogApi';
import Locator3DScene from '../components/Locator3DScene';
import { SHELF_BIN_RANGE, getLocatorObjectById, getLocatorObjectSummary, isShelfObject } from '../data/locatorScene';
import {
    assignProductLocation,
    getProductLocation,
    getProductLocations,
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

const tools = [
    { id: 'select', label: 'Select', icon: MousePointer2 },
    { id: 'move', label: 'Move', icon: Move3D },
    { id: 'rotate', label: 'Rotate', icon: RotateCw },
    { id: 'measure', label: 'Measure', icon: Ruler },
];

function Panel({ children, icon: Icon, title }) {
    return (
        <section className="rounded-2xl border border-primary-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
            <div className="flex h-14 items-center gap-3 border-b border-primary-200 px-4 dark:border-slate-700">
                {Icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-950 text-white dark:bg-sky-500">
                        <Icon className="h-4 w-4" />
                    </span>
                )}
                <h2 className="text-sm font-black text-primary-950 dark:text-white">{title}</h2>
            </div>
            <div className="p-4">{children}</div>
        </section>
    );
}

function DesignModeSwitch() {
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const setDesignMode = useLocator3DStore((state) => state.setDesignMode);

    return (
        <button
            aria-checked={isDesignMode}
            aria-label="Design Mode"
            className={`flex min-h-14 min-w-[220px] items-center justify-between gap-4 rounded-2xl border px-4 text-left shadow-sm transition ${
                isDesignMode
                    ? 'border-sky-300 bg-sky-500 text-white shadow-[0_16px_32px_rgba(14,165,233,0.24)]'
                    : 'border-primary-200 bg-primary-50 text-primary-700 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
            }`}
            onClick={() => setDesignMode(!isDesignMode)}
            role="switch"
            type="button"
        >
            <span>
                <span className="block text-sm font-black">Design Mode</span>
                <span className="block text-xs font-bold opacity-80">{isDesignMode ? 'ON / 0.5 snap grid' : 'OFF / view only'}</span>
            </span>
            <span className={`flex h-7 w-12 items-center rounded-full p-1 transition ${isDesignMode ? 'bg-white/25' : 'bg-primary-200 dark:bg-slate-700'}`}>
                <span className={`h-5 w-5 rounded-full bg-white shadow transition ${isDesignMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </span>
        </button>
    );
}

function TopBarActions({ isLoadingLayout, isSavingLayout, onLoadLayout, onResetLayout, onSaveLayout }) {
    const activeFloor = useLocator3DStore((state) => state.activeFloor);
    const goToFloor = useLocator3DStore((state) => state.goToFloor);
    const lockAllObjects = useLocator3DStore((state) => state.lockAllObjects);
    const unlockAllObjects = useLocator3DStore((state) => state.unlockAllObjects);
    const busy = isLoadingLayout || isSavingLayout;

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                aria-label="Save Layout"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 transition hover:bg-sky-100 disabled:cursor-wait disabled:opacity-60"
                disabled={busy}
                onClick={onSaveLayout}
                type="button"
            >
                <Save className="h-4 w-4" />
                {isSavingLayout ? 'Saving...' : 'Save Layout'}
            </button>
            <button
                aria-label="Load Layout"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 text-xs font-black text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                disabled={busy}
                onClick={onLoadLayout}
                type="button"
            >
                <RefreshCw className={`h-4 w-4 ${isLoadingLayout ? 'animate-spin' : ''}`} />
                {isLoadingLayout ? 'Loading...' : 'Load Layout'}
            </button>
            <button
                aria-label="Reset to Default"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary-200 bg-white px-3 text-xs font-black text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"
                onClick={onResetLayout}
                type="button"
            >
                <Store className="h-4 w-4" />
                Reset to Default
            </button>
            <span className="mx-1 hidden h-8 w-px bg-primary-200 sm:block" />
            <button
                aria-label="Go to Floor 1"
                className={`rounded-xl border px-4 py-3 text-xs font-black transition ${
                    activeFloor === 1
                        ? 'border-primary-950 bg-primary-950 text-white'
                        : 'border-primary-200 bg-white text-primary-700 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                }`}
                onClick={() => goToFloor(1)}
                type="button"
            >
                Go to Floor 1
            </button>
            <button
                aria-label="Go to Floor 2"
                className={`rounded-xl border px-4 py-3 text-xs font-black transition ${
                    activeFloor === 2
                        ? 'border-primary-950 bg-primary-950 text-white'
                        : 'border-primary-200 bg-white text-primary-700 hover:border-primary-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                }`}
                onClick={() => goToFloor(2)}
                type="button"
            >
                Go to Floor 2
            </button>
            <span className="mx-1 hidden h-8 w-px bg-primary-200 sm:block" />
            <button
                aria-label="Lock All Objects"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-black text-amber-800 transition hover:bg-amber-100"
                onClick={lockAllObjects}
                type="button"
            >
                <Lock className="h-4 w-4" />
                Lock All Objects
            </button>
            <button
                aria-label="Unlock All Objects"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
                onClick={unlockAllObjects}
                type="button"
            >
                <Unlock className="h-4 w-4" />
                Unlock All Objects
            </button>
        </div>
    );
}

function ToolsPanel() {
    const activeTool = useLocator3DStore((state) => state.activeTool);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const setActiveTool = useLocator3DStore((state) => state.setActiveTool);

    return (
        <Panel icon={Settings2} title="Tools">
            <div className="grid grid-cols-2 gap-2">
                {tools.map((tool) => {
                    const Icon = tool.icon;
                    const active = activeTool === tool.id;
                    const transformTool = tool.id === 'move' || tool.id === 'rotate';

                    return (
                        <button
                            aria-label={tool.label}
                            className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                                active
                                    ? 'border-primary-950 bg-primary-950 text-white shadow-[0_12px_26px_rgba(15,23,42,0.18)]'
                                    : 'border-primary-200 bg-white text-primary-600 hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300'
                            } ${transformTool && !isDesignMode ? 'opacity-60' : ''}`}
                            key={tool.id}
                            onClick={() => setActiveTool(tool.id)}
                            title={tool.label}
                            type="button"
                        >
                            <Icon className="h-4 w-4" />
                            <span>{tool.label}</span>
                        </button>
                    );
                })}
            </div>
            <div className={`mt-3 rounded-xl border p-3 text-xs font-bold ${
                isDesignMode
                    ? 'border-sky-200 bg-sky-50 text-sky-800'
                    : 'border-primary-200 bg-primary-50 text-primary-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400'
            }`}
            >
                {isDesignMode ? 'Editing enabled: move and rotate selected unlocked objects.' : 'View mode: objects are protected from transforms.'}
            </div>
        </Panel>
    );
}

function ObjectLibraryPanel() {
    const objectLibrary = useLocator3DStore((state) => state.objectLibrary);

    return (
        <Panel icon={Box} title="Object Library">
            <div className="space-y-2">
                {objectLibrary.map((object) => {
                    const Icon = libraryIconMap[object.icon] ?? Box;

                    return (
                        <button
                            className="group flex w-full items-center gap-3 rounded-xl border border-primary-200 bg-white p-3 text-left transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800"
                            key={object.type}
                            type="button"
                        >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm" style={{ backgroundColor: object.color }}>
                                <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0">
                                <span className="block truncate text-sm font-black text-primary-950 dark:text-white">{object.label}</span>
                                <span className="block truncate text-xs font-semibold text-primary-500 dark:text-slate-400">{object.category}</span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </Panel>
    );
}

function ObjectListPanel() {
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const forceSelectObject = useLocator3DStore((state) => state.forceSelectObject);

    return (
        <Panel icon={Boxes} title="Object List">
            <div className="space-y-2">
                {sceneObjects.map((object, index) => {
                    const selected = selectedObjectId === object.id;

                    return (
                        <button
                            className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                                selected
                                    ? 'border-sky-400 bg-sky-50 shadow-[0_12px_28px_rgba(14,165,233,0.16)]'
                                    : 'border-primary-200 bg-white hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-slate-800'
                            }`}
                            key={object.id}
                            onClick={() => forceSelectObject(object.id)}
                            type="button"
                        >
                            <span className="flex min-w-0 items-center gap-3">
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${selected ? 'bg-sky-500 text-white' : 'bg-primary-100 text-primary-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                                    {object.isLocked ? <Lock className="h-3.5 w-3.5" /> : index + 1}
                                </span>
                                <span className="min-w-0">
                                    <span className="block truncate text-sm font-black text-primary-950 dark:text-white">{object.name}</span>
                                    <span className="block text-xs font-semibold text-primary-500 dark:text-slate-400">
                                        Floor {object.floor}{object.isLocked ? ' / Locked' : ''}
                                    </span>
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </Panel>
    );
}

function ShelfEditor({ object }) {
    const updateShelfProperties = useLocator3DStore((state) => state.updateShelfProperties);

    return (
        <div className="space-y-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-slate-950">
            <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-sky-600">Shelf Editing</p>
                <p className="mt-1 text-xs font-semibold text-primary-500 dark:text-slate-400">Changes update the shelf model immediately.</p>
            </div>
            <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-primary-500 dark:text-slate-400">Aisle name</span>
                <input
                    aria-label="Aisle name"
                    className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    onChange={(event) => updateShelfProperties(object.id, { aisle: event.target.value })}
                    value={object.aisle}
                />
            </label>
            <label className="block">
                <span className="text-xs font-black uppercase tracking-[0.16em] text-primary-500 dark:text-slate-400">Shelf Number</span>
                <input
                    aria-label="Shelf Number"
                    className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                    min="1"
                    onChange={(event) => updateShelfProperties(object.id, { shelfNumber: event.target.value })}
                    type="number"
                    value={object.shelfNumber}
                />
            </label>
            <div>
                <div className="flex items-center justify-between gap-3">
                    <label className="text-xs font-black uppercase tracking-[0.16em] text-primary-500 dark:text-slate-400" htmlFor="locator-bin-count">
                        Number of Bins
                    </label>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-sky-700 shadow-sm dark:bg-slate-900">{object.binCount}</span>
                </div>
                <input
                    aria-label="Number of Bins"
                    className="mt-3 w-full accent-sky-500"
                    id="locator-bin-count"
                    max={SHELF_BIN_RANGE.MAX}
                    min={SHELF_BIN_RANGE.MIN}
                    onChange={(event) => updateShelfProperties(object.id, { binCount: event.target.value })}
                    type="range"
                    value={object.binCount}
                />
                <div className="mt-2 flex justify-between text-[11px] font-black text-primary-400">
                    <span>{SHELF_BIN_RANGE.MIN}</span>
                    <span>{SHELF_BIN_RANGE.MAX}</span>
                </div>
            </div>
        </div>
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
            return;
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

    if (!shelf) {
        return null;
    }

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Assign Product Location" size="lg">
            <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-primary-400">Target shelf</p>
                    <p className="mt-2 text-sm font-black text-primary-950">
                        Aisle {shelf.aisle} / Shelf {shelf.shelfNumber} / Floor {shelf.floor}
                    </p>
                </div>
                <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-primary-500">Product</span>
                    <select
                        aria-label="Product"
                        className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        disabled={isLoadingProducts}
                        onChange={(event) => setSelectedProductId(event.target.value)}
                        value={selectedProductId}
                    >
                        {isLoadingProducts ? (
                            <option>Loading products...</option>
                        ) : products.map((product) => (
                            <option key={product.id} value={product.id}>
                                {product.sku ? `${product.sku} / ${product.name}` : product.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.16em] text-primary-500">Bin Number</span>
                    <input
                        aria-label="Bin Number"
                        className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 text-sm font-bold text-primary-950 shadow-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100"
                        max={shelf.binCount}
                        min="1"
                        onChange={(event) => setBinNumber(Number(event.target.value))}
                        type="number"
                        value={binNumber}
                    />
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                    <button
                        className="min-h-11 rounded-xl border border-primary-200 bg-white px-4 text-sm font-black text-primary-700 transition hover:bg-primary-50"
                        onClick={onClose}
                        type="button"
                    >
                        Cancel
                    </button>
                    <button
                        aria-label="Save Product Location"
                        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-950 px-4 text-sm font-black text-white transition hover:bg-primary-800 disabled:cursor-wait disabled:opacity-60"
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
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const productLocations = useLocator3DStore((state) => state.productLocations);
    const selectedObjectId = useLocator3DStore((state) => state.selectedObjectId);
    const centerCameraOnSelected = useLocator3DStore((state) => state.centerCameraOnSelected);
    const deleteSelectedObject = useLocator3DStore((state) => state.deleteSelectedObject);
    const toggleObjectLock = useLocator3DStore((state) => state.toggleObjectLock);
    const [isAssigningProduct, setIsAssigningProduct] = useState(false);
    const selectedObject = getLocatorObjectById(selectedObjectId, sceneObjects);
    const selectedIsShelf = isShelfObject(selectedObject);
    const shelfAssignments = useMemo(() => (
        selectedIsShelf
            ? productLocations.filter((location) => location.shelfObjectId === selectedObject.id)
            : []
    ), [productLocations, selectedIsShelf, selectedObject]);

    return (
        <Panel icon={Settings2} title="Properties">
            {selectedObject ? (
                <div className="space-y-4">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.22em] text-primary-400 dark:text-slate-500">Selected</p>
                        <h3 className="mt-2 text-lg font-black text-primary-950 dark:text-white">{selectedObject.name}</h3>
                        <p className="mt-1 text-sm font-semibold text-primary-500 dark:text-slate-400">{selectedObject.type}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <PropertyMetric label="Floor" value={selectedObject.floors?.join(', ') ?? selectedObject.floor} />
                        <PropertyMetric label="Width" value={`${selectedObject.dimensions.width} m`} />
                        <PropertyMetric label="Depth" value={`${selectedObject.dimensions.depth} m`} />
                        <PropertyMetric label="Height" value={`${selectedObject.dimensions.height} m`} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            aria-label="Center Camera on Selected Object"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 text-xs font-black text-sky-800 transition hover:bg-sky-100"
                            onClick={centerCameraOnSelected}
                            type="button"
                        >
                            <Camera className="h-4 w-4" />
                            Center
                        </button>
                        <button
                            aria-label={selectedObject.isLocked ? 'Unlock selected object' : 'Lock selected object'}
                            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                                selectedObject.isLocked
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                                    : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
                            }`}
                            onClick={() => toggleObjectLock(selectedObject.id)}
                            type="button"
                        >
                            {selectedObject.isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                            {selectedObject.isLocked ? 'Unlock' : 'Lock'}
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            aria-label="Delete selected object"
                            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={selectedObject.isLocked}
                            onClick={deleteSelectedObject}
                            type="button"
                        >
                            <Trash2 className="h-4 w-4" />
                            Delete
                        </button>
                        {selectedIsShelf && (
                            <button
                                aria-label="Assign Product to Shelf"
                                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-black text-emerald-800 transition hover:bg-emerald-100"
                                onClick={() => setIsAssigningProduct(true)}
                                type="button"
                            >
                                <Package className="h-4 w-4" />
                                Assign
                            </button>
                        )}
                    </div>
                    {selectedIsShelf && <ShelfEditor object={selectedObject} />}
                    {selectedIsShelf && (
                        <div className="rounded-2xl border border-primary-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
                            <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-400 dark:text-slate-500">Assigned products</p>
                            {shelfAssignments.length > 0 ? (
                                <div className="mt-3 space-y-2">
                                    {shelfAssignments.map((location) => (
                                        <div key={location.productId} className="rounded-xl bg-primary-50 px-3 py-2 text-xs font-bold text-primary-700 dark:bg-slate-900 dark:text-slate-300">
                                            {location.sku || location.productName} / Bin {location.binNumber}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-xs font-semibold text-primary-500 dark:text-slate-400">No products assigned to this shelf yet.</p>
                            )}
                        </div>
                    )}
                    <div className="rounded-xl border border-primary-200 bg-primary-50 p-3 dark:border-slate-700 dark:bg-slate-950">
                        <p className="text-xs font-black uppercase tracking-[0.2em] text-primary-400 dark:text-slate-500">Position</p>
                        <p className="mt-2 font-mono text-xs font-semibold text-primary-700 dark:text-slate-300">
                            X {selectedObject.position[0]} / Y {selectedObject.position[1]} / Z {selectedObject.position[2]}
                        </p>
                    </div>
                    <ProductAssignmentModal
                        isOpen={isAssigningProduct}
                        onClose={() => setIsAssigningProduct(false)}
                        shelf={selectedIsShelf ? selectedObject : null}
                    />
                </div>
            ) : (
                <div className="flex min-h-72 items-center justify-center rounded-xl border border-dashed border-primary-300 bg-primary-50 p-6 text-center dark:border-slate-700 dark:bg-slate-950">
                    <div>
                        <MousePointer2 className="mx-auto h-8 w-8 text-primary-400 dark:text-slate-500" />
                        <p className="mt-3 text-sm font-black text-primary-700 dark:text-slate-300">No object selected</p>
                    </div>
                </div>
            )}
        </Panel>
    );
}

function PropertyMetric({ label, value }) {
    return (
        <div className="rounded-xl border border-primary-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-primary-400 dark:text-slate-500">{label}</p>
            <p className="mt-2 text-sm font-black text-primary-950 dark:text-white">{value}</p>
        </div>
    );
}

function SceneStats() {
    const sceneObjects = useLocator3DStore((state) => state.sceneObjects);
    const isDesignMode = useLocator3DStore((state) => state.isDesignMode);
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const summary = getLocatorObjectSummary(sceneObjects);

    return (
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex flex-wrap gap-2">
            <span className="rounded-full border border-white/35 bg-white/90 px-3 py-1 text-xs font-black text-primary-950 shadow-sm backdrop-blur">
                {summary.floors} floors
            </span>
            <span className="rounded-full border border-white/35 bg-white/90 px-3 py-1 text-xs font-black text-primary-950 shadow-sm backdrop-blur">
                {summary.objects} objects
            </span>
            <span className="rounded-full border border-white/35 bg-white/90 px-3 py-1 text-xs font-black text-primary-950 shadow-sm backdrop-blur">
                {summary.shelves} shelves
            </span>
            {isDesignMode && (
                <span className="rounded-full border border-sky-200 bg-sky-100/95 px-3 py-1 text-xs font-black text-sky-900 shadow-sm backdrop-blur">
                    0.5 snap
                </span>
            )}
            {locatedProduct && (
                <span className="rounded-full border border-emerald-200 bg-emerald-100/95 px-3 py-1 text-xs font-black text-emerald-900 shadow-sm backdrop-blur">
                    Locate mode
                </span>
            )}
        </div>
    );
}

function LocatedProductBanner() {
    const locatedProduct = useLocator3DStore((state) => state.locatedProduct);
    const clearLocatedProduct = useLocator3DStore((state) => state.clearLocatedProduct);

    if (!locatedProduct) {
        return null;
    }

    return (
        <div className="pointer-events-auto absolute bottom-4 left-4 right-4 z-10 rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-[0_20px_55px_rgba(15,23,42,0.18)] backdrop-blur dark:border-emerald-900 dark:bg-slate-950/95">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Locate in 3D</p>
                    <h2 className="mt-1 text-lg font-black text-primary-950 dark:text-white">{locatedProduct.locationLabel}</h2>
                    {(locatedProduct.productName || locatedProduct.sku) && (
                        <p className="mt-1 text-sm font-semibold text-primary-500 dark:text-slate-400">
                            {[locatedProduct.sku, locatedProduct.productName].filter(Boolean).join(' / ')}
                        </p>
                    )}
                </div>
                <button
                    className="min-h-10 rounded-xl border border-primary-200 bg-white px-4 text-xs font-black text-primary-700 transition hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    onClick={clearLocatedProduct}
                    type="button"
                >
                    Clear Highlight
                </button>
            </div>
        </div>
    );
}

function HelpPanel() {
    return (
        <Panel icon={HelpCircle} title="Quick Help">
            <div className="space-y-2 text-xs font-semibold leading-5 text-primary-600 dark:text-slate-400">
                <p>Turn on Design Mode to move or rotate unlocked objects with 0.5 unit snapping.</p>
                <p>Select shelves to edit aisle, shelf number, bin count, or assign products to bins.</p>
                <p>Use Delete to remove the selected unlocked object, Escape to deselect, and Ctrl/Cmd + S to save.</p>
            </div>
        </Panel>
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
    const loadLayoutData = useLocator3DStore((state) => state.loadLayoutData);
    const locateProduct = useLocator3DStore((state) => state.locateProduct);
    const resetToDefaultLayout = useLocator3DStore((state) => state.resetToDefaultLayout);
    const setProductLocations = useLocator3DStore((state) => state.setProductLocations);
    const [isSavingLayout, setIsSavingLayout] = useState(false);
    const [isLoadingLayout, setIsLoadingLayout] = useState(false);
    const productId = searchParams.get('productId');
    const productName = searchParams.get('name');
    const productSku = searchParams.get('sku');

    const handleSaveLayout = useCallback(async () => {
        setIsSavingLayout(true);
        try {
            await saveStoreLayout(sceneObjects);
            success('3D layout saved.');
        } catch (saveError) {
            showError(saveError.message || 'Unable to save 3D layout.');
        } finally {
            setIsSavingLayout(false);
        }
    }, [sceneObjects, showError, success]);

    const handleLoadLayout = useCallback(async ({ silent = false, locateProductId = '' } = {}) => {
        setIsLoadingLayout(true);
        try {
            const [layout, locations] = await Promise.all([
                loadStoreLayout(),
                getProductLocations(),
            ]);

            if (layout?.layoutData) {
                loadLayoutData(layout.layoutData);
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
    }, [info, loadLayoutData, locateProduct, productName, productSku, resetToDefaultLayout, setProductLocations, showError, success, warning]);

    const handleResetLayout = useCallback(() => {
        resetToDefaultLayout();
        success('Default two-floor 3D layout restored.');
    }, [resetToDefaultLayout, success]);

    useEffect(() => {
        if (!productId) {
            return;
        }

        void handleLoadLayout({ silent: true, locateProductId: productId });
    }, [handleLoadLayout, productId]);

    useLocatorKeyboardShortcuts(handleSaveLayout);

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-primary-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.06)] dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
                    <div>
                        <p className="text-xs font-black uppercase tracking-[0.28em] text-primary-400 dark:text-slate-500">Admin workspace</p>
                        <h1 className="mt-2 text-2xl font-black text-primary-950 dark:text-white sm:text-3xl">3D Locator</h1>
                    </div>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <DesignModeSwitch />
                        <TopBarActions
                            isLoadingLayout={isLoadingLayout}
                            isSavingLayout={isSavingLayout}
                            onLoadLayout={() => void handleLoadLayout()}
                            onResetLayout={handleResetLayout}
                            onSaveLayout={() => void handleSaveLayout()}
                        />
                    </div>
                </div>
            </div>

            <div className="grid min-h-[calc(100vh-14rem)] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
                <aside className="space-y-4">
                    <ToolsPanel />
                    <HelpPanel />
                    <ObjectLibraryPanel />
                    <ObjectListPanel />
                </aside>

                <main className="min-h-[560px] overflow-hidden rounded-2xl border border-primary-200 bg-slate-950 shadow-[0_28px_70px_rgba(15,23,42,0.14)]">
                    <div className="relative h-[min(72vh,780px)] min-h-[560px]">
                        <SceneStats />
                        <Locator3DScene />
                        <LocatedProductBanner />
                    </div>
                </main>

                <aside>
                    <PropertiesPanel />
                </aside>
            </div>
        </div>
    );
}
