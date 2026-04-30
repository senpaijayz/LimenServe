import { Car, Printer, Search, User } from 'lucide-react';
import Button from '../../../components/ui/Button';
import { formatCurrency } from '../../../utils/formatters';

const formatLookupDate = (value) => {
    if (!value) {
        return 'N/A';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleDateString('en-PH', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    });
};

const formatVehicleSummary = (vehicle) => {
    if (!vehicle) {
        return 'No vehicle linked';
    }

    if (typeof vehicle === 'string') {
        return vehicle;
    }

    const parts = [
        vehicle.make,
        vehicle.model,
        vehicle.variant,
        vehicle.year,
        vehicle.plate_number || vehicle.plateNumber,
    ].filter(Boolean);

    return parts.join(' / ') || vehicle.description || vehicle.name || 'No vehicle linked';
};

const getLineName = (item) => item?.product_name || item?.service_name || 'Quotation line';
const getLineMeta = (item) => (item?.line_type === 'service' ? 'Service / Labor' : 'Product');

const PublicQuoteLookupCard = ({
    estimateNumber,
    onEstimateNumberChange,
    onLookup,
    loading,
    error,
    result,
    onPreviewPrint,
}) => {
    const items = result?.items ?? [];
    const customerName = result?.customer?.name || 'Walk-in Customer';
    const vehicleSummary = formatVehicleSummary(result?.vehicle);

    return (
        <div className="surface p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold tracking-[0.3em] text-primary-400 uppercase">Retrieve quotation</p>
                    <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Look up a saved quote for 30 days</h2>
                    <p className="mt-2 text-sm text-primary-500">Enter the quote number to retrieve an existing quotation and open a printable preview without rebuilding it.</p>
                </div>
                <div className="grid w-full gap-3 md:grid-cols-[minmax(0,1fr)_auto] lg:max-w-2xl">
                    <input
                        value={estimateNumber}
                        onChange={(event) => onEstimateNumberChange(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && estimateNumber.trim()) {
                                onLookup();
                            }
                        }}
                        aria-label="Quote number"
                        placeholder="Quote number"
                        className="input py-2.5 text-sm"
                    />
                    <Button
                        variant="secondary"
                        onClick={onLookup}
                        isLoading={loading}
                        isDisabled={!estimateNumber.trim()}
                        leftIcon={<Search className="w-4 h-4" />}
                    >
                        Retrieve Quote
                    </Button>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">
                    {error}
                </div>
            )}

            {result && (
                <div className="mt-6 rounded-[28px] border border-primary-200 bg-white p-5 shadow-sm md:p-6">
                    <div className="flex flex-col gap-4 border-b border-primary-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-primary-400">Quote Found</p>
                            <p className="mt-2 text-2xl font-display font-semibold text-primary-950">
                                {result.estimate?.estimate_number || 'N/A'}
                            </p>
                            <p className="mt-2 text-sm text-primary-500">
                                {customerName} - Valid until {formatLookupDate(result.estimate?.valid_until)}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-accent-blue/20 bg-accent-blue/5 px-4 py-3 text-left sm:min-w-[200px] sm:text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-accent-blue/70">Grand Total</p>
                            <p className="mt-2 text-2xl font-bold text-accent-blue">
                                {formatCurrency(Number(result.estimate?.grand_total ?? 0))}
                            </p>
                            <p className="mt-1 text-xs text-primary-500">
                                Issued {formatLookupDate(result.estimate?.issued_at || result.estimate?.created_at)}
                            </p>
                        </div>
                    </div>

                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-4 md:col-span-1">
                            <div className="flex items-center gap-2 text-primary-500">
                                <User className="h-4 w-4 text-accent-primary" />
                                <span className="text-xs font-bold uppercase tracking-[0.22em]">Customer</span>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-primary-950">{customerName}</p>
                        </div>
                        <div className="rounded-2xl border border-primary-200 bg-primary-50/70 px-4 py-4 md:col-span-2">
                            <div className="flex items-center gap-2 text-primary-500">
                                <Car className="h-4 w-4 text-accent-primary" />
                                <span className="text-xs font-bold uppercase tracking-[0.22em]">Vehicle</span>
                            </div>
                            <p className="mt-3 text-sm font-semibold text-primary-950">{vehicleSummary}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-400">
                                {items.length} line{items.length === 1 ? '' : 's'} in this quotation
                            </p>
                        </div>
                    </div>

                    <div className="mt-6 rounded-2xl border border-primary-200 bg-primary-50/40 p-4">
                        <div className="flex items-center justify-between gap-3 border-b border-primary-200 pb-3">
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-400">Quoted Items</p>
                                <p className="mt-1 text-sm text-primary-500">Retrieved parts and services ready for review or printing.</p>
                            </div>
                            <Button
                                variant="primary"
                                onClick={onPreviewPrint}
                                leftIcon={<Printer className="w-4 h-4" />}
                                isDisabled={!result}
                            >
                                Printable Preview
                            </Button>
                        </div>

                        <div className="mt-4 space-y-3">
                            {items.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-primary-200 bg-white px-4 py-6 text-sm text-primary-500">
                                    This quotation has no line items.
                                </div>
                            ) : (
                                items.map((item) => (
                                    <div key={item.id || `${item.product_id || item.service_id}-${item.line_type}`} className="flex items-start justify-between gap-4 rounded-2xl border border-primary-200 bg-white px-4 py-3">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-primary-950">{getLineName(item)}</p>
                                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-primary-400">{getLineMeta(item)}</p>
                                            <p className="mt-2 text-xs text-primary-500">
                                                Qty {Number(item.quantity ?? 1)} - Unit {formatCurrency(Number(item.unit_price ?? 0))}
                                            </p>
                                        </div>
                                        <p className="shrink-0 text-sm font-bold text-accent-blue">
                                            {formatCurrency(Number(item.line_total ?? 0))}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicQuoteLookupCard;
