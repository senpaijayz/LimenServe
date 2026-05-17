import { useMemo, useRef } from 'react';
import { Printer, ArrowDownCircle, ArrowUpCircle, Crosshair, PencilLine } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import MitsubishiGenuinePartsLabel from './MitsubishiGenuinePartsLabel';
import { printProductLabelNode } from '../utils/printProductLabel';
import { formatDateTime, formatNumber } from '../../../utils/formatters';

function formatLocation(location = {}) {
    if (location?.label) {
        return location.label;
    }

    const stockroomParts = [
        location?.aisle ? `Aisle ${String(location.aisle).replace(/^aisle\s+/i, '').toUpperCase()}` : null,
        (location?.shelfNumber ?? location?.shelf_number ?? null) ? `Shelf ${location.shelfNumber ?? location.shelf_number}` : null,
        location?.level ? `Level ${location.level}` : null,
        location?.bin ? `Bin ${location.bin}` : null,
    ].filter(Boolean);

    if (stockroomParts.length > 0) {
        return stockroomParts.join(' • ');
    }

    const segments = [
        location?.floor ? `Floor ${location.floor}` : null,
        location?.section ? `Section ${location.section}` : null,
        location?.shelf ? `Shelf ${location.shelf}` : null,
        location?.aisle ? `Aisle ${location.aisle}` : null,
        location?.zone ? `Zone ${location.zone}` : null,
        location?.slot ? `Slot ${location.slot}` : null,
    ].filter(Boolean);

    return segments.length > 0 ? segments.join(' / ') : 'Unassigned';
}

function formatRouteLocation(details) {
    if (!details?.location) {
        return '';
    }

    const parts = [
        details.location.floor?.name || details.location.floor?.code,
        details.location.zone?.code,
        details.location.aisle?.code,
        details.location.shelf?.code,
        details.location.slot?.slotLabel || details.location.slot?.number,
    ].filter(Boolean);

    return parts.join(' / ');
}

const MOVEMENT_LABELS = {
    stock_in: 'Stock added',
    stock_out: 'Stock removed',
    sale: 'Sold',
    service_usage: 'Used in service',
    adjustment: 'Stock adjusted',
    reservation: 'Reserved',
    release: 'Released',
};

function isStockIncrease(entry = {}) {
    if (['sale', 'stock_out', 'service_usage', 'reservation'].includes(entry.movementType)) {
        return false;
    }
    return entry.movementType === 'stock_in' || Number(entry.quantity ?? 0) > 0;
}

