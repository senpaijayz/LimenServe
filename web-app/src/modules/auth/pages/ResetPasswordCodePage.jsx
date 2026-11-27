import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { requestAdministratorRecoveryCode, resetAdministratorPasswordWithCode, unlockAdministratorWithRecoveryCode } from '../../../services/authApi';

export default function ResetPasswordCodePage({ resetPassword = false }) {
    const location = useLocation();
    const [email, setEmail] = useState(location.state?.signInEmail || location.state?.email || '');
    const [codeEmail, setCodeEmail] = useState('');
    const [deliveryNotice, setDeliveryNotice] = useState('');
    const [cooldown, setCooldown] = useState(0);
    const [sending, setSending] = useState(false);
    const [code, setCode] = useState('');
    const [password, setPassword] = useState('');
    const [confirmation, setConfirmation] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        if (!cooldown) return undefined;
        const timer = window.setTimeout(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
        return () => window.clearTimeout(timer);
    }, [cooldown]);

    const sendCode = async (event) => {
        event.preventDefault();
        if (sending || busy || cooldown) return;
        const requestedEmail = email.trim().toLowerCase();
        setSending(true);
        setError('');
        try {
            const result = await requestAdministratorRecoveryCode(requestedEmail);
            setCodeEmail(requestedEmail);
            setCode('');
            setDeliveryNotice(result.message);
            setCooldown(60);
        } catch (sendError) {
            setError(sendError.message || 'The recovery code could not be requested.');
            if (sendError.retryAfterSeconds) setCooldown(sendError.retryAfterSeconds);
        } finally {
            setSending(false);
        }
    };

    const submit = async (event) => {
        event.preventDefault();
        if (busy || sending || !codeEmail) return;
        setError('');
        if (!/^\d{6,8}$/.test(code.trim())) {
            setError('Enter the numeric code from your email.');
            return;
        }
        if (resetPassword && password !== confirmation) {
            setError('The new passwords do not match.');
            return;
        }
        setBusy(true);
        try {
            const details = { email: codeEmail, code: code.trim() };
            const result = resetPassword
                ? await resetAdministratorPasswordWithCode({ ...details, password })
                : await unlockAdministratorWithRecoveryCode(details);
            setSuccess(result.message || (resetPassword ? 'Password changed. Use your new password to sign in.' : 'Sign-in unlocked. Use your usual email and password.'));
            setCode('');
            setPassword('');
            setConfirmation('');
        } catch (resetError) {
            setError(resetError.message || 'The code could not be verified. Request a new one.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-primary-50/50 p-4">
            <section className="w-full max-w-md rounded-2xl border border-primary-200 bg-white p-6 shadow-xl sm:p-8">
                <Link to="/login" className="text-sm font-semibold text-primary-700 hover:underline">← Back to sign in</Link>
                <h1 className="mt-6 font-display text-2xl font-bold text-primary-950">{resetPassword ? 'Reset administrator password' : 'Recover administrator access'}</h1>
                <p className="mt-2 text-sm text-primary-600">{resetPassword ? 'Request a code for your verified recovery inbox, then enter it with your new password. Cashiers and clerks should contact an administrator for password resets.' : 'Request a code for your verified recovery inbox. Enter the code to unlock sign-in, then use your existing email and password.'}</p>
                {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {!success && (
                    <form onSubmit={sendCode} className="mt-6 space-y-3">
                        <label htmlFor="code-email" className="block text-sm font-semibold text-primary-800">Administrator sign-in or verified recovery email</label>
                        <input id="code-email" type="email" autoComplete="email" required maxLength={254}
                            disabled={sending || busy} value={email} onChange={(event) => {
                                setEmail(event.target.value);
                                setCodeEmail('');
                                setCode('');
                                setPassword('');
                                setConfirmation('');
                                setDeliveryNotice('');
                                setError('');
                            }} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        <button type="submit" disabled={sending || busy || cooldown > 0} className="min-h-11 w-full rounded-xl bg-primary-800 px-4 font-semibold text-white hover:bg-primary-950 disabled:opacity-60">
                            {sending ? 'Requesting code…' : cooldown > 0 ? `Send again in ${cooldown < 60 ? `${cooldown}s` : `${Math.ceil(cooldown / 60)} min`}` : codeEmail ? 'Resend recovery code' : 'Send recovery code'}
                        </button>
                    </form>
                )}
                {!success && deliveryNotice && <p role="status" className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">{deliveryNotice}</p>}
                {success ? (
                    <div role="status" className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                        <p>{success}</p>
                        <Link to="/login" className="mt-3 inline-block font-semibold underline">Go to sign in</Link>
                    </div>
                ) : codeEmail && (
                    <form onSubmit={submit} className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="recovery-code" className="mb-2 block text-sm font-semibold text-primary-800">Email code</label>
                            <input id="recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" required maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} className="min-h-11 w-full rounded-xl border border-primary-200 px-3 text-primary-950" />
                        </div>
                        {resetPassword && <>
                            <p className="text-sm text-primary-600">Use at least 12 characters, with uppercase and lowercase letters, a number, and a symbol.</p>
                            <label className="block text-sm font-semibold text-primary-800">New password
                                <input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 px-3" />
                            </label>
                            <label className="block text-sm font-semibold text-primary-800">Confirm new password
                                <input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-primary-200 px-3" />
                            </label>
                        </>}
                        <button type="submit" disabled={busy || sending} className="min-h-11 w-full rounded-xl bg-primary-800 px-4 font-semibold text-white hover:bg-primary-950 disabled:opacity-60">{busy ? 'Verifying…' : resetPassword ? 'Verify code and change password' : 'Verify code and unlock sign-in'}</button>
                    </form>
                )}
                {!success && resetPassword && <Link to="/administrator-recovery" state={{ signInEmail: email }} className="mt-5 block text-center text-sm font-semibold text-primary-800 hover:underline">Only locked out? Unlock without changing the password</Link>}
            </section>
        </main>
    );
}
