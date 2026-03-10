import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Phone, MapPin, Clock, Menu, X, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PublicLayout = () => {
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    const navLinks = [
        { path: '/', label: 'Home' },
        { path: '/about', label: 'Our Enterprise' },
        { path: '/catalog', label: 'Genuine Parts' },
        { path: '/estimate', label: 'Get Estimate' }
    ];

    return (
        <div className="min-h-screen flex flex-col bg-primary-50 font-sans text-primary-900 overflow-x-hidden print:block print:min-h-0 print:bg-white">
            {/* Header */}
            <header
                className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b print:hidden ${scrolled ? 'bg-white/90 backdrop-blur-xl border-primary-200 py-3 shadow-sm' : 'bg-transparent border-transparent py-5'
                    }`}
            >
                <div className="max-w-[1600px] mx-auto px-4 md:px-8 xl:px-12">
                    <div className="flex items-center justify-between">

                        {/* Logo */}
                        <Link to="/" className="flex items-center gap-3 z-50 group">
                            <img src="/LogoLimen.jpg" alt="Limen Logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1 group-hover:scale-105 transition-transform shadow-lg shadow-black/20" />
                            <div className="flex flex-col">
                                <span className="font-display font-bold text-2xl tracking-tight text-primary-950 leading-none group-hover:text-accent-primary transition-colors">
                                    Limen
                                </span>
                                <span className="text-[10px] font-sans font-bold text-primary-500 tracking-widest uppercase mt-1">
                                    Auto Parts Center
                                </span>
                            </div>
                        </Link>

                        {/* Desktop Nav */}
                        <nav className="hidden md:flex items-center gap-8">
                            {navLinks.map(link => (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`text-sm font-medium transition-colors relative py-2 ${location.pathname === link.path ? 'text-accent-primary' : 'text-primary-600 hover:text-primary-950'
                                        }`}
                                >
                                    {link.label}
                                    {location.pathname === link.path && (
                                        <motion.div
                                            layoutId="activeNav"
                                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary"
                                        />
                                    )}
                                </Link>
                            ))}

                            <div className="h-6 w-px bg-primary-300 mx-2" />

                            <Link to="/login" className="btn btn-secondary text-xs px-5 py-2">
                                Staff Portal
                            </Link>
                        </nav>

                        {/* Mobile Toggle */}
                        <button
                            className="md:hidden p-2 text-primary-600 hover:text-primary-950 z-50"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        >
                            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Menu Overlay */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 bg-white pt-24 px-4 pb-8 flex flex-col shadow-2xl"
                    >
                        <div className="flex flex-col gap-4 text-2xl font-display font-medium">
                            {navLinks.map(link => (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`py-4 border-b border-primary-200 flex justify-between items-center ${location.pathname === link.path ? 'text-accent-primary font-bold' : 'text-primary-600'
                                        }`}
                                >
                                    {link.label}
                                    <ChevronRight className="w-6 h-6 opacity-30" />
                                </Link>
                            ))}
                        </div>
                        <div className="mt-auto">
                            <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn btn-primary w-full text-lg py-4">
                                Staff Portal Access
                            </Link>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <main className="flex-1 w-full relative">
                <Outlet />
            </main>

            {/* Footer */}
            <footer className="bg-white pt-20 pb-10 border-t border-primary-200 overflow-hidden relative print:hidden">
                <div className="absolute top-0 right-0 w-1/3 h-px bg-gradient-to-l from-accent-primary to-transparent" />
                <div className="max-w-[1600px] mx-auto px-4 md:px-8 xl:px-12 relative z-10 text-primary-600">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">

                        {/* Brand Column */}
                        <div className="lg:col-span-1">
                            <Link to="/" className="flex items-center gap-3 mb-6">
                                <img src="/LogoLimen.jpg" alt="Limen Logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1 shadow-sm border border-primary-200" />
                                <span className="font-display font-bold text-2xl text-primary-950">Limen</span>
                            </Link>
                            <p className="text-primary-500 text-sm leading-relaxed mb-6 font-sans">
                                The premier destination for authentic Mitsubishi parts and automotive excellence in Metro Manila.
                            </p>
                        </div>

                        {/* Navigation */}
                        <div>
                            <h4 className="font-display font-semibold tracking-wide text-primary-950 mb-6">Explore</h4>
                            <ul className="space-y-4">
                                {navLinks.map(link => (
                                    <li key={link.path}>
                                        <Link to={link.path} className="text-primary-500 hover:text-accent-primary text-sm transition-colors">
                                            {link.label}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Contact Info */}
                        <div className="lg:col-span-2">
                            <h4 className="font-display font-semibold tracking-wide text-primary-950 mb-6">Visit Us</h4>
                            <div className="grid sm:grid-cols-2 gap-8 text-sm">
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3 text-primary-600">
                                        <MapPin className="w-5 h-5 text-accent-primary shrink-0" />
                                        <span>1308, 264 Epifanio de los Santos Ave<br />Pasay City, 1308 Metro Manila<br />Philippines</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-primary-600">
                                        <Phone className="w-5 h-5 text-accent-primary shrink-0" />
                                        <span>+63 917 123 4567</span>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-start gap-3 text-primary-600 bg-primary-50 p-4 rounded-xl border border-primary-200">
                                        <Clock className="w-5 h-5 text-accent-primary shrink-0" />
                                        <div>
                                            <p className="font-medium text-primary-950 mb-1">Business Hours</p>
                                            <p>Mon - Sat: 8:00 AM - 6:00 PM</p>
                                            <p>Sun: 8:00 AM - 12:00 PM</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-8 border-t border-primary-200 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs font-sans text-primary-500">
                        <p>© {new Date().getFullYear()} Limen Auto Parts Center. All rights reserved.</p>
                        <div className="flex gap-4">
                            <span className="hover:text-primary-950 cursor-pointer transition-colors">Privacy Policy</span>
                            <span className="hover:text-primary-950 cursor-pointer transition-colors">Terms of Service</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicLayout;