const ProductLabelPreviewModal = ({
    isOpen,
    onClose,
    product,
    title = 'Label Preview',
    locationLabel = '',
    routeDetails = null,
    quantity = 1,
    editAction = null,
    locationEditAction = null,
    locateAction = null,
    stockHistory = [],
    historyLoading = false,
}) => {
    const labelRef = useRef(null);

    const effectiveLocationLabel = useMemo(() => (
        locationLabel
        || formatRouteLocation(routeDetails)
        || formatLocation(product?.location)
    ), [locationLabel, product?.location, routeDetails]);

    if (!product) {
        return null;
    }

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="xl"
            className="border border-primary-200 bg-[#f7f6f2] text-primary-950"
        >
            <div className="space-y-5">
                <div
                    className="rounded-[28px] border border-primary-200"
                    style={{
                        background: 'radial-gradient(circle at top left, rgba(217, 34, 42, 0.08), transparent 26%), linear-gradient(180deg, #fbfaf7 0%, #f2efe7 100%)',
                        padding: '24px',
                    }}
                >
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
                        <div
                            className="flex items-center justify-center rounded-[24px] border p-6"
                            style={{
                                borderColor: 'rgba(15, 23, 42, 0.1)',
                                background: '#ffffff',
                                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.65)',
                            }}
                        >
                            <div
                                style={{
                                    transform: 'scale(1.08)',
                                    transformOrigin: 'center center',
                                }}
                            >
                                <MitsubishiGenuinePartsLabel
                                    ref={labelRef}
                                    product={product}
                                    quantity={quantity}
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="rounded-2xl border border-primary-200 bg-white/85 p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                        <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary-500">Stock Activity</div>
                                        <p className="mt-1 text-2xl font-black text-primary-950">{formatNumber(product.quantity ?? product.stock ?? 0)}</p>
                                        <p className="text-xs font-semibold text-primary-500">Current available balance</p>
                                    </div>
                                    <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/10 px-4 py-3 text-sm font-black text-accent-blue">
                                        {effectiveLocationLabel || 'Unassigned'}
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-primary-200 bg-white/85 p-4">
                                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary-500">Stock Added and Sold</div>
                                {historyLoading ? (
                                    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">Loading movement history...</div>
                                ) : stockHistory.length === 0 ? (
                                    <div className="mt-3 rounded-xl border border-primary-200 bg-primary-50 px-4 py-6 text-center text-sm text-primary-500">No stock or sales movement has been recorded yet.</div>
                                ) : (
                                    <div className="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                                        {stockHistory.map((entry) => {
                                            const increased = isStockIncrease(entry);
                                            const Icon = increased ? ArrowUpCircle : ArrowDownCircle;
                                            return (
                                                <div key={entry.id} className="flex gap-3 rounded-xl border border-primary-200 bg-white px-3 py-3">
                                                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${increased ? 'text-emerald-600' : 'text-red-600'}`} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                            <div>
                                                                <p className="font-bold text-primary-950">{MOVEMENT_LABELS[entry.movementType] || entry.movementType || 'Inventory movement'}</p>
                                                                <p className="text-xs text-primary-500">{entry.notes || entry.referenceType || 'No action details'}</p>
                                                            </div>
                                                            <div className="text-left sm:text-right">
                                                                <p className={`font-black ${increased ? 'text-emerald-700' : 'text-red-700'}`}>
                                                                    {increased ? '+' : '-'}{formatNumber(Math.abs(Number(entry.quantity ?? 0)))}
                                                                </p>
                                                                <p className="text-xs text-primary-500">{formatDateTime(entry.createdAt)}</p>
                                                            </div>
                                                        </div>
                                                        <p className="mt-1 text-xs text-primary-500">By {entry.performedBy || 'System'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {Array.isArray(routeDetails?.steps) && routeDetails.steps.length > 0 && (
                                <div className="rounded-2xl border border-primary-200 bg-white/80 p-4">
                                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-primary-500">Route Guidance</div>
                                    <div className="mt-3 space-y-2">
                                        {routeDetails.steps.map((step, index) => (
                                            <div key={`${step}-${index}`} className="flex items-start gap-3 text-sm text-primary-900">
                                                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#d81724] text-[11px] font-black text-white">
                                                    {index + 1}
                                                </span>
                                                <span>{step}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    {locateAction && (
                        <Button
                            variant="primary"
                            fullWidth
                            leftIcon={<Crosshair className="h-4 w-4" />}
                            onClick={locateAction.onClick}
                        >
                            {locateAction.label || 'Locate in 3D Stockroom'}
                        </Button>
                    )}
                    {locationEditAction && (
                        <Button
                            variant="outline"
                            fullWidth
                            leftIcon={<PencilLine className="h-4 w-4" />}
                            onClick={locationEditAction.onClick}
                        >
                            {locationEditAction.label || 'Edit Location'}
                        </Button>
                    )}
                    {editAction && (
                        <Button
                            variant="outline"
                            fullWidth
                            leftIcon={editAction.icon}
                            onClick={editAction.onClick}
                        >
                            {editAction.label || 'Edit Details'}
                        </Button>
                    )}
                    <Button variant="secondary" fullWidth onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        variant="primary"
                        fullWidth
                        leftIcon={<Printer className="h-4 w-4" />}
                        onClick={() => printProductLabelNode(labelRef.current, `${product.sku} label`)}
                    >
                        Print Label
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default ProductLabelPreviewModal;
