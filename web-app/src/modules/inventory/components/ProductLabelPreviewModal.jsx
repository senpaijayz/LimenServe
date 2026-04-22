import { useMemo, useRef } from 'react';
import { Printer, Package2, MapPin, ScanLine } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import MitsubishiGenuinePartsLabel from './MitsubishiGenuinePartsLabel';
import { printProductLabelNode } from '../utils/printProductLabel';

function formatLocation(location = {}) {
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

const InfoPill = ({ icon: Icon, label, value }) => (
    <div
        style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '14px',
            background: '#ffffff',
            border: '1px solid rgba(15, 23, 42, 0.1)',
        }}
    >
        <div
            style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(217, 34, 42, 0.12)',
                color: '#d9222a',
                flexShrink: 0,
            }}
        >
            <Icon className="h-4 w-4" />
        </div>
        <div>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: '4px', fontSize: '14px', lineHeight: 1.45, color: '#0f172a', fontWeight: 600 }}>{value}</div>
        </div>
    </div>
);

const ProductLabelPreviewModal = ({
    isOpen,
    onClose,
    product,
    title = 'Label Preview',
    locationLabel = '',
    routeDetails = null,
    quantity = 1,
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
                            <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.26em] text-primary-500">Operational Category</div>
                                <div className="mt-2 text-2xl font-black tracking-tight text-primary-950">{product.category || 'General Parts & Accessories'}</div>
                                {product.sourceCategory && product.sourceCategory !== product.category && (
                                    <div className="mt-2 text-sm text-primary-600">
                                        Source category: <span className="font-semibold text-primary-950">{product.sourceCategory}</span>
                                    </div>
                                )}
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <InfoPill icon={Package2} label="Part" value={product.name} />
                                <InfoPill icon={ScanLine} label="Part Number" value={product.sku} />
                                <InfoPill icon={MapPin} label="Location" value={effectiveLocationLabel || 'Unassigned'} />
                                <InfoPill
                                    icon={Package2}
                                    label="Classification"
                                    value={product.classification?.ruleKey || 'Runtime normalization'}
                                />
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
