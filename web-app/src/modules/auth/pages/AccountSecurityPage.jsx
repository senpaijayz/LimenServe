import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../../context/useAuth';
import { beginRecoveryEmailVerification, getAccountSecurity } from '../../../services/authApi';
import { supabase } from '../../../services/supabase';

const PASSWORD_RULES = [
    { label: '12 characters or more', test: (value) => value.length >= 12 },
    { label: 'An uppercase letter', test: (value) => /[A-Z]/.test(value) },
    { label: 'A lowercase letter', test: (value) => /[a-z]/.test(value) },
    { label: 'A number', test: (value) => /\d/.test(value) },
    { label: 'A symbol', test: (value) => /[^A-Za-z0-9]/.test(value) },
];

function formatDate(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function PasswordField({ id, label, value, onChange, show, onToggle, autoComplete = 'current-password' }) {
    return (
        <div>
            <label htmlFor={id} className="mb-2 block text-sm font-semibold text-primary-800">{label}</label>
            <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" aria-hidden="true" />
                <input
                    id={id}
                    type={show ? 'text' : 'password'}
                    autoComplete={autoComplete}
                    value={value}
                    onChange={onChange}
                    required
                    className="min-h-11 w-full rounded-xl border border-primary-200 bg-white py-3 pl-10 pr-12 text-primary-950 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                />
                <button
                    type="button"
                    onClick={onToggle}
                    aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                    aria-pressed={show}
                    className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-primary-500 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                >
                    {show ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
            </div>
        </div>
    );
}

function SecurityNotice({ notice }) {
    if (!notice) return null;
    const success = notice.type === 'success';
    return (
        <p role={success ? 'status' : 'alert'} className={`rounded-xl border p-3 text-sm leading-5 ${success ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}>
            {notice.message}
        </p>
    );
}

export default function AccountSecurityPage() {
    const { user } = useAuth();
    const [security, setSecurity] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmittingRecovery, setIsSubmittingRecovery] = useState(false);
    const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [recoveryCurrentPassword, setRecoveryCurrentPassword] = useState('');
    const [passwordCurrent, setPasswordCurrent] = useState('');
    const [passwordNew, setPasswordNew] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [showRecoveryCurrent, setShowRecoveryCurrent] = useState(false);
    const [showPasswordCurrent, setShowPasswordCurrent] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [recoveryNotice, setRecoveryNotice] = useState(null);
    const [passwordNotice, setPasswordNotice] = useState(null);
    const [pageError, setPageError] = useState('');

    const loadSecurity = useCallback(async () => {
        setIsLoading(true);
        setPageError('');
        try {
            const data = await getAccountSecurity();
            setSecurity(data);
        } catch (error) {
            setPageError(error.message || 'We could not load account security details.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadSecurity();
    }, [loadSecurity]);

    const passwordRules = useMemo(
        () => PASSWORD_RULES.map((rule) => ({ ...rule, passed: rule.test(passwordNew) })),
        [passwordNew],
    );
    const passwordIsStrong = passwordRules.every((rule) => rule.passed);

    const handleRecoverySubmit = async (event) => {
        event.preventDefault();
        if (isSubmittingRecovery) return;
        setRecoveryNotice(null);
        setIsSubmittingRecovery(true);
        try {
            const result = await beginRecoveryEmailVerification({
                email: recoveryEmail.trim().toLowerCase(),
                currentPassword: recoveryCurrentPassword,
            });
            setRecoveryEmail('');
            setRecoveryCurrentPassword('');
            setRecoveryNotice({ type: 'success', message: result.message });
            await loadSecurity();
        } catch (error) {
            setRecoveryNotice({ type: 'error', message: error.message || 'We could not send the verification link.' });
        } finally {
            setIsSubmittingRecovery(false);
        }
    };

    const handlePasswordSubmit = async (event) => {
        event.preventDefault();
        if (isSubmittingPassword) return;
        setPasswordNotice(null);

        if (!passwordIsStrong) {
            setPasswordNotice({ type: 'error', message: 'Choose a password that meets every requirement below.' });
            return;
        }
        if (passwordNew !== passwordConfirm) {
            setPasswordNotice({ type: 'error', message: 'The new passwords do not match.' });
            return;
        }

        setIsSubmittingPassword(true);
        try {
            const { error } = await supabase.auth.updateUser({
                password: passwordNew,
                currentPassword: passwordCurrent,
            });
            if (error) throw error;

            const { error: sessionError } = await supabase.auth.signOut({ scope: 'others' });
            setPasswordNotice({
                type: 'success',
                message: sessionError
                    ? 'Your password was updated. We could not confirm that other refresh sessions were signed out; sign out from any other devices you can access.'
                    : 'Your password was updated and other refresh sessions were signed out. Existing access tokens can remain active until they expire.',
            });
            setPasswordCurrent('');
            setPasswordNew('');
            setPasswordConfirm('');
        } catch (error) {
            setPasswordNotice({
                type: 'error',
                message: error.message || 'We could not update your password. Check your current password and try again.',
            });
        } finally {
            setIsSubmittingPassword(false);
        }
    };

    const roleLabel = security?.role === 'admin'
        ? 'Administrator'
        : security?.role === 'cashier'
            ? 'Cashier'
            : 'Clerk';
    const pendingRecoveryExpired = security?.pendingExpiresAt
        ? Date.parse(security.pendingExpiresAt) <= Date.now()
        : false;

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <header className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7">
                <div className="flex items-start gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-800">
                        <ShieldCheck className="h-6 w-6" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-400">Your profile</p>
                        <h1 className="mt-1 font-display text-2xl font-bold text-primary-950">Account Security</h1>
                        <p className="mt-2 text-sm leading-6 text-primary-600">Manage your password and the email address used to recover your account.</p>
                    </div>
                </div>
            </header>

            {pageError && <SecurityNotice notice={{ type: 'error', message: pageError }} />}

            <section className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="login-info-heading">
                <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary-500" aria-hidden="true" />
                    <h2 id="login-info-heading" className="text-lg font-bold text-primary-950">Login information</h2>
                </div>
                {isLoading ? (
                    <p className="mt-4 text-sm text-primary-500" role="status">Loading account details…</p>
                ) : (
                    <div className="mt-5 flex flex-col gap-4 rounded-xl bg-primary-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary-500">Login email</p>
                            <p className="mt-1 break-all font-semibold text-primary-950">{security?.loginEmail || user?.email}</p>
                            <p className="mt-1 text-sm text-primary-500">This address is used to sign in and will not be changed here.</p>
                        </div>
                        <span className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${security?.protectedAdmin ? 'bg-blue-100 text-blue-900' : 'bg-primary-100 text-primary-700'}`}>
                            {security?.protectedAdmin ? <ShieldCheck className="h-4 w-4" aria-hidden="true" /> : null}
                            {security?.protectedAdmin ? 'Administrator account — Protected' : roleLabel}
                        </span>
                    </div>
                )}
            </section>

            <section className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="recovery-email-heading">
                <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary-500" aria-hidden="true" />
                    <div>
                        <h2 id="recovery-email-heading" className="text-lg font-bold text-primary-950">Recovery email</h2>
                        <p className="mt-1 text-sm text-primary-500">Only used to restore access. It does not replace your sign-in email.</p>
                    </div>
                </div>

                {security?.recoveryEmail && (
                    <div className="mt-5 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Verified recovery address</p>
                            <p className="mt-1 break-all font-semibold text-emerald-950">{security.recoveryEmail}</p>
                            {security.recoveryVerifiedAt && <p className="mt-1 text-xs text-emerald-800">Verified {formatDate(security.recoveryVerifiedAt)}</p>}
                        </div>
                        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-emerald-800">
                            <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verified
                        </span>
                    </div>
                )}

                {security?.pendingRecoveryEmail && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                        {pendingRecoveryExpired ? (
                            <>The verification link for <span className="font-semibold">{security.pendingRecoveryEmail}</span> has expired. Submit the form again to send a new link. Your current verified address is still active.</>
                        ) : (
                            <>Waiting for <span className="font-semibold">{security.pendingRecoveryEmail}</span> to be verified. The link expires 15 minutes after it was sent. Your current verified address stays active until then.</>
                        )}
                    </p>
                )}

                {security && !security.recoveryEmailDeliveryReady && (
                    <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-900">
                        Recovery email sending has not been configured yet. Your system administrator must connect the approved email sender before an address can be added or changed.
                    </p>
                )}

                {security?.protectedAdmin ? (
                    <p className="mt-5 rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-700">
                        To add or change the administrator’s recovery Gmail, open User Management and select Recovery email for your account. Enter the code sent to that inbox to finish setup.
                    </p>
                ) : (
                <>
                <SecurityNotice notice={recoveryNotice} />
                <form onSubmit={handleRecoverySubmit} className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                        <label htmlFor="new-recovery-email" className="mb-2 block text-sm font-semibold text-primary-800">{security?.recoveryEmail ? 'New recovery email' : 'Recovery email'}</label>
                        <input
                            id="new-recovery-email"
                            type="email"
                            autoComplete="email"
                            required
                            maxLength={254}
                            value={recoveryEmail}
                            onChange={(event) => setRecoveryEmail(event.target.value)}
                            placeholder="name@example.com"
                            className="min-h-11 w-full rounded-xl border border-primary-200 bg-white px-4 py-3 text-primary-950 placeholder:text-primary-400 focus:border-accent-blue focus:outline-none focus:ring-2 focus:ring-accent-blue/20"
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <PasswordField
                            id="recovery-current-password"
                            label="Confirm your current password to continue"
                            value={recoveryCurrentPassword}
                            onChange={(event) => setRecoveryCurrentPassword(event.target.value)}
                            show={showRecoveryCurrent}
                            onToggle={() => setShowRecoveryCurrent((visible) => !visible)}
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <button
                            type="submit"
                            disabled={isSubmittingRecovery || isLoading || !security?.recoveryEmailDeliveryReady}
                            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-800 px-5 py-3 font-semibold text-white transition hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                            <Mail className="h-4 w-4" aria-hidden="true" />
                            {isSubmittingRecovery ? 'Sending verification…' : security?.recoveryEmail ? 'Verify new recovery email' : 'Add recovery email'}
                        </button>
                    </div>
                </form>
                </>
                )}
            </section>

            <section className="rounded-2xl border border-primary-200 bg-white p-5 shadow-sm sm:p-7" aria-labelledby="password-security-heading">
                <div className="flex items-center gap-3">
                    <KeyRound className="h-5 w-5 text-primary-500" aria-hidden="true" />
                    <div>
                        <h2 id="password-security-heading" className="text-lg font-bold text-primary-950">Change password</h2>
                        <p className="mt-1 text-sm text-primary-500">Enter your current password to confirm it is really you.</p>
                    </div>
                </div>

                <SecurityNotice notice={passwordNotice} />
                <form onSubmit={handlePasswordSubmit} className="mt-5 space-y-4">
                    <PasswordField
                        id="current-password"
                        label="Current password"
                        value={passwordCurrent}
                        onChange={(event) => setPasswordCurrent(event.target.value)}
                        show={showPasswordCurrent}
                        onToggle={() => setShowPasswordCurrent((visible) => !visible)}
                    />
                    <PasswordField
                        id="new-password"
                        label="New password"
                        value={passwordNew}
                        onChange={(event) => setPasswordNew(event.target.value)}
                        show={showNewPassword}
                        onToggle={() => setShowNewPassword((visible) => !visible)}
                        autoComplete="new-password"
                    />
                    <ul aria-label="Password requirements" className="grid gap-1.5 text-xs sm:grid-cols-2">
                        {passwordRules.map((rule) => (
                            <li key={rule.label} className={rule.passed ? 'text-emerald-700' : 'text-primary-500'}>
                                <span aria-hidden="true" className="mr-1">{rule.passed ? '✓' : '•'}</span>{rule.label}
                            </li>
                        ))}
                    </ul>
                    <PasswordField
                        id="confirm-new-password"
                        label="Confirm new password"
                        value={passwordConfirm}
                        onChange={(event) => setPasswordConfirm(event.target.value)}
                        show={showConfirmPassword}
                        onToggle={() => setShowConfirmPassword((visible) => !visible)}
                        autoComplete="new-password"
                    />
                    {passwordConfirm && passwordNew !== passwordConfirm && <p className="text-sm text-red-700">The new passwords do not match.</p>}
                    <button
                        type="submit"
                        disabled={isSubmittingPassword || !passwordCurrent || !passwordIsStrong || passwordNew !== passwordConfirm}
                        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary-800 px-5 py-3 font-semibold text-white transition hover:bg-primary-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                    >
                        <LockKeyhole className="h-4 w-4" aria-hidden="true" />
                        {isSubmittingPassword ? 'Updating password…' : 'Update password'}
                    </button>
                </form>
            </section>
        </div>
    );
}
