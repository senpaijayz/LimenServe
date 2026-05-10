import { useEffect, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { CarFront, Clock, MapPin, Menu, Phone, ShieldCheck, X } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import usePublicCmsSite from '../../hooks/usePublicCmsSite';

const primaryNav = [
    { label: 'Home', to: '/' },
    { label: 'About', to: '/about' },
    { label: 'Genuine Parts', to: '/catalog' },
    { label: 'Get Estimate', to: '/estimate' },
    { label: 'Service Orders', to: '/service-orders' },
];

const PublicLayout = () => {
    const { isAuthenticated } = useAuth();
    const location = useLocation();
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const { settings, navigation } = usePublicCmsSite();

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    const isNavItemActive = (to) => {
        if (to === '/catalog') {
            return location.pathname.startsWith('/catalog');
        }
        return location.pathname === to;
    };

    const getSetting = (key, fallback) => {
        const value = settings?.[key];
        if (typeof value === 'string' || typeof value === 'number') {
            return String(value);
        }
        return fallback;
    };

    const logoUrl = getSetting('logo_url', '/LogoLimen.jpg');
    const brandKicker = getSetting('brand_kicker', 'Limen');
    const brandTitle = getSetting('brand_title', 'Genuine Auto Parts');
    const companyName = getSetting('company_name', 'Limen Auto Parts Center');
    const primaryPhone = getSetting('primary_phone', '(0915) 522 5629');
    const landline = getSetting('landline', '02 8551 3518');
    const businessHours = getSetting('business_hours', 'Mon-Sat 8:00 AM-5:00 PM | Sun 8:00 AM-12:00 PM');
    const address = getSetting('address', '1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila');
    const footerNote = getSetting('footer_note', 'Trusted local auto parts seller in Pasay City');
    const visibleNavigation = Array.isArray(navigation) ? navigation : [];
    const cmsPrimaryNav = visibleNavigation
        .filter((item) => item.groupKey === 'primary')
        .sort((a, b) => Number(a.sortOrder ?? 100) - Number(b.sortOrder ?? 100))
        .map((item) => ({ label: item.label, to: item.href }));
    const navItems = cmsPrimaryNav.length ? cmsPrimaryNav : primaryNav;
    const footerShopLinks = visibleNavigation.filter((item) => item.groupKey === 'footer_shop');
    const footerCompanyLinks = visibleNavigation.filter((item) => item.groupKey === 'footer_company');

    return (
        <div className="min-h-screen overflow-x-hidden bg-white font-sans text-primary-900 print:block print:min-h-0 print:bg-white">
            <div className="border-b border-primary-200 bg-primary-950 text-white print:hidden">
                <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs md:px-8 xl:px-12">
                    <div className="flex items-center gap-4">
                        <span className="inline-flex items-center gap-2">
                            <ShieldCheck className="h-3.5 w-3.5 text-red-400" />
                            Genuine and aftermarket parts from a real Pasay City store
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-white/80">
                        <span className="inline-flex items-center gap-2">
                            <Phone className="h-3.5 w-3.5 text-red-400" />
                            {primaryPhone} | {landline}
                        </span>
                        <span className="hidden items-center gap-2 sm:inline-flex">
                            <Clock className="h-3.5 w-3.5 text-red-400" />
                            {businessHours}
                        </span>
                    </div>
                </div>
            </div>

            <header
                className={`sticky top-0 z-50 border-b print:hidden transition-all duration-300 ${
                    scrolled ? 'border-primary-200 bg-white/95 shadow-sm backdrop-blur-xl' : 'border-primary-200 bg-white'
                }`}
            >
                <div className="mx-auto max-w-[1600px] px-4 md:px-8 xl:px-12">
                    <div className="flex items-center justify-between gap-4 py-4">
                        <Link to="/" className="flex items-center gap-3">
                            <img src={logoUrl} alt={`${companyName} logo`} className="h-11 w-11 rounded-lg border border-primary-200 bg-white p-1 shadow-sm" />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-primary">{brandKicker}</p>
                                <h1 className="text-xl font-bold text-primary-950">{brandTitle}</h1>
                            </div>
                        </Link>

                        <div className="hidden flex-1 items-center justify-end gap-6 xl:flex">
                            <nav className="flex items-center gap-5">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.label}
                                        to={item.to}
                                        className={`text-sm font-medium transition-colors ${
                                            isNavItemActive(item.to) ? 'text-accent-primary' : 'text-primary-600 hover:text-primary-950'
                                        }`}
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                            </nav>

                            <Link to="/login" className="btn btn-primary px-4 py-2 text-xs">
                                Staff Portal
                            </Link>
                        </div>

                        <button
                            type="button"
                            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary-300 text-primary-700 xl:hidden"
                            onClick={() => setMobileMenuOpen((current) => !current)}
                            aria-label="Toggle menu"
                        >
                            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                        </button>
                    </div>
                </div>
            </header>

            <AnimatePresence>
                {mobileMenuOpen && (
                    <Motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 overflow-y-auto bg-white px-4 pb-8 pt-24 shadow-2xl xl:hidden"
                    >
                        <div className="mx-auto max-w-xl space-y-4">
                            <div className="rounded-2xl border border-primary-200 bg-white">
                                {navItems.map((item) => (
                                    <Link
                                        key={item.label}
                                        to={item.to}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block border-b border-primary-200 px-5 py-4 text-base font-semibold text-primary-900 last:border-b-0"
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block border-t border-primary-200 px-5 py-4 text-base font-semibold text-accent-primary">
                                    Staff Portal
                                </Link>
                            </div>
                        </div>
                    </Motion.div>
                )}
            </AnimatePresence>

            <main className="flex-1">
                <section className="border-b border-primary-200 bg-primary-100/90 print:hidden">
                    <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 text-xs text-primary-600 md:px-8 xl:px-12">
                        <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1.5 font-semibold text-primary-700">
                            <ShieldCheck className="h-3.5 w-3.5 text-accent-primary" />
                            Genuine Parts
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1.5 font-semibold text-primary-700">
                            <CarFront className="h-3.5 w-3.5 text-accent-danger" />
                            Mitsubishi Specialists
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-3 py-1.5 font-semibold text-primary-700">
                            <Clock className="h-3.5 w-3.5 text-accent-primary" />
                            Fast quotation support
                        </span>
                    </div>
                </section>
                <Outlet />
            </main>

            <footer id="footer-contact" className="border-t border-primary-200 bg-primary-100 pt-16 print:hidden">
                <div className="mx-auto max-w-[1600px] px-4 md:px-8 xl:px-12">
                    <div className="grid gap-12 pb-12 md:grid-cols-2 lg:grid-cols-4">
                        <div className="lg:col-span-1">
                            <div className="flex items-center gap-3">
                                <img src={logoUrl} alt={`${companyName} logo`} className="h-11 w-11 rounded-lg border border-primary-200 bg-white p-1 shadow-sm" />
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-primary">{brandKicker}</p>
                                    <p className="text-lg font-bold text-primary-950">{brandTitle}</p>
                                </div>
                            </div>
                            <p className="mt-5 text-sm leading-relaxed text-primary-600">
                                Genuine and aftermarket auto parts for Mitsubishi and other popular vehicle lines, backed by real in-store support in Pasay City.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Shop</h4>
                            <div className="mt-5 space-y-3 text-sm text-primary-600">
                                {(footerShopLinks.length ? footerShopLinks : [
                                    { label: 'Shop by Category', href: '/catalog' },
                                    { label: 'Vehicle Search', href: '/estimate' },
                                    { label: 'Service Orders', href: '/service-orders' },
                                ]).map((item) => (
                                    <Link key={`${item.label}-${item.href}`} to={item.href} className="block hover:text-accent-primary">{item.label}</Link>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Company</h4>
                            <div className="mt-5 space-y-3 text-sm text-primary-600">
                                {(footerCompanyLinks.length ? footerCompanyLinks : [
                                    { label: 'About Limen', href: '/about' },
                                    { label: 'Get a Quote', href: '/estimate' },
                                    { label: 'Staff Portal', href: '/login' },
                                ]).map((item) => (
                                    <Link key={`${item.label}-${item.href}`} to={item.href} className="block hover:text-accent-primary">{item.label}</Link>
                                ))}
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Contact</h4>
                            <div className="mt-5 space-y-4 text-sm text-primary-600">
                                <div className="flex items-start gap-3">
                                    <MapPin className="mt-0.5 h-4 w-4 text-accent-danger" />
                                    <span>{address}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Phone className="h-4 w-4 text-accent-danger" />
                                    <span>{primaryPhone}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Phone className="h-4 w-4 text-accent-danger" />
                                    <span>Landline: {landline}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="h-4 w-4 text-accent-danger" />
                                    <span>{businessHours}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-primary-200 py-6 text-xs text-primary-500 sm:flex-row sm:items-center sm:justify-between">
                        <p>(c) {new Date().getFullYear()} {companyName}. All rights reserved.</p>
                        <div className="flex gap-4">
                            <span>{footerNote}</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicLayout;
