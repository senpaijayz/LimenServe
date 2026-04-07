import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CarFront, Clock, MapPin, Menu, Phone, Search, ShieldCheck, X } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';

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
    const navigate = useNavigate();
    const [scrolled, setScrolled] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [headerQuery, setHeaderQuery] = useState('');

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    if (isAuthenticated) {
        return <Navigate to="/dashboard" replace />;
    }

    const submitHeaderSearch = () => {
        const query = headerQuery.trim();
        navigate(query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog');
        setMobileMenuOpen(false);
    };

    const isNavItemActive = (to) => {
        if (to === '/catalog') {
            return location.pathname.startsWith('/catalog');
        }
        return location.pathname === to;
    };

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
                            +63 917 123 4567
                        </span>
                        <span className="hidden items-center gap-2 sm:inline-flex">
                            <Clock className="h-3.5 w-3.5 text-red-400" />
                            Mon-Sat 8:00 AM-6:00 PM
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
                            <img src="/LogoLimen.jpg" alt="Limen logo" className="h-11 w-11 rounded-lg border border-primary-200 bg-white p-1 shadow-sm" />
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-primary">Limen</p>
                                <h1 className="text-xl font-bold text-primary-950">Genuine Auto Parts</h1>
                            </div>
                        </Link>

                        <div className="hidden flex-1 items-center justify-end gap-6 xl:flex">
                            <nav className="flex items-center gap-5">
                                {primaryNav.map((item) => (
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
                                <a href="#footer-contact" className="text-sm font-medium text-primary-600 transition-colors hover:text-primary-950">
                                    Contact
                                </a>
                            </nav>

                            <div className="flex w-full max-w-[430px] items-center overflow-hidden rounded-xl border border-primary-300 bg-primary-100 shadow-sm">
                                <Search className="ml-4 h-4 w-4 text-primary-500" />
                                <input
                                    type="text"
                                    value={headerQuery}
                                    onChange={(event) => setHeaderQuery(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            submitHeaderSearch();
                                        }
                                    }}
                                    placeholder="Search by part name, vehicle, or part number"
                                    className="w-full bg-transparent px-3 py-3 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                                />
                                <button
                                    type="button"
                                    onClick={submitHeaderSearch}
                                    className="mr-2 rounded-lg bg-accent-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-blueDark"
                                >
                                    Search
                                </button>
                            </div>

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
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="fixed inset-0 z-40 overflow-y-auto bg-white px-4 pb-8 pt-24 shadow-2xl xl:hidden"
                    >
                        <div className="mx-auto max-w-xl space-y-4">
                            <div className="rounded-2xl border border-primary-200 bg-primary-100 p-3">
                                <div className="flex items-center rounded-xl border border-primary-300 bg-white">
                                    <Search className="ml-4 h-4 w-4 text-primary-500" />
                                    <input
                                        type="text"
                                        value={headerQuery}
                                        onChange={(event) => setHeaderQuery(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                submitHeaderSearch();
                                            }
                                        }}
                                        placeholder="Search by part name, vehicle, or part number"
                                        className="w-full bg-transparent px-3 py-3 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                                    />
                                </div>
                                <button type="button" onClick={submitHeaderSearch} className="btn btn-primary mt-3 w-full">
                                    Search Catalog
                                </button>
                            </div>

                            <div className="rounded-2xl border border-primary-200 bg-white">
                                {primaryNav.map((item) => (
                                    <Link
                                        key={item.label}
                                        to={item.to}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="block border-b border-primary-200 px-5 py-4 text-base font-semibold text-primary-900 last:border-b-0"
                                    >
                                        {item.label}
                                    </Link>
                                ))}
                                <a href="#footer-contact" onClick={() => setMobileMenuOpen(false)} className="block px-5 py-4 text-base font-semibold text-primary-900">
                                    Contact
                                </a>
                                <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block border-t border-primary-200 px-5 py-4 text-base font-semibold text-accent-primary">
                                    Staff Portal
                                </Link>
                            </div>
                        </div>
                    </motion.div>
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
                                <img src="/LogoLimen.jpg" alt="Limen logo" className="h-11 w-11 rounded-lg border border-primary-200 bg-white p-1 shadow-sm" />
                                <div>
                                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-accent-primary">Limen</p>
                                    <p className="text-lg font-bold text-primary-950">Genuine Auto Parts</p>
                                </div>
                            </div>
                            <p className="mt-5 text-sm leading-relaxed text-primary-600">
                                Genuine and aftermarket auto parts for Mitsubishi and other popular vehicle lines, backed by real in-store support in Pasay City.
                            </p>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Shop</h4>
                            <div className="mt-5 space-y-3 text-sm text-primary-600">
                                <Link to="/catalog" className="block hover:text-accent-primary">Shop by Category</Link>
                                <Link to="/catalog" className="block hover:text-accent-primary">Brands</Link>
                                <Link to="/estimate" className="block hover:text-accent-primary">Vehicle Search</Link>
                                <Link to="/service-orders" className="block hover:text-accent-primary">Service Orders</Link>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Company</h4>
                            <div className="mt-5 space-y-3 text-sm text-primary-600">
                                <Link to="/about" className="block hover:text-accent-primary">About Limen</Link>
                                <Link to="/estimate" className="block hover:text-accent-primary">Get a Quote</Link>
                                <Link to="/login" className="block hover:text-accent-primary">Staff Portal</Link>
                            </div>
                        </div>

                        <div>
                            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-primary-500">Contact</h4>
                            <div className="mt-5 space-y-4 text-sm text-primary-600">
                                <div className="flex items-start gap-3">
                                    <MapPin className="mt-0.5 h-4 w-4 text-accent-danger" />
                                    <span>1308, 264 Epifanio de los Santos Ave, Pasay City, Metro Manila</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Phone className="h-4 w-4 text-accent-danger" />
                                    <span>+63 917 123 4567</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <Clock className="h-4 w-4 text-accent-danger" />
                                    <span>Mon-Sat: 8:00 AM-6:00 PM</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 border-t border-primary-200 py-6 text-xs text-primary-500 sm:flex-row sm:items-center sm:justify-between">
                        <p>(c) {new Date().getFullYear()} Limen Auto Parts Center. All rights reserved.</p>
                        <div className="flex gap-4">
                            <span>Trusted local auto parts seller in Pasay City</span>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default PublicLayout;
