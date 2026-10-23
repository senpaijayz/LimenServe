import { useEffect, useState } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import Modal from '../../../components/ui/Modal';
import { getUserRecoveryEmail, requestUserRecoveryEmail, verifyUserRecoveryEmailCode } from '../../../services/usersApi';

export default function RecoveryEmailModal({ user, onClose }) {
    const [recovery, setRecovery] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [email, setEmail] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;
        getUserRecoveryEmail(user.id)
            .then((result) => {
                if (active) setRecovery(result);
            })
            .catch((loadError) => {
                if (active) setError(loadError.message || 'Unable to load recovery email details.');
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });
        return () => { active = false; };
    }, [user.id]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (isSaving) return;
        setError('');
        setMessage('');
        setIsSaving(true);
        try {
            const result = await requestUserRecoveryEmail(user.id, {
                email: email.trim().toLowerCase(),
                currentPassword,
            });
            const updated = await getUserRecoveryEmail(user.id);
            setRecovery(updated);
            setEmail('');
            setCurrentPassword('');
            setMessage(result.message || 'Verification link sent.');
        } catch (saveError) {
            setError(saveError.message || 'The verification link could not be sent.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleVerifyCode = async (event) => {
        event.preventDefault();
        if (isSaving) return;
        setError('');
        setMessage('');
        setIsSaving(true);
        try {
            const result = await verifyUserRecoveryEmailCode(user.id, code.trim());
            setRecovery(await getUserRecoveryEmail(user.id));
            setCode('');
            setMessage(result.message || 'Recovery email verified.');
        } catch (verifyError) {
            setError(verifyError.message || 'The code could not be verified.');
        } finally {
            setIsSaving(false);
        }
    };

    const pendingExpired = recovery?.pendingExpiresAt
        ? Date.parse(recovery.pendingExpiresAt) <= Date.now()
        : false;

    return (
        <Modal
            isOpen
            onClose={() => !isSaving && onClose()}
            title="Recovery email"
            size="md"
            closeOnBackdrop={!isSaving}
            closeOnEscape={!isSaving}
        >
            <div className="space-y-5">
                <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm">
                    <p className="font-semibold text-primary-950">{user.fullName || user.email}</p>
                    <p className="mt-1 break-all text-primary-600">Sign-in email: {recovery?.loginEmail || user.email}</p>
                    <p className="mt-2 text-primary-500">The recovery email is separate from the sign-in email.</p>
                </div>

                {isLoading ? <p role="status" className="text-sm text-primary-600">Loading recovery details…</p> : (
                    <>
                        {recovery?.verifiedEmail ? (
                            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                                <p><span className="font-semibold">Verified:</span> <span className="break-all">{recovery.verifiedEmail}</span></p>
                            </div>
                        ) : (
                            <p className="rounded-xl border border-primary-200 p-3 text-sm text-primary-600">No verified recovery email yet.</p>
                        )}
                        {recovery?.pendingEmail && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                {pendingExpired ? 'The verification expired for ' : 'Waiting for verification from '}
                                <span className="break-all font-semibold">{recovery.pendingEmail}</span>.
                                {pendingExpired ? ' Send a new code or link below.' : ' The current verified email stays active until then.'}
                            </p>
                        )}
                        {!recovery?.deliveryReady && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                                Recovery emails cannot be sent yet. Ask the person who manages the server to connect the email sender.
                            </p>
                        )}
                    </>
                )}

                {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}

                {recovery?.deliveryMode === 'supabase_code' && recovery?.pendingEmail && !pendingExpired && (
                    <form onSubmit={handleVerifyCode} className="flex flex-col gap-2 sm:flex-row">
                        <label htmlFor="staff-recovery-code" className="sr-only">Email verification code</label>
                        <input id="staff-recovery-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="Email code" className="min-h-11 min-w-0 flex-1 rounded-xl border border-primary-200 px-3 text-primary-950" />
                        <button type="submit" disabled={isSaving} className="min-h-11 rounded-xl bg-primary-800 px-4 font-semibold text-white disabled:opacity-60">Verify code</button>
                    </form>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="staff-recovery-email" className="mb-2 block text-sm font-semibold text-primary-800">New recovery email</label>
                        <div className="relative">
                            <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" aria-hidden="true" />
                            <input
                                id="staff-recovery-email"
                                type="email"
                                autoComplete="email"
                                maxLength={254}
                                required
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                placeholder="name@example.com"
                                className="min-h-11 w-full rounded-xl border border-primary-200 bg-white py-3 pl-10 pr-3 text-primary-950 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="staff-recovery-admin-password" className="mb-2 block text-sm font-semibold text-primary-800">Your administrator password</label>
                        <input
                            id="staff-recovery-admin-password"
                            type="password"
                            autoComplete="current-password"
                            required
                            value={currentPassword}
                            onChange={(event) => setCurrentPassword(event.target.value)}
                            className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-3 py-3 text-primary-950 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                        />
                        <p className="mt-1 text-xs text-primary-500">Confirm your password before sending the verification {recovery?.deliveryMode === 'supabase_code' ? 'code' : 'link'}.</p>
                    </div>
                    <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
                        <button type="button" onClick={onClose} disabled={isSaving} className="min-h-11 rounded-xl border border-primary-200 px-5 font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60">
                            Close
                        </button>
                        <button type="submit" disabled={isSaving || isLoading || !recovery?.deliveryReady} className="min-h-11 rounded-xl bg-primary-800 px-5 font-semibold text-white hover:bg-primary-950 disabled:cursor-not-allowed disabled:opacity-60">
                            {isSaving ? 'Sending…' : recovery?.deliveryMode === 'supabase_code' ? 'Send verification code' : 'Send verification link'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
}
