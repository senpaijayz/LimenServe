import React, { useEffect, useMemo, useState } from 'react';
import { Box, Crosshair, MapPin, RotateCcw, Save, Search, Sparkles } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { useToast } from '../../../components/ui/Toast';
import { useAuth } from '../../../context/useAuth';
import ProductLabelPreviewModal from '../../inventory/components/ProductLabelPreviewModal';
import StockroomSceneV2 from '../components/StockroomSceneV2';
import { useStockroomStore } from '../store/useStockroomStoreV2';

function formatLocation(location: any) {
    if (!location) return 'Unassigned';
    const aisle = String.fromCharCode(64 + Number(location.aisle || 1));
    return `Aisle ${aisle} • Shelf ${location.shelf || 1} • Level ${location.level || 1} • Bin ${location.bin || 1}`;
}

export default function StockroomV2() {
    const { isAdmin, hasRole } = useAuth();
    const { success, error: showError } = useToast();
    const [previewProductId, setPreviewProductId] = useState<string | null>(null);
    const {
        products,
        shelves,
        isInitializing,
        isSaving,
        isDirty,
        lastSavedAt,
        selectedProductId,
        activeSearchQuery,
        selectedShelfId,
        currentPath,
        initializeStockroom,
        setCanEdit,
        setIsAdminMode,
        setSearchQuery,
        selectProduct,
        locateProduct,
        clearPath,
        saveLayout,
    } = useStockroomStore();

    const canUseStockroom = hasRole(['admin', 'stock_clerk']);
    const selectedProduct = useMemo(
        () => products.find((product) => product.id === selectedProductId) ?? null,
        [products, selectedProductId],
    );
    const previewProduct = useMemo(
        () => products.find((product) => product.id === previewProductId) ?? null,
        [previewProductId, products],
    );
    const filteredProducts = useMemo(() => {
        const query = activeSearchQuery.trim().toLowerCase();
        if (!query) return products.slice(0, 12);
        return products.filter((product) => (
            product.name.toLowerCase().includes(query)
            || product.sku.toLowerCase().includes(query)
            || product.category.toLowerCase().includes(query)
        )).slice(0, 12);
    }, [activeSearchQuery, products]);

    useEffect(() => {
        setIsAdminMode(Boolean(isAdmin));
        setCanEdit(Boolean(isAdmin));
    }, [isAdmin, setCanEdit, setIsAdminMode]);

    useEffect(() => {
        void initializeStockroom();
    }, [initializeStockroom]);

    useEffect(() => {
        const listener = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            if (detail?.productId) {
                setPreviewProductId(detail.productId);
            }
        };
        window.addEventListener('limen:stockroom-product-preview', listener);
        return () => window.removeEventListener('limen:stockroom-product-preview', listener);
    }, []);

    useEffect(() => {
        if (!isAdmin) return undefined;
        const id = window.setInterval(() => {
            const state = useStockroomStore.getState();
            if (state.isDirty && !state.isSaving) {
                void state.saveLayout().catch((saveError) => {
                    console.error(saveError);
                });
            }
        }, 30_000);
        return () => window.clearInterval(id);
    }, [isAdmin]);

    const handleSave = async () => {
        try {
            await saveLayout();
            success('Stockroom layout saved.');
        } catch (saveError: any) {
            showError(saveError?.message || 'Unable to save stockroom layout.');
        }
    };

    if (!canUseStockroom) {
        return (
            <Card className="text-center py-12">
                <Box className="mx-auto mb-4 h-12 w-12 text-primary-300" />
                <h1 className="text-xl font-black text-primary-950">Stockroom access unavailable</h1>
                <p className="mt-2 text-sm text-primary-500">Only administrators and clerks can use the 3D stockroom locator.</p>
            </Card>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 rounded-[28px] border border-primary-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-accent-blue">
                        <Sparkles className="h-3.5 w-3.5" />
                        Live locator
                    </div>
                    <h1 className="mt-3 text-2xl font-black tracking-tight text-primary-950 lg:text-3xl">3D Stockroom</h1>
                    <p className="mt-1 max-w-2xl text-sm text-primary-500">
                        Locate inventory from the counter to the exact shelf, edit product locations from Inventory, and follow the animated route in the 3D view.
                    </p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                        variant="outline"
                        leftIcon={<RotateCcw className="h-4 w-4" />}
                        onClick={() => {
                            clearPath();
                            setSearchQuery('');
                        }}
                    >
                        Clear route
                    </Button>
                    {isAdmin && (
                        <Button
                            variant="primary"
                            leftIcon={<Save className="h-4 w-4" />}
                            isLoading={isSaving}
                            onClick={handleSave}
                        >
                            {isDirty ? 'Save layout' : 'Saved'}
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="overflow-hidden rounded-[28px] border border-slate-700 bg-slate-950 shadow-2xl">
                    <div className="flex flex-col gap-3 border-b border-white/10 bg-slate-900/95 p-4 md:flex-row md:items-center md:justify-between">
                        <div className="relative max-w-xl flex-1">
                            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                value={activeSearchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                placeholder="Search part number, name, category, or scan barcode..."
                                className="h-12 w-full rounded-2xl border border-slate-700 bg-slate-950 pl-11 pr-4 text-sm font-semibold text-white outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                            />
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-300">
                            <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-cyan-200">
                                {products.length} products
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                                {shelves.length} shelves
                            </span>
                            {lastSavedAt && (
                                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2">
                                    Saved {new Date(lastSavedAt).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="relative h-[560px] min-h-[420px]">
                        <StockroomSceneV2 />
                        {isInitializing && (
                            <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-white backdrop-blur-sm">
                                <div className="rounded-2xl border border-white/10 bg-white/10 px-5 py-4 text-center">
                                    <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
                                    <p className="text-sm font-bold">Loading live stockroom data...</p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <aside className="space-y-4">
                    <Card
                        title="Selected Location"
                        subtitle={selectedProduct ? 'Inventory route target' : 'Choose a product to locate it in 3D.'}
                    >
                        {selectedProduct ? (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4">
                                    <p className="text-xs font-black uppercase tracking-[0.18em] text-primary-500">Product</p>
                                    <p className="mt-2 text-base font-black text-primary-950">{selectedProduct.name}</p>
                                    <p className="mt-1 font-mono text-xs text-primary-500">{selectedProduct.sku}</p>
                                    <div className="mt-4 rounded-xl border border-accent-blue/20 bg-white px-3 py-2 text-sm font-bold text-accent-blue">
                                        <MapPin className="mr-1 inline h-4 w-4" />
                                        {formatLocation(selectedProduct.location)}
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button fullWidth variant="primary" leftIcon={<Crosshair className="h-4 w-4" />} onClick={() => void locateProduct(selectedProduct.id)}>
                                        Locate
                                    </Button>
                                    <Button fullWidth variant="outline" onClick={() => setPreviewProductId(selectedProduct.id)}>
                                        Preview
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50 px-4 py-8 text-center text-sm text-primary-500">
                                Search or click a product marker to unlock live route guidance.
                            </div>
                        )}
                    </Card>

                    <Card title="Quick Results" subtitle="Click a row to locate it. Double-click the 3D product marker for label preview.">
                        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
                            {filteredProducts.length === 0 ? (
                                <div className="rounded-2xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-500">No matching stockroom products.</div>
                            ) : filteredProducts.map((product) => (
                                <button
                                    key={product.id}
                                    type="button"
                                    onClick={() => selectProduct(product.id)}
                                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                                        selectedProductId === product.id
                                            ? 'border-accent-blue bg-accent-blue/10'
                                            : 'border-primary-200 bg-white hover:border-accent-blue/50 hover:bg-primary-50'
                                    }`}
                                >
                                    <p className="line-clamp-1 text-sm font-black text-primary-950">{product.name}</p>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                                        <span className="font-mono text-primary-500">{product.sku}</span>
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2 py-1 font-bold text-primary-600">
                                            {formatLocation(product.location)}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </Card>

                    {selectedShelfId && (
                        <Card title="Shelf Selection" subtitle="Shelf metadata is saved with the stockroom bridge.">
                            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/10 p-4 text-sm font-bold text-primary-950">
                                Active shelf: <span className="font-mono text-accent-blue">{selectedShelfId}</span>
                            </div>
                        </Card>
                    )}

                    {currentPath.length > 0 && (
                        <Card title="Route Status" subtitle="Counter-to-shelf path is active.">
                            <div className="rounded-2xl border border-cyan-300/20 bg-slate-950 p-4 text-sm font-bold text-cyan-100">
                                Follow the cyan route in the 3D view. Use Clear route to return to overview.
                            </div>
                        </Card>
                    )}
                </aside>
            </div>

            <ProductLabelPreviewModal
                isOpen={Boolean(previewProduct)}
                onClose={() => setPreviewProductId(null)}
                product={previewProduct}
                title="Stockroom Label Preview"
            />
        </div>
    );
}
