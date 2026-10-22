import { useState } from 'react';
import { ArrowLeft, CheckCircle2, MailCheck, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router';
import { verifyRecoveryEmail } from '../../../services/authApi';

function readVerificationToken() {
    if (typeof window === 'undefined' || !window.location.hash) return '';
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    if (token) {
        window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
    }
    return /^[a-f0-9]{64}$/i.test(token) ? token : '';
}

export default function RecoveryEmailVerificationPage() {
    const [token] = useState(readVerificationToken);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isVerified, setIsVerified] = useState(false);
    const [error, setError] = useState('');

    const handleVerify = async () => {
        if (!token || isSubmitting || isVerified) return;
        setIsSubmitting(true);
        setError('');
        try {
            await verifyRecoveryEmail(token);
            setIsVerified(true);
        } catch (verificationError) {
            setError(verificationError.message || 'This link is invalid or has expired. Request a new verification email from Account Security.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="relative flex min-h-screen items-center justify-center bg-primary-50/60 p-4">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div className="absolute -right-40 -top-40 h-80 w-80 rounded-full bg-accent-primary/15 blur-[100px]" />
                <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent-secondary/15 blur-[100px]" />
            </div>
            <section className="relative w-full max-w-md rounded-2xl border border-primary-200 bg-white/95 p-6 shadow-xl sm:p-8">
                {isVerified ? (
                    <div className="text-center">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <h1 className="font-display text-2xl font-bold text-primary-950">Recovery email verified</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">Your new recovery address is ready to use if you need to reset your password.</p>
                        <Link to="/settings/security" className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Return to Account Security
                        </Link>
                    </div>
                ) : (
                    <>
                        <Link to="/login" className="mb-7 inline-flex items-center gap-2 rounded text-sm font-semibold text-primary-600 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to sign in
                        </Link>
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
                            <MailCheck className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <h1 className="font-display text-2xl font-bold text-primary-950">Verify your recovery email</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">Confirm that you can open the recovery mailbox. Your login email will stay the same.</p>

                        {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">{error}</p>}
                        {!token && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-5 text-red-700">This verification link is missing or invalid. Sign in and request a new one from Account Security.</p>}

                        <button
                            type="button"
                            onClick={handleVerify}
                            disabled={!token || isSubmitting}
                            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white transition hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <MailCheck className="h-4 w-4" aria-hidden="true" />
                            {isSubmitting ? 'Verifying email…' : 'Confirm recovery email'}
                        </button>
                        <Link to="/forgot-password" className="mt-4 inline-flex w-full justify-center text-sm font-semibold text-primary-600 hover:text-primary-950">Need help signing in?</Link>
                    </>
                )}
            </section>
        </main>
    );
}
