import { useEffect, useState } from 'react';
import { ArrowLeft, Lock, Mail, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';
import { useAuth } from '../../../context/useAuth';
import { getDefaultAuthenticatedPath } from '../../../utils/constants';

export default function RegisterPage() {
  const navigate = useNavigate();
  const {
    registerCustomer,
    error: authError,
    isAuthenticated,
    isLoadingAuth,
    user,
  } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState('');

  useEffect(() => {
    if (!isLoadingAuth && isAuthenticated) {
      navigate(getDefaultAuthenticatedPath(user?.role), { replace: true });
    }
  }, [isAuthenticated, isLoadingAuth, navigate, user?.role]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    setFieldError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();

    if (fullName.length < 2) {
      setFieldError('Enter your full name.');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setFieldError('Enter a valid email address.');
      return;
    }

    if (form.password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setFieldError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const result = await registerCustomer({ fullName, email, password: form.password });
    setIsSubmitting(false);

    if (!result.success) return;
    if (result.requiresEmailConfirmation) {
      setConfirmationMessage('Check your email to confirm the account, then return here to sign in.');
      return;
    }

    navigate('/my-reservations', { replace: true });
  };

  return (
    <main className="min-h-screen bg-primary-50 px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-lg">
        <Link to="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-primary-700 hover:bg-white">
          <ArrowLeft className="h-4 w-4" /> Back to catalog
        </Link>

        <div className="mt-6 rounded-3xl border border-primary-200 bg-white p-6 shadow-xl sm:p-8">
          <img src="/LogoLimen.jpg" alt="Limen" className="h-16 w-16 rounded-2xl border border-primary-200 object-contain p-1" />
          <p className="mt-6 text-xs font-black uppercase tracking-[0.26em] text-accent-primary">Customer account</p>
          <h1 className="mt-2 text-3xl font-display font-bold text-primary-950">Create your account</h1>
          <p className="mt-2 text-sm leading-6 text-primary-600">Use this account to pre-order unavailable parts and follow each reservation.</p>

          {confirmationMessage ? (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900" role="status">
              <p className="font-bold">Account created</p>
              <p className="mt-1">{confirmationMessage}</p>
              <Link to="/login" className="mt-4 inline-flex font-bold underline">Go to sign in</Link>
            </div>
          ) : (
            <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
              {(fieldError || authError) && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                  {fieldError || authError}
                </div>
              )}

              <Input label="Full name" value={form.fullName} onChange={updateField('fullName')} autoComplete="name" required />
              <Input label="Email address" type="email" leftIcon={<Mail className="h-4 w-4" />} value={form.email} onChange={updateField('email')} autoComplete="email" required />
              <Input label="Password" type="password" leftIcon={<Lock className="h-4 w-4" />} value={form.password} onChange={updateField('password')} autoComplete="new-password" required />
              <Input label="Confirm password" type="password" leftIcon={<Lock className="h-4 w-4" />} value={form.confirmPassword} onChange={updateField('confirmPassword')} autoComplete="new-password" required />

              <Button type="submit" fullWidth variant="confirm" isLoading={isSubmitting} loadingLabel="Creating account" leftIcon={<UserPlus className="h-4 w-4" />}>
                Create customer account
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-primary-600">
            Already have an account? <Link to="/login" className="font-bold text-accent-primary hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </main>
  );
}
