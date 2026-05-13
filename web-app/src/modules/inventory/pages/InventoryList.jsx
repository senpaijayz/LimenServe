import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import { ArchiveRestore, Search, Plus, Grid, List, Package, Camera, ChevronLeft, ChevronRight, Printer, Edit2, Crosshair } from 'lucide-react';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import { StockBadge } from '../../../components/ui/Badge';
import Dropdown from '../../../components/ui/Dropdown';
import Modal from '../../../components/ui/Modal';
import ProductCard from '../components/ProductCard';
import AddStockModal from '../components/AddStockModal';
import { formatCurrency, formatDateTime, formatNumber } from '../../../utils/formatters';
import { useToast } from '../../../components/ui/Toast';
import CameraScannerModal from '../../../components/ui/CameraScannerModal';
import { useAuth } from '../../../context/useAuth';
import PriceListManager from '../components/PriceListManager';
import ProductLabelPreviewModal from '../components/ProductLabelPreviewModal';
import { archiveCatalogProduct, getArchivedCatalogProducts, getCatalogSummary, getInventoryMovements, receiveInventoryStock, updateCatalogProduct } from '../../../services/catalogApi';
import useProductCatalog from '../../../hooks/useProductCatalog';
import useDataStore from '../../../store/useDataStore';
import { productMatchesIdentifier } from '../../../utils/barcode';
import { buildLocator3DUrl } from '../../locator3d/utils/locatorNavigation';

const PAGE_SIZE = 12;
const MOVEMENT_LABELS = {
    stock_in: 'Stock In',
    stock_out: 'Stock Out',
    adjustment: 'Adjustment',
    reservation: 'Reservation',
    release: 'Release',
    sale: 'Sale',
    service_usage: 'Service Usage',
};

const MOVEMENT_FILTER_OPTIONS = [
    { value: 'all', label: 'All movement types' },
    ...Object.entries(MOVEMENT_LABELS).map(([value, label]) => ({ value, label })),
];

const PRODUCT_STATUS_OPTIONS = [
    { value: 'in_stock', label: 'In Stock' },
    { value: 'low_stock', label: 'Low Stock' },
    { value: 'out_of_stock', label: 'Out of Stock' },
    { value: 'discontinued', label: 'Discontinued' },
];

const INVENTORY_CATEGORY_OPTIONS = [
    'Engine System',
    'Electrical & Lighting',
    'Suspension & Steering',
    'Brake System',
    'Cooling System',
    'Transmission & Drivetrain',
    'Body & Exterior',
    'Interior & Cabin',
    'Filters & Maintenance',
    'Tires & Wheels',
    'Fluids & Chemicals',
    'General Parts & Accessories',
].map((category) => ({ value: category, label: category }));

