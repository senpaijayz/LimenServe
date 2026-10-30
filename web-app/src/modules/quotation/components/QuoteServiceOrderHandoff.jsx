import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Wrench } from 'lucide-react';
import Button from '../../../components/ui/Button';
import ConfirmDialog from '../../../components/ui/ConfirmDialog';
import { useToast } from '../../../components/ui/Toast';
import { convertEstimateToServiceOrder, getEstimateServiceOrder } from '../../../services/estimatesApi';

// Key this workspace by the saved quotation ID. Never reuse another quote's result.
export default function QuoteServiceOrderHandoff({ estimateId, estimateNumber, status, dirty, saving, onBusyChange }) {
    const navigate = useNavigate();
    const { success, info } = useToast();
    const [order, setOrder] = useState(null);
    const [checking, setChecking] = useState(true);
    const [problem, setProblem] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [confirming, setConfirming] = useState(false);
    const [working, setWorking] = useState(false);
    const busy = useRef(false);
    const alive = useRef(true);
    const reads = useRef(0);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; onBusyChange(false); };
    }, [onBusyChange]);

    useEffect(() => {
        const controller = new AbortController();
        const request = ++reads.current;
        setChecking(true);
        setProblem('');
        getEstimateServiceOrder(estimateId, { signal: controller.signal }).then((linked) => {
            if (!controller.signal.aborted && request === reads.current) setOrder(linked);
        }).catch(() => {
            if (!controller.signal.aborted && request === reads.current) {
                setProblem('We couldn’t check for an existing service order. Check again before creating one.');
            }
        }).finally(() => {
            if (!controller.signal.aborted && request === reads.current) setChecking(false);
        });
        return () => controller.abort();
    }, [estimateId, refresh]);

    const openOrder = (id) => {
        if (!alive.current || dirty || saving) return;
        setConfirming(false);
        navigate(`/services/${encodeURIComponent(id)}`);
    };

    const convert = async () => {
        if (busy.current || dirty || saving || status !== 'approved') return;
        if (!onBusyChange(true)) return;
        busy.current = true;
        reads.current += 1;
        setWorking(true);
        setProblem('');
        try {
            // Another administrator may have converted it since this screen loaded.
            const linked = await getEstimateServiceOrder(estimateId);
            if (!alive.current) return;
            if (linked?.id) {
                setOrder(linked);
                info('This quotation already has a service order. Opening it now.');
                openOrder(linked.id);
                return;
            }
            try {
                // The existing atomic RPC returns the same order on an identical retry.
                const id = await convertEstimateToServiceOrder(estimateId);
                if (!alive.current) return;
                success('Service order ready. Review its parts and labor before billing.');
                openOrder(id);
            } catch (conversionError) {
                if (!alive.current) return;
                let recovered;
                try { recovered = await getEstimateServiceOrder(estimateId); } catch { /* Outcome remains unknown. */ }
                if (!alive.current) return;
                if (recovered?.id) {
                    setOrder(recovered);
                    success('Your service order was saved. Opening it now.');
                    openOrder(recovered.id);
                    return;
                }
                setConfirming(false);
                setProblem(`${conversionError.message || 'We couldn’t confirm the service order.'} Check its status before trying again.`);
            }
        } catch {
            if (alive.current) {
                setConfirming(false);
                setProblem('We couldn’t check the service order status. No create request was sent. Check again when your connection is ready.');
            }
        } finally {
            busy.current = false;
            onBusyChange(false);
            if (alive.current) setWorking(false);
        }
    };

    return (
        <section className="mt-4 rounded-xl border border-primary-200 bg-white p-4" aria-label="Service order" aria-busy={checking || working}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-primary-950"><Wrench className="h-4 w-4" aria-hidden="true" />Service order</h4>
                    <p className="mt-1 text-sm text-primary-700" role="status">
                        {checking ? 'Checking for an existing order…' : order?.id
                            ? `${order.order_number || 'Linked order'} · ${String(order.status || '').replace(/_/g, ' ')}`
                            : status === 'converted_service' ? 'This quotation was converted. Check again to find its service order.'
                                : 'Create a repair job from this saved, approved quotation. Creating the job does not deduct stock.'}
                    </p>
                </div>
                {order?.id ? (
                    <Button variant="primary" onClick={() => openOrder(order.id)} disabled={dirty || saving || working}>Open service order</Button>
                ) : (
                    <Button variant="primary" onClick={() => setConfirming(true)} disabled={checking || Boolean(problem) || dirty || saving || working || status !== 'approved'}>Create service order</Button>
                )}
            </div>
            {dirty && <p className="mt-2 text-sm font-medium text-primary-800">Save your changes before continuing to the service order.</p>}
            {problem && <p className="mt-2 text-sm font-medium text-accent-danger" role="alert">{problem}</p>}
            <button type="button" className="mt-3 min-h-10 rounded-lg border border-primary-300 px-3 text-sm font-semibold text-primary-800 hover:bg-primary-50 disabled:opacity-50" disabled={checking || working} onClick={() => setRefresh((value) => value + 1)}>Check status again</button>
            <ConfirmDialog isOpen={confirming} title="Create service order?"
                message={`Use saved quotation ${estimateNumber || ''} to create a service order? Its estimated parts and labor will be copied. No stock or payment is posted by this step.`}
                confirmLabel="Create service order" confirmVariant="primary" isLoading={working}
                onConfirm={convert} onClose={() => { if (!busy.current) setConfirming(false); }} />
        </section>
    );
}
