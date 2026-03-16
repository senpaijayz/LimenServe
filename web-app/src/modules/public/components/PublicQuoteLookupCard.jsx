import { useState } from 'react';
import Button from '../../../components/ui/Button';
import { formatCurrency } from '../../../utils/formatters';
import { lookupPublicEstimate } from '../../../services/estimatesApi';

const PublicQuoteLookupCard = () => {
    const [estimateNumber, setEstimateNumber] = useState('');
    const [phone, setPhone] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLookup = async () => {
        setLoading(true);
        setError('');

        try {
            const estimate = await lookupPublicEstimate(estimateNumber, phone);
            setResult(estimate);
        } catch (lookupError) {
            setResult(null);
            setError(lookupError.message || 'Unable to retrieve quotation.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="surface p-6 mb-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                    <p className="text-xs font-bold tracking-[0.3em] text-primary-400 uppercase">Retrieve quotation</p>
                    <h2 className="mt-2 text-2xl font-display font-bold text-primary-950">Look up a saved quote for 30 days</h2>
                    <p className="mt-2 text-sm text-primary-500">Enter the quote number and customer phone number to retrieve an existing quotation without rebuilding it.</p>
                </div>
                <div className="grid w-full gap-3 md:grid-cols-3 lg:max-w-3xl">
                    <input value={estimateNumber} onChange={(e) => setEstimateNumber(e.target.value)} placeholder="Quote number" className="input py-2.5 text-sm" />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Customer phone" className="input py-2.5 text-sm" />
                    <Button variant="secondary" onClick={handleLookup} isLoading={loading}>Retrieve Quote</Button>
                </div>
            </div>
            {error && (
                <div className="mt-4 rounded-xl border border-accent-danger/20 bg-accent-danger/5 p-4 text-sm text-accent-danger">{error}</div>
            )}
            {result && (
                <div className="mt-4 rounded-xl border border-primary-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-xs uppercase tracking-[0.2em] text-primary-400">Quote Found</p>
                            <p className="mt-1 text-lg font-display font-semibold text-primary-950">{result.estimate?.estimate_number}</p>
                            <p className="text-sm text-primary-500">{result.customer?.name || 'Walk-in Customer'} · Valid until {result.estimate?.valid_until || 'N/A'}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.2em] text-primary-400">Grand Total</p>
                            <p className="mt-1 text-lg font-bold text-accent-blue">{formatCurrency(result.estimate?.grand_total || 0)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PublicQuoteLookupCard;
