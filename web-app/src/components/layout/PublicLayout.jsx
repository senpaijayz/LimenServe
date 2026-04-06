import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Clock, MapPin, Menu, Phone, X } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import GlobalSearch from '../ui/GlobalSearch';

const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/catalog', label: 'Catalog' },
    { path: '/estimate', label: 'Estimate' },
    { path: '/service-orders', label: 'Service Orders' },
    { path: '/about', label: 'About' },
];

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

    return (
        <div className="min-h-screen overflow-x-hidden bg-primary-950 text-primary-100 print:block print:min-h-0 print:bg-white">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute left-[-10%] top-[-16%] h-[32rem] w-[32rem] rounded-full bg-accent-info/14 blur-[140px]" />
                <div className="absolute right-[-10%] top-[12%] h-[24rem] w-[24rem] rounded-full bg-accent-blue/16 blur-[120px]" />
            </div>

            <header className={`fixed left-0 right-0 top-0 z-50 border-b transition-all duration-300 print:hidden ${scrolled
                ? 'border-white/8 bg-primary-950/78 py-3 backdrop-blur-2xl'
                : 'border-transparent bg-transparent py-5'
                }`}
            >
                <div className="mx-auto flex max-w-[1700px] items-center justify-between px-4 md:px-8 xl:px-12">
                    <Link to="/" className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/20 bg-white/[0.05] shadow-[0_14px_40px_rgba(79,223,255,0.14)]">
                            <img src="/LogoLimen.jpg" alt="Limen logo" className="h-9 w-9 rounded-xl object-contain" />
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary-500">LIMEN</p>
                            <p className="text-lg font-semibold text-white">Genuine Mitsubishi parts</p>
                        </div>
                    </Link>

                    <nav className="hidden items-center gap-2 lg:flex">
                        {navLinks.map((link) => {
                            const isActive = location.pathname === link.path;
                            return (
                                <Link
                                    key={link.path}
                                    to={link.path}
                                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${isActive
                                        ? 'bg-white/[0.08] text-white'
                                        : 'text-primary-300 hover:bg-white/[0.05] hover:text-white'
                                        }`}
                                >
                                    {link.label}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="hidden items-center gap-3 lg:flex">
                        <GlobalSearch />
                        <Link to="/login" className="btn btn-secondary">
                            Staff portal
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setMobileMenuOpen((current) => !current)}
                        className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-primary-100 lg:hidden"
                        aria-label="Toggle menu"
                    >
                        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>
                </div>
            </header>

            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-40 bg-primary-950/92 px-4 pb-8 pt-24 backdrop-blur-2xl lg:hidden"
                    >
                        <div className="mx-auto flex h-full max-w-xl flex-col">
                            <div className="space-y-2">
                                {navLinks.map((link) => (
                                    <Link
                                        key={link.path}
                                        to={link.path}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className={`flex items-center justify-between rounded-[24px] border px-5 py-4 text-base font-semibold transition ${location.pathname === link.path
                                            ? 'border-accent-info/20 bg-accent-info/10 text-white'
                                            : 'border-white/8 bg-white/[0.03] text-primary-200'
                                            }`}
                                    >
                                        <span>{link.label}</span>
                                        <ChevronRight className="h-5 w-5 text-primary-500" />
                                    </Link>
                                ))}
                            </div>

                            <div className="mt-5">
                                <GlobalSearch compact />
                            </div>

                            <div className="mt-auto">
                                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn btn-primary w-full">
                                    Open staff portal
                                </Link>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <main className="relative z-10 flex-1">
                <Outlet />
            </main>

            <footer className="relative z-10 border-t border-white/8 bg-primary-950/84 px-4 py-14 backdrop-blur-2xl print:hidden md:px-8 xl:px-12">
                <div className="mx-auto grid max-w-[1700px] gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
                    <div>
                        <div className="data-pill">Visit the showroom</div>
                        <h2 className="mt-5 text-3xl font-semibold text-white">A sharper customer journey from search to quote.</h2>
                        <p className="mt-4 max-w-xl text-sm leading-relaxed text-primary-400">
                            LIMEN connects genuine parts browsing, vehicle-fitment guidance, and quotation support into one calmer buying flow.
                        </p>
                    </div>

                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary-500">Explore</p>
                        <div className="mt-5 space-y-3">
                            {navLinks.map((link) => (
                                <Link key={link.path} to={link.path} className="block text-sm text-primary-300 hover:text-white">
                                    {link.label}
                                </Link>
                            ))}
                        </div>
                    </div>

                    <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary-500">Store details</p>
                        <div className="mt-5 space-y-4 text-sm text-primary-300">
                            <div className="flex items-start gap-3">
                                <MapPin className="mt-0.5 h-4 w-4 text-accent-info" />
                                <span>1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Phone className="h-4 w-4 text-accent-info" />
                                <span>+63 917 123 4567</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Clock className="h-4 w-4 text-accent-info" />
                                <span>Mon-Sat 8:00 AM to 6:00 PM</span>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicLayout;
