import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { requestPasswordRecovery } from '../../../services/authApi';

const RESEND_COOLDOWN_SECONDS = 60;

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [requestSent, setRequestSent] = useState(false);
    const [formError, setFormError] = useState('');

    useEffect(() => {
        if (cooldown <= 0) return undefined;

        const timer = window.setInterval(() => {
            setCooldown((remaining) => Math.max(remaining - 1, 0));
        }, 1000);

        return () => window.clearInterval(timer);
    }, [cooldown]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isSubmitting || cooldown > 0) return;

        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail) {
            setFormError('Enter the email address you use to sign in.');
            return;
        }

        setIsSubmitting(true);
        setFormError('');

        try {
            await requestPasswordRecovery(normalizedEmail);
            setRequestSent(true);
            setCooldown(RESEND_COOLDOWN_SECONDS);
        } catch (error) {
            setFormError(error.message || 'We could not start recovery right now. Please try again shortly.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-4 relative bg-primary-50/50">
            <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
                <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-accent-primary/15 blur-[100px]" />
                <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-accent-secondary/15 blur-[100px]" />
            </div>

            <section className="relative w-full max-w-md rounded-2xl border border-primary-200 bg-white/95 p-6 shadow-xl sm:p-8">
                <Link to="/login" className="mb-7 inline-flex items-center gap-2 rounded text-sm font-semibold text-primary-600 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                    Back to sign in
                </Link>

                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
                    <KeyRound className="h-6 w-6" aria-hidden="true" />
                </div>
                <h1 className="font-display text-2xl font-bold text-primary-950">Forgot your password?</h1>
                <p className="mt-2 text-sm leading-6 text-primary-600">
                    Enter your sign-in email or verified recovery Gmail, and we’ll help you get back into LimenServe.
                </p>

                {requestSent && (
                    <div role="status" className="mt-5 rounded-xl border border-accent-success/30 bg-accent-success/10 p-4 text-sm text-primary-800">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-success" aria-hidden="true" />
                            <p>If a recovery method is available, check your inbox and spam folder for a link or code. The administrator can enter the emailed code below.</p>
                        </div>
                    </div>
                )}

                {formError && (
                    <p role="alert" className="mt-5 rounded-xl border border-accent-danger/30 bg-accent-danger/10 p-3 text-sm text-accent-danger">
                        {formError}
                    </p>
                )}

                <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                    <div>
                        <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-primary-800">Email address</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" aria-hidden="true" />
                            <input
                                id="recovery-email"
                                type="email"
                                autoComplete="email"
                                required
                                maxLength={254}
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="Sign-in email or recovery Gmail"
                                className="w-full rounded-xl border border-primary-200 bg-white py-3 pl-10 pr-4 text-primary-950 placeholder:text-primary-400 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || cooldown > 0}
                        className="flex w-full items-center justify-center rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white transition hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {isSubmitting ? 'Checking recovery options…' : cooldown > 0 ? `Try again in ${cooldown}s` : requestSent ? 'Send again' : 'Continue'}
                    </button>
                </form>
                <Link to="/reset-password-code" state={{ email: email.trim().toLowerCase() }} className="mt-5 block text-center text-sm font-semibold text-primary-800 hover:underline">
                    Have a code? Reset your password
                </Link>
            </section>
        </main>
    );
};

export default ForgotPasswordPage;
