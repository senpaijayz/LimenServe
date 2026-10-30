import { useEffect, useState } from 'react';
import Modal from '../../../components/ui/Modal';
import Button from '../../../components/ui/Button';
import { getSavedPackagePreview } from '../../../services/managedPackagesApi';
import ManagedPackageCard from '../../public/components/ManagedPackageCard';

export default function SavedPackagePreview({ target, onClose }) {
    const [retry, setRetry] = useState(0);
    const [result, setState] = useState({ key: '', data: null, error: '' });
    const requestKey = JSON.stringify([target.id, target.source, target.revisionId, target.expectedRevision, retry]);
    const state = result.key === requestKey ? result : { loading: true, data: null, error: '' };
    useEffect(() => {
        const controller = new AbortController();
        getSavedPackagePreview(target.id, {
            source: target.source,
            ...(target.source === 'published' ? { revisionId: target.revisionId } : { expectedRevision: target.expectedRevision }),
        }, controller.signal).then((data) => {
            if (data?.definition?.id !== target.id || !Array.isArray(data.variants) || data.source !== target.source
                || (target.source === 'published' ? data.revisionId !== target.revisionId : data.revisionNumber !== target.expectedRevision)) {
                throw new Error('This preview version could not be confirmed. Close it and refresh packages.');
            }
            if (!controller.signal.aborted) setState({ key: requestKey, loading: false, data, error: '' });
        }).catch((error) => {
            if (!controller.signal.aborted) setState({ key: requestKey, loading: false, data: null, error: error.message || 'The saved preview could not load.' });
        });
        return () => controller.abort();
    }, [target, requestKey]);

    const published = target.source === 'published';
    return <Modal isOpen onClose={onClose} title={published ? 'Preview published package' : 'Preview saved draft'} size="lg"
        footer={<Button variant="cancel" onClick={onClose}>Close preview</Button>}>
        <div className="min-w-0 space-y-4" aria-busy={state.loading}>
            <p className="rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
                {published
                    ? 'This is the saved published version. Customers only see options that match their selected vehicle, parts and services. Live-price items can change with catalog prices.'
                    : 'This is the saved draft, not the published offer. Unsaved changes in your recovery copy are not included and will stay untouched.'}
                {' '}View only—nothing is saved, published or added to a quotation here.
            </p>
            {state.loading ? <p role="status" className="text-sm text-primary-800">Loading the saved version…</p>
                : state.error ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                    {state.error}<button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 block min-h-11 font-semibold underline">Try again</button>
                </div> : <>
                    <p className="text-sm font-semibold text-primary-950">{published ? 'Published' : 'Saved draft'} · revision {state.data.revisionNumber}</p>
                    {!published && <p className={`rounded-lg border p-3 text-sm ${state.data.publishable && state.data.publicationStatus !== 'archived' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                        {state.data.publicationStatus === 'archived' ? 'This package is archived. Restore it before editing or publishing.' : state.data.publishable ? 'The saved draft passes the current publication checks. Publishing still requires your separate confirmation.' : state.data.publicationError || 'Review this draft before publishing.'}
                    </p>}
                    <ManagedPackageCard key={`${target.id}:${state.data.revisionId || state.data.revisionNumber}`} definition={state.data.definition} prices={state.data.variants} />
                </>}
        </div>
    </Modal>;
}