const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildMovementPrintRows = (movements) => {
    if (!movements.length) {
        return '<tr><td colspan="8" class="empty">No inventory movement history found for this report.</td></tr>';
    }

    return movements.map((movement, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
                <strong>${escapeHtml(movement.productName || 'Unknown product')}</strong>
                <span>${escapeHtml(movement.sku || 'NO SKU')}</span>
            </td>
            <td>${escapeHtml(MOVEMENT_LABELS[movement.movementType] || movement.movementType || 'Movement')}</td>
            <td>${escapeHtml(formatNumber(movement.quantity ?? 0))}</td>
            <td>${escapeHtml(movement.referenceType || '-')}</td>
            <td>${escapeHtml(movement.performedBy || 'System')}</td>
            <td>${escapeHtml(formatDateTime(movement.createdAt))}</td>
            <td>${escapeHtml(movement.notes || '-')}</td>
        </tr>
    `).join('');
};

const printInventoryMovementReport = ({ movements, catalogSummary }) => {
    const printWindow = window.open('', '_blank', 'noopener,noreferrer,width=1100,height=760');
    if (!printWindow) return;

    const generatedAt = formatDateTime(new Date());
    const totalQuantity = movements.reduce((sum, movement) => sum + Number(movement.quantity ?? 0), 0);
    const uniqueProducts = new Set(movements.map((movement) => movement.productId).filter(Boolean)).size;

    const html = `
        <!doctype html>
        <html>
            <head>
                <meta charset="utf-8" />
                <title>Inventory Movement Audit Report</title>
                <style>
                    @page { size: A4 landscape; margin: 12mm; }
                    * { box-sizing: border-box; }
                    body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: #fff; font-size: 10px; }
                    .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; }
                    h1 { margin: 0; font-size: 22px; letter-spacing: -0.02em; }
                    h2 { margin: 0; font-size: 18px; text-transform: uppercase; text-align: right; }
                    p { margin: 4px 0 0; color: #475569; line-height: 1.45; }
                    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 14px 0; }
                    .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px; }
                    .label { display: block; color: #64748b; font-size: 8px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 5px; }
                    .value { font-size: 16px; font-weight: 800; color: #0f172a; }
                    table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; }
                    th { background: #f1f5f9; color: #475569; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; text-align: left; padding: 7px; border-bottom: 1px solid #cbd5e1; }
                    td { padding: 7px; border-bottom: 1px solid #e2e8f0; vertical-align: top; line-height: 1.35; }
                    td span { display: block; margin-top: 2px; color: #64748b; font-size: 9px; }
                    tr:last-child td { border-bottom: 0; }
                    .empty { color: #64748b; font-style: italic; text-align: center; }
                    .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-top: 34px; }
                    .signature { border-top: 1px solid #0f172a; padding-top: 7px; text-align: center; color: #475569; font-size: 9px; }
                    .footer { margin-top: 14px; padding-top: 9px; border-top: 1px solid #cbd5e1; color: #64748b; font-size: 9px; text-align: center; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <section class="header">
                    <div>
                        <h1>Limen Auto Supply and Services</h1>
                        <p>Inventory movement audit trail for stock receiving, adjustments, archive, restore, sales, and service usage.</p>
                        <p>Contact: (0915) 522 5629 | Landline: 0285513518</p>
                    </div>
                    <div>
                        <h2>Inventory Audit Report</h2>
                        <p>Generated ${escapeHtml(generatedAt)}</p>
                        <p>Prepared from LimenServe live movement records</p>
                    </div>
                </section>

                <section class="meta">
                    <div class="box"><span class="label">Movement Rows</span><div class="value">${escapeHtml(formatNumber(movements.length))}</div></div>
                    <div class="box"><span class="label">Unique Products</span><div class="value">${escapeHtml(formatNumber(uniqueProducts))}</div></div>
                    <div class="box"><span class="label">Total Quantity Moved</span><div class="value">${escapeHtml(formatNumber(totalQuantity))}</div></div>
                    <div class="box"><span class="label">Catalog Products</span><div class="value">${escapeHtml(formatNumber(catalogSummary?.totalProducts ?? 0))}</div></div>
                </section>

                <table>
                    <thead>
                        <tr>
                            <th style="width: 34px;">#</th>
                            <th style="width: 180px;">Product</th>
                            <th style="width: 96px;">Action</th>
                            <th style="width: 64px;">Qty</th>
                            <th style="width: 98px;">Reference</th>
                            <th style="width: 120px;">Performed By</th>
                            <th style="width: 110px;">Date</th>
                            <th>Notes</th>
                        </tr>
                    </thead>
                    <tbody>${buildMovementPrintRows(movements)}</tbody>
                </table>

                <section class="signatures">
                    <div class="signature">Prepared By</div>
                    <div class="signature">Checked By</div>
                    <div class="signature">Approved By</div>
                </section>

                <p class="footer">This report is generated from LimenServe inventory movement records and should be reconciled with physical stock counts during audit.</p>
                <script>window.onload = () => { window.focus(); window.print(); };</script>
            </body>
        </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
};

function getReadableClassification(product = {}) {
    const category = product.category || 'General Parts & Accessories';
    const strategy = product.classification?.strategy;
    const confidence = product.classification?.confidence;

    if (strategy === 'fallback') {
        return `${category} (default category)`;
    }

    if (confidence) {
        return `${category} (${confidence} confidence)`;
    }

    return category;
}

function formatCatalogProduct(product) {
    return {
        id: product.id,
        catalogEntryId: product.catalogEntryId || product.id,
        sku: product.sku,
        name: product.name,
        model: product.model,
        category: product.category,
        sourceCategory: product.sourceCategory ?? null,
        classification: product.classification ?? null,
        price: Number(product.price ?? 0),
        stock: Number(product.stock ?? 0),
        quantity: Number(product.stock ?? 0),
        status: product.status ?? 'in_stock',
        uom: product.uom ?? 'PC',
        brand: product.brand ?? 'Mitsubishi',
        cost: Math.round(Number(product.price ?? 0) * 0.55),
        location: product.location ?? { floor: '-', section: '-', shelf: '-' },
    };
}

function normalizeLocationForDisplay(rawLocation) {
    const location = rawLocation && typeof rawLocation === 'object' ? rawLocation : {};
    const aisle = location.aisle
        ? String(location.aisle).replace(/^aisle\s+/i, '').toUpperCase()
        : '';
    const shelfNumber = location.shelfNumber ?? location.shelf_number ?? location.shelf;
    const level = location.level;
    const bin = location.bin || location.binLabel || location.slot;

    if (location.label) {
        return location.label;
    }

    if (aisle || shelfNumber || bin) {
        return [
            aisle ? `Aisle ${aisle}` : null,
            shelfNumber ? `Shelf ${shelfNumber}` : null,
            level ? `Level ${level}` : null,
            bin ? `Bin ${bin}` : null,
        ].filter(Boolean).join(' • ');
    }

    const legacy = [
        location.floor ? `F${location.floor}` : null,
        location.section ? `${location.section}` : null,
        location.shelf ? `Shelf ${location.shelf}` : null,
    ].filter(Boolean).join('-');

    return legacy || 'Unassigned';
}

const inputClassName = 'w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-sm text-primary-950 shadow-sm outline-none transition focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/15';

function buildEditProductForm(product = {}) {
    return {
        sku: product.sku || '',
        name: product.name || '',
        model: product.model || '',
        category: product.category || 'General Parts & Accessories',
        sourceCategory: product.sourceCategory || '',
        brand: product.brand || 'Mitsubishi',
        uom: product.uom || 'PC',
        status: product.status || (Number(product.quantity ?? product.stock ?? 0) <= 0 ? 'out_of_stock' : 'in_stock'),
        price: String(product.price ?? 0),
    };
}

function EditProductModal({ isOpen, product, isSaving, onClose, onSave }) {
    if (!product) {
        return null;
    }

    return (
        <EditProductModalContent
            key={product.id}
            isOpen={isOpen}
            product={product}
            isSaving={isSaving}
            onClose={onClose}
            onSave={onSave}
        />
    );
}

function EditProductModalContent({ isOpen, product, isSaving, onClose, onSave }) {
    const [form, setForm] = useState(() => buildEditProductForm(product));

    const updateForm = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        onSave(form);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Inventory Details"
            size="xl"
            footer={(
                <>
                    <Button variant="secondary" onClick={onClose} disabled={isSaving}>Cancel</Button>
                    <Button variant="primary" type="submit" form="inventory-product-edit-form" isLoading={isSaving} leftIcon={<Edit2 className="h-4 w-4" />}>
                        Save Details
                    </Button>
                </>
            )}
        >
            <form id="inventory-product-edit-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-500">Current classification</p>
                    <p className="mt-1 text-sm font-semibold text-primary-950">{getReadableClassification(product)}</p>
                    <p className="mt-1 text-xs text-primary-500">Change the category below to replace internal fallback labels with a clear inventory category.</p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Part number</span>
                        <input className={`${inputClassName} mt-2`} value={form.sku} onChange={(event) => updateForm('sku', event.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Retail price</span>
                        <input className={`${inputClassName} mt-2`} type="number" min="0" step="0.01" value={form.price} onChange={(event) => updateForm('price', event.target.value)} required />
                    </label>
                    <label className="block md:col-span-2">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Product name</span>
                        <input className={`${inputClassName} mt-2`} value={form.name} onChange={(event) => updateForm('name', event.target.value)} required />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Category</span>
                        <select className={`${inputClassName} mt-2`} value={form.category} onChange={(event) => updateForm('category', event.target.value)} required>
                            {INVENTORY_CATEGORY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Status</span>
                        <select className={`${inputClassName} mt-2`} value={form.status} onChange={(event) => updateForm('status', event.target.value)} required>
                            {PRODUCT_STATUS_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Vehicle model</span>
                        <input className={`${inputClassName} mt-2`} value={form.model} onChange={(event) => updateForm('model', event.target.value)} placeholder="Example: MONTERO CR45" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Source category</span>
                        <input className={`${inputClassName} mt-2`} value={form.sourceCategory} onChange={(event) => updateForm('sourceCategory', event.target.value)} placeholder="Original pricelist/category label" />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Brand</span>
                        <input className={`${inputClassName} mt-2`} value={form.brand} onChange={(event) => updateForm('brand', event.target.value)} />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500">Unit</span>
                        <input className={`${inputClassName} mt-2`} value={form.uom} onChange={(event) => updateForm('uom', event.target.value)} placeholder="PC" />
                    </label>
                </div>
            </form>
        </Modal>
    );
}

const InventoryList = () => {
    const navigate = useNavigate();
    const { success, error: showError } = useToast();
    const { isAdmin } = useAuth();    const findProduct = useDataStore((state) => state.findProduct);
    const [catalogSummary, setCatalogSummary] = useState(null);
    const [summaryError, setSummaryError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedStockFilter, setSelectedStockFilter] = useState('all');
    const [viewMode, setViewMode] = useState('grid');
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCameraScanner, setShowCameraScanner] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [refreshKey, setRefreshKey] = useState(0);
    const [productOverrides, setProductOverrides] = useState({});
    const [selectedPreviewProduct, setSelectedPreviewProduct] = useState(null);
    const [editingProduct, setEditingProduct] = useState(null);
    const [savingProductDetails, setSavingProductDetails] = useState(false);
    const [archivingProductId, setArchivingProductId] = useState(null);
    const [restoringProductId, setRestoringProductId] = useState(null);
    const [archivedProducts, setArchivedProducts] = useState([]);
    const [archiveError, setArchiveError] = useState('');
    const [stockMovements, setStockMovements] = useState([]);
    const [movementError, setMovementError] = useState('');
    const [printingMovements, setPrintingMovements] = useState(false);
    const [movementSearchQuery, setMovementSearchQuery] = useState('');
    const [selectedMovementType, setSelectedMovementType] = useState('all');
    const {
        products,
        categories: catalogCategories,
        pagination,
        loading,
        error: catalogError,
    } = useProductCatalog({
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery,
        selectedCategory,
        sortBy: 'name-asc',
        refreshKey,
    });

    useEffect(() => {
        let active = true;

        void (async () => {
            try {
                const [summary, movements, archives] = await Promise.all([
                    getCatalogSummary(),
                    getInventoryMovements(24),
                    isAdmin ? getArchivedCatalogProducts(8) : Promise.resolve([]),
                ]);
                if (active) {
                    setCatalogSummary(summary);
                    setStockMovements(movements);
                    setArchivedProducts(archives);
                    setSummaryError('');
                    setMovementError('');
                    setArchiveError('');
                }
            } catch (loadError) {
                if (active) {
                    setSummaryError(loadError.message || 'Unable to load catalog summary.');
                    setMovementError(loadError.message || 'Unable to load movement history.');
                    setArchiveError(loadError.message || 'Unable to load archived products.');
                }
            }
        })();

        return () => {
            active = false;
        };
    }, [isAdmin]);

    const refreshInventoryMeta = async () => {
        const [summary, movements, archives] = await Promise.all([
            getCatalogSummary(),
            getInventoryMovements(24),
            isAdmin ? getArchivedCatalogProducts(8) : Promise.resolve([]),
        ]);
        setCatalogSummary(summary);
        setStockMovements(movements);
        setArchivedProducts(archives);
        setSummaryError('');
        setMovementError('');
        setArchiveError('');
    };

    const visibleProducts = useMemo(() => (
        products.map((product) => productOverrides[product.id] ?? formatCatalogProduct(product))
    ), [productOverrides, products]);

    const categories = useMemo(() => (
        catalogCategories.map((category) => ({
            value: category.value,
            label: `${category.label} (${formatNumber(category.count ?? 0)})`,
        }))
    ), [catalogCategories]);

    const stockFilters = useMemo(() => {
        const allCount = visibleProducts.length;
        const outOfStockCount = visibleProducts.filter((product) => product.quantity <= 0).length;
        const lowStockOnlyCount = visibleProducts.filter((product) => product.quantity > 0 && product.quantity <= 5).length;
        const mediumStockCount = visibleProducts.filter((product) => product.quantity >= 6 && product.quantity <= 20).length;
        const highStockCount = visibleProducts.filter((product) => product.quantity > 20).length;

        return [
            { value: 'all', label: `All Stock Levels (${allCount})` },
            { value: 'out', label: `Out of Stock (0 qty) (${outOfStockCount})` },
            { value: 'low', label: `Low Stock (1-5 qty) (${lowStockOnlyCount})` },
            { value: 'medium', label: `Medium Stock (6-20 qty) (${mediumStockCount})` },
            { value: 'high', label: `High Stock (21+ qty) (${highStockCount})` },
        ];
    }, [visibleProducts]);

    const filteredProducts = useMemo(() => (
        visibleProducts.filter((product) => {
            const matchesStock = selectedStockFilter === 'all'
                || (selectedStockFilter === 'out' && product.quantity <= 0)
                || (selectedStockFilter === 'low' && product.quantity > 0 && product.quantity <= 5)
                || (selectedStockFilter === 'medium' && product.quantity >= 6 && product.quantity <= 20)
                || (selectedStockFilter === 'high' && product.quantity > 20);
            return matchesStock;
        })
    ), [selectedStockFilter, visibleProducts]);

    const filteredStockMovements = useMemo(() => {
        const normalizedSearch = movementSearchQuery.trim().toLowerCase();

        return stockMovements.filter((movement) => {
            const matchesType = selectedMovementType === 'all' || movement.movementType === selectedMovementType;
            const searchable = [
                movement.productName,
                movement.sku,
                MOVEMENT_LABELS[movement.movementType] || movement.movementType,
                movement.referenceType,
                movement.performedBy,
                movement.notes,
            ].filter(Boolean).join(' ').toLowerCase();

            return matchesType && (!normalizedSearch || searchable.includes(normalizedSearch));
        });
    }, [movementSearchQuery, selectedMovementType, stockMovements]);

    const totalProducts = catalogSummary?.totalProducts ?? pagination.totalCount ?? visibleProducts.length;
    const uniqueProducts = catalogSummary?.uniqueProducts ?? pagination.totalCount ?? visibleProducts.length;
    const currentPrices = catalogSummary?.currentPrices ?? pagination.totalCount ?? visibleProducts.length;
    const lowStockCount = filteredProducts.filter((product) => product.quantity <= 5).length;
    const totalValue = filteredProducts.reduce((sum, product) => sum + (product.price * product.quantity), 0);
    const canGoPrev = (pagination.page ?? currentPage) > 1;
    const canGoNext = (pagination.page ?? currentPage) < (pagination.totalPages ?? 1);
    const rangeStart = pagination.totalCount === 0 ? 0 : (((pagination.page ?? currentPage) - 1) * (pagination.pageSize ?? PAGE_SIZE)) + 1;
    const rangeEnd = pagination.totalCount === 0 ? 0 : Math.min((pagination.page ?? currentPage) * (pagination.pageSize ?? PAGE_SIZE), pagination.totalCount ?? 0);

    const openPreview = (product) => {
        if (!product) {
            return;
        }

        setSelectedPreviewProduct(productOverrides[product.id] ?? formatCatalogProduct(product));
    };

    const handleSearchQueryChange = (value) => {
        setSearchQuery(value);
        setCurrentPage(1);
    };

    const handleCategoryChange = (value) => {
        setSelectedCategory(value);
        setCurrentPage(1);
    };

    const handleStockFilterChange = (value) => {
        setSelectedStockFilter(value);
        setCurrentPage(1);
    };

    const openEditProduct = (product) => {
        setEditingProduct(productOverrides[product.id] ?? formatCatalogProduct(product));
    };

    const handleLocateIn3D = (product) => {
        if (!product) {
            return;
        }

        const normalizedProduct = productOverrides[product.id] ?? formatCatalogProduct(product);

        setSelectedPreviewProduct(null);
        navigate(buildLocator3DUrl(normalizedProduct));
    };

    const handleSaveProductDetails = async (form) => {
        if (!editingProduct?.id) {
            return;
        }

        setSavingProductDetails(true);
        try {
            const updatedProduct = await updateCatalogProduct(editingProduct.id, {
                ...form,
                price: Number(form.price ?? 0),
                stock: editingProduct.quantity ?? editingProduct.stock ?? 0,
            });
            const normalizedProduct = {
                ...editingProduct,
                ...formatCatalogProduct({
                    ...updatedProduct,
                    stock: editingProduct.quantity ?? editingProduct.stock ?? updatedProduct?.stock ?? 0,
                    location: editingProduct.location,
                }),
            };

            setProductOverrides((current) => ({
                ...current,
                [editingProduct.id]: normalizedProduct,
            }));
            setSelectedPreviewProduct((current) => (current?.id === editingProduct.id ? normalizedProduct : current));
            setEditingProduct(null);
            setRefreshKey((value) => value + 1);
            success('Inventory details updated successfully.');
        } catch (saveError) {
            showError(saveError.message || 'Unable to update inventory details.');
        } finally {
            setSavingProductDetails(false);
        }
    };
    const lookupAndPreviewProduct = async (identifier) => {
        const trimmedIdentifier = String(identifier || '').trim();
        if (!trimmedIdentifier) {
            return;
        }

        const visibleMatch = visibleProducts.find((product) => productMatchesIdentifier(product, trimmedIdentifier));

        if (visibleMatch) {
            openPreview(visibleMatch);
            return visibleMatch;
        }

        const product = await findProduct(trimmedIdentifier);
        if (product) {
            openPreview(product);
            return product;
        }

        showError(`No inventory item matched ${trimmedIdentifier}.`);
        return null;
    };

    const handleArchiveProduct = async () => {
        if (!selectedPreviewProduct?.id) {
            return;
        }

        const confirmed = window.confirm(`Archive ${selectedPreviewProduct.name}? It will be removed from active catalog, POS, and quote selection after refresh.`);
        if (!confirmed) {
            return;
        }

        setArchivingProductId(selectedPreviewProduct.id);
        try {
            await archiveCatalogProduct(selectedPreviewProduct.id, {
                archive: true,
                reason: 'Archived from inventory management',
            });
            setSelectedPreviewProduct(null);
            setProductOverrides((current) => {
                const next = { ...current };
                delete next[selectedPreviewProduct.id];
                return next;
            });
            setRefreshKey((value) => value + 1);
            await refreshInventoryMeta();
            success(`${selectedPreviewProduct.name} was archived and removed from active inventory.`);
        } catch (archiveError) {
            showError(archiveError.message || 'Unable to archive this product.');
        } finally {
            setArchivingProductId(null);
        }
    };

    const handleRestoreProduct = async (product) => {
        if (!product?.id) {
            return;
        }

        setRestoringProductId(product.id);
        try {
            await archiveCatalogProduct(product.id, {
                archive: false,
                reason: 'Restored from inventory archive',
            });
            setArchivedProducts((current) => current.filter((item) => item.id !== product.id));
            setRefreshKey((value) => value + 1);
            await refreshInventoryMeta();
            success(`${product.name} was restored to active inventory.`);
        } catch (restoreError) {
            showError(restoreError.message || 'Unable to restore this product.');
        } finally {
            setRestoringProductId(null);
        }
    };

    const handlePrintMovementReport = async () => {
        setPrintingMovements(true);
        try {
            const movements = await getInventoryMovements(100);
            printInventoryMovementReport({
                movements,
                catalogSummary,
            });
        } catch (printError) {
            showError(printError.message || 'Unable to prepare inventory movement report.');
        } finally {
            setPrintingMovements(false);
        }
    };
    return (
        <div className="space-y-6">
            {/* Page Header */}
            <div>
                <h1 className="text-2xl font-bold font-display text-primary-950 tracking-tight">Inventory</h1>
                <p className="text-sm text-primary-500 mt-0.5">Manage products, stock levels, and movement history</p>
            </div>

            {/* KPI Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-info rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-info/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-info" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">Total Products</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{formatNumber(totalProducts)}</p>
                        <p className="text-xs text-primary-400 mt-1">{formatNumber(uniqueProducts)} unique SKUs loaded</p>
                    </div>
                </div>

                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-success rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-success/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">In Stock</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{lowStockCount}</p>
                        <p className="text-xs text-primary-400 mt-1">{formatNumber(currentPrices)} current price rows active</p>
                    </div>
                </div>

                <div className="bg-white border border-primary-200 border-l-4 border-l-accent-success rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent-success/10 flex items-center justify-center">
                        <Package className="w-6 h-6 text-accent-success" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary-500 mb-0.5">Inventory Value</p>
                        <p className="text-2xl font-bold font-display text-primary-950 leading-none">{formatCurrency(totalValue)}</p>
                        {summaryError
                            ? <p className="text-xs text-accent-danger mt-1">{summaryError}</p>
                            : <p className="text-xs text-primary-400 mt-1">Visible on-page total</p>
                        }
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap gap-2 items-center">
                {/* Search + Camera */}
                <div className="relative flex gap-2 flex-1 min-w-[200px] max-w-xs">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-400" />
                        <input
                            type="text"
                            placeholder="Search products or scan barcode..."
                            value={searchQuery}
                            onChange={(event) => handleSearchQueryChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                    void lookupAndPreviewProduct(searchQuery);
                                }
                            }}
                            className="w-full pl-10 pr-4 py-2.5 bg-white border border-primary-200 rounded-xl text-primary-950 placeholder-primary-400 focus:outline-none focus:border-accent-blue focus:ring-2 focus:ring-accent-blue/10 shadow-sm text-sm"
                        />
                    </div>
                    <Button
                        variant="secondary"
                        className="px-3 flex-shrink-0"
                        onClick={() => setShowCameraScanner(true)}
                        title="Scan Barcode with Camera"
                    >
                        <Camera className="w-4 h-4 text-primary-600" />
                    </Button>
                </div>

                {/* Category dropdown — fixed width, never grows */}
                <div className="flex-shrink-0 w-44">
                    <Dropdown
                        options={categories}
                        value={selectedCategory}
                        onChange={handleCategoryChange}
                    />
                </div>

                {/* Stock level dropdown — fixed width, never grows */}
                <div className="flex-shrink-0 w-48">
                    <Dropdown
                        options={stockFilters}
                        value={selectedStockFilter}
                        onChange={handleStockFilterChange}
                    />
                </div>

                {/* Right actions — pushed to the end */}
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                    {isAdmin && (
                        <PriceListManager onUpdated={async () => {
                            setRefreshKey((value) => value + 1);
                            try {
                                await refreshInventoryMeta();
                            } catch (loadError) {
                                setSummaryError(loadError.message || 'Unable to refresh catalog summary.');
                            }
                        }} />
                    )}

                    <div className="hidden items-center border border-primary-200 rounded-xl bg-primary-50 p-1 sm:flex gap-0.5">
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`min-h-9 min-w-9 rounded-lg p-2 transition-all duration-150 ${viewMode === 'grid' ? 'bg-white text-accent-primary shadow-sm border border-primary-200' : 'text-primary-400 hover:text-primary-700'}`}
                            aria-label="Show inventory as cards"
                        >
                            <Grid className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => setViewMode('list')}
                            className={`min-h-9 min-w-9 rounded-lg p-2 transition-all duration-150 ${viewMode === 'list' ? 'bg-white text-accent-primary shadow-sm border border-primary-200' : 'text-primary-400 hover:text-primary-700'}`}
                            aria-label="Show inventory as table"
                        >
                            <List className="w-4 h-4" />
                        </button>
                    </div>

                    <Button
                        variant="primary"
                        leftIcon={<Plus className="w-4 h-4" />}
                        onClick={() => setShowAddModal(true)}
                        className="whitespace-nowrap"
                    >
                        Add Stock
                    </Button>
                </div>
            </div>

            <Card
                title="Inventory Movement Ledger"
                subtitle="Searchable audit trail for stock receiving, sales usage, archive, restore, and adjustments."
                headerAction={(
                    <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Printer className="h-4 w-4" />}
                        isLoading={printingMovements}
                        onClick={handlePrintMovementReport}
                    >
                        Print Audit PDF
                    </Button>
                )}
            >
                {movementError ? (
                    <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                        {movementError}
                    </div>
                ) : stockMovements.length === 0 ? (
                    <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                        No inventory movement history has been recorded yet.
                    </div>
                ) : (
                    <div className="space-y-4">
                        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                                <input
                                    type="text"
                                    value={movementSearchQuery}
                                    onChange={(event) => setMovementSearchQuery(event.target.value)}
                                    placeholder="Search movement by product, SKU, action, staff, or notes..."
                                    className="w-full rounded-lg border border-primary-200 bg-white py-2.5 pl-10 pr-4 text-primary-950 shadow-sm placeholder-primary-400 focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue"
                                />
                            </div>
                            <Dropdown
                                options={MOVEMENT_FILTER_OPTIONS}
                                value={selectedMovementType}
                                onChange={setSelectedMovementType}
                                className="w-full"
                            />
                        </div>

                        {filteredStockMovements.length === 0 ? (
                            <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                                No stock movement matches the current search or filter.
                            </div>
                        ) : (
                            <>
                                <div className="hidden overflow-x-auto rounded-2xl border border-primary-200 lg:block">
                                    <table className="min-w-full divide-y divide-primary-100 bg-white text-sm">
                                        <thead className="bg-primary-50">
                                            <tr>
                                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Product</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Action</th>
                                                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Qty</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Reference</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Performed By</th>
                                                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-[0.14em] text-primary-500">Date</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-primary-100">
                                            {filteredStockMovements.map((movement) => (
                                                <tr key={movement.id} className="hover:bg-primary-50/60">
                                                    <td className="px-4 py-3">
                                                        <p className="font-bold text-primary-950">{movement.productName}</p>
                                                        <p className="mt-0.5 font-mono text-xs text-primary-500">{movement.sku || 'NO SKU'}</p>
                                                        {movement.notes && <p className="mt-1 line-clamp-1 text-xs text-primary-500">{movement.notes}</p>}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2.5 py-1 text-xs font-bold text-accent-blue">
                                                            {MOVEMENT_LABELS[movement.movementType] || movement.movementType}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-bold text-primary-950">{formatNumber(movement.quantity)}</td>
                                                    <td className="px-4 py-3 text-primary-600">{movement.referenceType || '-'}</td>
                                                    <td className="px-4 py-3 text-primary-700">{movement.performedBy}</td>
                                                    <td className="px-4 py-3 text-primary-600">{formatDateTime(movement.createdAt)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="grid gap-3 lg:hidden">
                                    {filteredStockMovements.map((movement) => (
                                        <div key={movement.id} className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-bold text-primary-950">{movement.productName}</p>
                                                    <p className="mt-1 font-mono text-xs text-primary-500">{movement.sku || 'NO SKU'}</p>
                                                </div>
                                                <span className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2.5 py-1 text-xs font-bold text-accent-blue">
                                                    {formatNumber(movement.quantity)}
                                                </span>
                                            </div>
                                            <div className="mt-3 space-y-1 text-xs text-primary-500">
                                                <p><span className="font-semibold text-primary-700">{MOVEMENT_LABELS[movement.movementType] || movement.movementType}</span> by {movement.performedBy}</p>
                                                <p>{formatDateTime(movement.createdAt)}</p>
                                                <p>Reference: {movement.referenceType || '-'}</p>
                                                {movement.notes && <p className="line-clamp-2">{movement.notes}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </Card>

            {isAdmin && (
                <Card
                    title="Archived Products"
                    subtitle="Soft-deleted inventory items hidden from active catalog, POS, and quotation flows."
                >
                    {archiveError ? (
                        <div className="rounded-xl border border-accent-danger/20 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                            {archiveError}
                        </div>
                    ) : archivedProducts.length === 0 ? (
                        <div className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">
                            No archived products yet.
                        </div>
                    ) : (
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {archivedProducts.map((product) => (
                                <div key={product.id} className="rounded-2xl border border-primary-200 bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-bold text-primary-950">{product.name}</p>
                                            <p className="mt-1 font-mono text-xs text-primary-500">{product.sku || 'NO SKU'}</p>
                                        </div>
                                        <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary-500">
                                            Archived
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-primary-500">
                                        <p><span className="font-semibold text-primary-700">Qty:</span> {formatNumber(product.stock ?? 0)}</p>
                                        <p><span className="font-semibold text-primary-700">Price:</span> {formatCurrency(product.price ?? 0)}</p>
                                        <p className="col-span-2"><span className="font-semibold text-primary-700">Archived:</span> {formatDateTime(product.archivedAt)}</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        className="mt-4 w-full"
                                        leftIcon={<ArchiveRestore className="h-4 w-4" />}
                                        isLoading={restoringProductId === product.id}
                                        onClick={() => void handleRestoreProduct(product)}
                                    >
                                        Restore
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {loading ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-400 mx-auto mb-4 animate-pulse" />
                    <h3 className="text-lg font-semibold text-primary-300 mb-2">Connecting to Supabase...</h3>
                    <p className="text-primary-500">Fetching live inventory data</p>
                </Card>
            ) : catalogError ? (
                <Card className="text-center py-12">
                    <AlertTriangle className="w-12 h-12 text-accent-danger mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">Database catalog unavailable</h3>
                    <p className="text-primary-500 font-medium">{catalogError}</p>
                </Card>
            ) : filteredProducts.length === 0 ? (
                <Card className="text-center py-12">
                    <Package className="w-12 h-12 text-primary-300 mx-auto mb-4" />
                    <h3 className="text-lg font-bold text-primary-900 mb-2">No products found</h3>
                    <p className="text-primary-500 font-medium">Try adjusting your search or filter criteria</p>
                </Card>
            ) : viewMode === 'grid' ? (
                <Motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                >
                    {filteredProducts.map((product) => (
                        <ProductCard
                            key={product.catalogEntryId || product.id}
                            product={product}
                            onEdit={isAdmin ? openEditProduct : null}
                            onSelect={openPreview}
                        />
                    ))}
                </Motion.div>
            ) : (
                <Card padding="none">
                    <div className="overflow-x-auto">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Product</th>
                                    <th>SKU</th>
                                    <th>Category</th>
                                    <th className="text-right">Price</th>
                                    <th className="text-right">Qty</th>
                                    <th>Status</th>
                                    <th>Location</th>
                                    {isAdmin && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProducts.map((product) => (
                                    <tr
                                        key={product.catalogEntryId || product.id}
                                        className="cursor-pointer hover:bg-primary-50 transition-colors"
                                        onClick={() => openPreview(product)}
                                    >
                                        <td className="font-bold text-primary-950 border-b border-primary-100 py-3">{product.name}</td>
                                        <td className="font-mono text-sm text-primary-500 border-b border-primary-100 py-3">{product.sku}</td>
                                        <td className="border-b border-primary-100 py-3 text-primary-700">{product.category}</td>
                                        <td className="text-right border-b border-primary-100 py-3 font-semibold text-accent-blue">{formatCurrency(product.price)}</td>
                                        <td className="text-right border-b border-primary-100 py-3 text-primary-900 font-bold">{product.quantity}</td>
                                        <td className="border-b border-primary-100 py-3"><StockBadge quantity={product.quantity} /></td>
                                        <td className="border-b border-primary-100 py-3">
                                            <button
                                                type="button"
                                                className="rounded-full border border-accent-blue/20 bg-accent-blue/10 px-3 py-1.5 text-xs font-bold text-accent-blue transition hover:border-accent-blue/50 hover:bg-accent-blue/15"
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    openPreview(product);
                                                }}
                                            >
                                                {normalizeLocationForDisplay(product.location)}
                                            </button>
                                        </td>
                                        {isAdmin && (
                                            <td className="border-b border-primary-100 py-3">
                                                <div className="flex flex-wrap gap-2">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    leftIcon={<Edit2 className="h-4 w-4" />}
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        openEditProduct(product);
                                                    }}
                                                >
                                                    Edit
                                                </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {!loading && !catalogError && pagination.totalPages > 1 && (
                <Card padding="sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm text-primary-600">
                            Showing <span className="font-semibold text-primary-950">{rangeStart}-{rangeEnd}</span> of <span className="font-semibold text-primary-950">{formatNumber(pagination.totalCount ?? 0)}</span> products
                        </p>
                        <div className="flex w-full flex-col gap-2 min-[420px]:flex-row sm:w-auto sm:items-center">
                            <Button
                                variant="secondary"
                                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
                                disabled={!canGoPrev}
                                leftIcon={<ChevronLeft className="h-4 w-4" />}
                                className="w-full min-[420px]:w-auto"
                            >
                                Previous
                            </Button>
                            <span className="min-w-[108px] text-center text-sm font-semibold text-primary-700">
                                Page {pagination.page ?? currentPage} of {pagination.totalPages ?? 1}
                            </span>
                            <Button
                                variant="secondary"
                                onClick={() => setCurrentPage((page) => Math.min(page + 1, pagination.totalPages ?? page))}
                                disabled={!canGoNext}
                                rightIcon={<ChevronRight className="h-4 w-4" />}
                                className="w-full min-[420px]:w-auto"
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </Card>
            )}

            <AddStockModal
                isOpen={showAddModal}
                onClose={() => setShowAddModal(false)}
                onSave={async ({ product, quantity, supplierName, referenceNumber, reason }) => {
                    const result = await receiveInventoryStock({
                        productId: product.id,
                        quantity,
                        supplierName,
                        referenceNumber,
                        reason,
                    });
                    const updatedProduct = {
                        ...product,
                        stock: result.updatedStock,
                        quantity: result.updatedStock,
                    };

                    setProductOverrides((current) => ({
                        ...current,
                        [updatedProduct.id]: updatedProduct,
                    }));
                    setRefreshKey((value) => value + 1);
                    await refreshInventoryMeta();
                    success(`Received ${formatNumber(result.quantityAdded)} units. ${updatedProduct.name} now has ${formatNumber(result.updatedStock)} units.`);
                    setShowAddModal(false);
                }}
            />

            <CameraScannerModal
                isOpen={showCameraScanner}
                onClose={() => setShowCameraScanner(false)}
                onScan={async (barcode) => {
                    if (barcode) {
                        handleSearchQueryChange(barcode);
                        success(`Scanned: ${barcode}`);
                        const matchedProduct = await lookupAndPreviewProduct(barcode);
                        if (matchedProduct?.sku) {
                            handleSearchQueryChange(matchedProduct.sku);
                        }
                    }
                }}
            />

            <ProductLabelPreviewModal
                isOpen={Boolean(selectedPreviewProduct)}
                onClose={() => setSelectedPreviewProduct(null)}
                product={selectedPreviewProduct}
                title="Inventory Label Preview"
                locationEditAction={null}
                locateAction={selectedPreviewProduct ? {
                    label: 'Locate in 3D',
                    onClick: () => handleLocateIn3D(selectedPreviewProduct),
                } : null}
                editAction={isAdmin ? {
                    label: 'Edit Details',
                    icon: <Edit2 className="h-4 w-4" />,
                    onClick: () => {
                        if (selectedPreviewProduct) {
                            openEditProduct(selectedPreviewProduct);
                        }
                    },
                } : null}
                archiveAction={isAdmin ? {
                    label: 'Archive Product',
                    isLoading: archivingProductId === selectedPreviewProduct?.id,
                    onClick: handleArchiveProduct,
                } : null}
            />

            <EditProductModal
                isOpen={Boolean(editingProduct)}
                product={editingProduct}
                isSaving={savingProductDetails}
                onClose={() => setEditingProduct(null)}
                onSave={handleSaveProductDetails}
            />
        </div>
    );
};

export default InventoryList;

