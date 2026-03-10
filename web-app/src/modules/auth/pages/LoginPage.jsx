import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { motion } from 'framer-motion';
import { Mail, Lock, LogIn, ArrowLeft } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { loginSchema } from '../../../utils/validators';
import Button from '../../../components/ui/Button';
import Input from '../../../components/ui/Input';

/**
 * Login Page
 * Authentication page for staff members
 */
const LoginPage = () => {
    const navigate = useNavigate();
    const { login, error: authError } = useAuth();
    const [isLoading, setIsLoading] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: '',
            password: '',
        },
    });

    const onSubmit = async (data) => {
        setIsLoading(true);
        const result = await login(data.email, data.password);
        setIsLoading(false);

        if (result.success) {
            navigate('/dashboard');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative">
            {/* Back Button */}
            <div className="absolute top-6 left-6 z-50">
                <Link to="/" className="flex items-center gap-2 text-primary-600 hover:text-primary-950 transition-all group px-4 py-2 bg-white/80 backdrop-blur-sm border border-primary-200 rounded-full shadow-sm hover:shadow-md hover:bg-white">
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-bold tracking-wide">Back to Home</span>
                </Link>
            </div>

            {/* Background decoration */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-40 -right-40 w-80 h-80 bg-accent-primary/20 rounded-full blur-[100px]" />
                <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-accent-secondary/20 rounded-full blur-[100px]" />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="w-full max-w-md relative"
            >
                {/* Logo */}
                <div className="text-center mb-8">
                    <img src="/LogoLimen.jpg" alt="Limen Logo" className="w-20 h-20 object-contain rounded-2xl mx-auto mb-4 bg-white shadow-sm border border-primary-200 p-1" />
                    <h1 className="font-display text-3xl font-bold text-primary-950">
                        Welcome Back
                    </h1>
                    <p className="text-primary-500 mt-2">
                        Sign in to LimenServe MIS
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-white/90 backdrop-blur-lg border border-primary-200 shadow-xl rounded-2xl p-6 sm:p-8">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                        {/* Error Message */}
                        {authError && (
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-4 rounded-lg bg-accent-danger/20 border border-accent-danger/30"
                            >
                                <p className="text-sm text-accent-danger">{authError}</p>
                            </motion.div>
                        )}

                        {/* Email Input */}
                        <Input
                            label="Email Address"
                            type="email"
                            placeholder="Enter your email"
                            leftIcon={<Mail className="w-4 h-4" />}
                            error={errors.email?.message}
                            {...register('email')}
                        />

                        {/* Password Input */}
                        <Input
                            label="Password"
                            type="password"
                            placeholder="Enter your password"
                            leftIcon={<Lock className="w-4 h-4" />}
                            error={errors.password?.message}
                            {...register('password')}
                        />

                        {/* Remember Me & Forgot Password */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded border-primary-600 bg-primary-800 text-accent-primary focus:ring-accent-primary/20"
                                />
                                <span className="text-sm text-primary-400">Remember me</span>
                            </label>
                            <button
                                type="button"
                                className="text-sm text-accent-primary hover:text-red-400 transition-colors"
                            >
                                Forgot password?
                            </button>
                        </div>

                        {/* Submit Button */}
                        <Button
                            type="submit"
                            variant="primary"
                            fullWidth
                            isLoading={isLoading}
                            leftIcon={<LogIn className="w-4 h-4" />}
                        >
                            Sign In
                        </Button>
                    </form>

                    {/* Demo Credentials */}
                    <div className="mt-6 pt-6 border-t border-primary-200">
                        <p className="text-xs font-bold text-primary-500 text-center mb-3 uppercase tracking-widest">
                            Demo Credentials
                        </p>
                        <div className="grid grid-cols-1 gap-2 text-xs">
                            <div className="flex justify-between px-3 py-2 rounded bg-primary-50 border border-primary-100">
                                <span className="text-primary-600 font-bold">Admin:</span>
                                <span className="text-primary-950 font-medium">admin@limen.com</span>
                            </div>
                            <div className="flex justify-between px-3 py-2 rounded bg-primary-50 border border-primary-100">
                                <span className="text-primary-600 font-bold">Cashier:</span>
                                <span className="text-primary-950 font-medium">cashier@limen.com</span>
                            </div>
                            <div className="flex justify-between px-3 py-2 rounded bg-primary-50 border border-primary-100">
                                <span className="text-primary-600 font-bold">Clerk:</span>
                                <span className="text-primary-950 font-medium">clerk@limen.com</span>
                            </div>
                            <p className="text-center text-primary-400 mt-2 font-mono">
                                Password: any 6+ characters
                            </p>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-sm font-medium text-primary-500 mt-8">
                    © {new Date().getFullYear()} Limen Auto Parts Center
                </p>
            </motion.div>
        </div>
    );
};

export default LoginPage;
