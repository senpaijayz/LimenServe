import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { resetPasswordWithRecoveryCode } from '../../../services/authApi';

export default function ResetPasswordCodePage() {
    const location = useLocation();
    const [email, setEmail] = useState(location.state?.email || '');
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const submit = async (event) => {
        event.preventDefault();
        if (busy) return;
        setError('');
        if (!/^\d{6,8}$/.test(code.trim())) {
            setError('Enter the numeric code from your email.');
            return;
        }
        if (password !== confirmation) {
            setError('The passwords do not match.');
            return;
        }
        if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
            setError('Use at least 12 characters with uppercase and lowercase letters, a number, and a symbol.');
            return;
        }
        setBusy(true);
        try {
            const result = await resetPasswordWithRecoveryCode({ email: email.trim().toLowerCase(), code: code.trim(), password });
            setSuccess(result.message || 'Password changed. Sign in with your existing login email.');
            setPassword('');
            setConfirmation('');
            setCode('');
        } catch (resetError) {
            setError(resetError.message || 'The code could not be verified. Request a new one.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-primary-50/50 p-4">
            <section className="w-full max-w-md rounded-2xl border border-primary-200 bg-white p-6 shadow-xl sm:p-8">
                <Link to="/forgot-password" className="text-sm font-semibold text-primary-700 hover:underline">← Back</Link>
                <h1 className="mt-6 font-display text-2xl font-bold text-primary-950">Reset with an email code</h1>
                <p className="mt-2 text-sm text-primary-600">Enter the code sent to your verified recovery Gmail. Your sign-in address stays the same.</p>
                {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {success ? (
                    <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <p>{success}</p>
                        <Link to="/login" className="mt-3 inline-block font-semibold underline">Go to sign in</Link>
                    </div>
                ) : (
                    <form onSubmit={submit} className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="code-email" className="mb-2 block text-sm font-semibold text-primary-800">Sign-in email or recovery Gmail</label>
                            <input id="code-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        </div>
                        <div>
                            <label htmlFor="recovery-code" className="mb-2 block text-sm font-semibold text-primary-800">Email code</label>
                            <input id="recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        </div>
                        <div>
                            <label htmlFor="new-password" className="mb-2 block text-sm font-semibold text-primary-800">New password</label>
                            <input id="new-password" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        </div>
                        <div>
                            <label htmlFor="confirm-password" className="mb-2 block text-sm font-semibold text-primary-800">Confirm new password</label>
                            <input id="confirm-password" type="password" autoComplete="new-password" required minLength={12} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        </div>
                        <button type="submit" disabled={busy} className="min-h-11 w-full rounded-xl bg-primary-800 px-4 font-semibold text-white hover:bg-primary-950 disabled:opacity-60">{busy ? 'Verifying…' : 'Change password'}</button>
                    </form>
                )}
            </section>
        </main>
    );
}
