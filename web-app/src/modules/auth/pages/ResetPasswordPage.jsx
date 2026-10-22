import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole } from 'lucide-react';
import { Link } from 'react-router';
import { useAuth } from '../../../context/useAuth';
import { supabase } from '../../../services/supabase';

const PASSWORD_RULES = [
    { label: 'At least 12 characters', test: (value) => value.length >= 12 },
    { label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
    { label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
    { label: 'A number', test: (value) => /\d/.test(value) },
    { label: 'A symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const PasswordField = ({ id, label, value, onChange, visible, onToggle, autoComplete }) => (
    <div>
        <label htmlFor={id} className="mb-2 block text-sm font-semibold text-primary-800">{label}</label>
        <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" aria-hidden="true" />
            <input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete={autoComplete}
                required
                value={value}
                onChange={onChange}
                className="w-full rounded-xl border border-primary-200 bg-white py-3 pl-10 pr-12 text-primary-950 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
            />
            <button
                type="button"
                onClick={onToggle}
                aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                aria-pressed={visible}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            >
                {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
        </div>
    </div>
);

const ResetPasswordPage = () => {
    const { isLoadingAuth, isPasswordRecovery, finishPasswordRecovery } = useAuth();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isComplete, setIsComplete] = useState(false);
    const [formError, setFormError] = useState('');

    const rules = useMemo(() => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(password) })), [password]);
    const passwordIsStrong = rules.every((rule) => rule.passed);

    useEffect(() => {
        if (!isPasswordRecovery) {
            setPassword('');
            setConfirmPassword('');
        }
    }, [isPasswordRecovery]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isSubmitting || !isPasswordRecovery) return;
        setFormError('');

        if (!passwordIsStrong) {
            setFormError('Choose a stronger password using all the requirements below.');
            return;
        }

        if (password !== confirmPassword) {
            setFormError('The passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) {
                setFormError(error.message || 'We couldn’t update your password. Request a new reset link and try again.');
                return;
            }

            setIsComplete(true);
            await finishPasswordRecovery();
        } catch {
            setFormError('We couldn’t update your password. Request a new reset link and try again.');
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
                {isLoadingAuth ? (
                    <div role="status" className="py-10 text-center text-sm font-medium text-primary-600">Checking your secure reset link…</div>
                ) : isComplete ? (
                    <div className="text-center">
                        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-success/10 text-accent-success">
                            <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
                        </div>
                        <h1 className="font-display text-2xl font-bold text-primary-950">Password updated</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">Your password has been changed. Sign in with your new password to continue.</p>
                        <Link to="/login" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            Return to sign in
                        </Link>
                    </div>
                ) : !isPasswordRecovery ? (
                    <div>
                        <Link to="/login" className="mb-7 inline-flex items-center gap-2 rounded text-sm font-semibold text-primary-600 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to sign in
                        </Link>
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-danger/10 text-accent-danger">
                            <KeyRound className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <h1 className="font-display text-2xl font-bold text-primary-950">Reset link expired</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">This link is invalid or has expired. Request a new one and open the latest email on this device.</p>
                        <Link to="/forgot-password" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            Request another link
                        </Link>
                    </div>
                ) : (
                    <>
                        <Link to="/login" className="mb-7 inline-flex items-center gap-2 rounded text-sm font-semibold text-primary-600 hover:text-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2">
                            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                            Back to sign in
                        </Link>
                        <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-100 text-primary-800">
                            <KeyRound className="h-6 w-6" aria-hidden="true" />
                        </div>
                        <h1 className="font-display text-2xl font-bold text-primary-950">Choose a new password</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">Use a password you haven’t used for this account before.</p>

                        {formError && <p role="alert" className="mt-5 rounded-xl border border-accent-danger/30 bg-accent-danger/10 p-3 text-sm text-accent-danger">{formError}</p>}

                        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
                            <PasswordField
                                id="new-password"
                                label="New password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                visible={showPassword}
                                onToggle={() => setShowPassword((visible) => !visible)}
                                autoComplete="new-password"
                            />

                            <ul aria-label="Password requirements" className="grid gap-1.5 text-xs sm:grid-cols-2">
                                {rules.map((rule) => (
                                    <li key={rule.label} className={rule.passed ? 'text-accent-success' : 'text-primary-500'}>
                                        <span aria-hidden="true" className="mr-1">{rule.passed ? '✓' : '•'}</span>{rule.label}
                                    </li>
                                ))}
                            </ul>

                            <PasswordField
                                id="confirm-password"
                                label="Confirm new password"
                                value={confirmPassword}
                                onChange={(event) => setConfirmPassword(event.target.value)}
                                visible={showConfirmPassword}
                                onToggle={() => setShowConfirmPassword((visible) => !visible)}
                                autoComplete="new-password"
                            />
                            {confirmPassword && password !== confirmPassword && <p className="-mt-3 text-sm text-accent-danger">The passwords do not match.</p>}

                            <button
                                type="submit"
                                disabled={isSubmitting || !passwordIsStrong || password !== confirmPassword}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-800 px-4 py-3 font-semibold text-white transition hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <KeyRound className="h-4 w-4" aria-hidden="true" />
                                {isSubmitting ? 'Updating password…' : 'Update password'}
                            </button>
                        </form>
                    </>
                )}
            </section>
        </main>
    );
};

export default ResetPasswordPage;
