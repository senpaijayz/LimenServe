import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    Calculator,
    CarFront,
    ChevronRight,
    PhoneCall,
    Search,
    ShieldCheck,
    Sparkles,
    Wrench,
} from 'lucide-react';
import storefrontImage from '../../../assets/homepage/limen-storefront-optimized.jpg';
import monteroImage from '../../../assets/homepage/montero-optimized.jpg';
import tritonImage from '../../../assets/homepage/triton-optimized.jpg';
import xforceImage from '../../../assets/homepage/xforce-optimized.jpg';
import destinatorImage from '../../../assets/homepage/destinator-optimized.jpg';

const showcaseVehicles = [
    {
        name: 'Montero Sport',
        label: 'SUV demand',
        description: 'Brake kits, filters, cooling parts, and routine maintenance bundles for daily SUV service work.',
        image: monteroImage,
    },
    {
        name: 'Triton',
        label: 'Pickup support',
        description: 'Suspension, hard-wearing maintenance lines, and work-ready replacement parts for commercial use.',
        image: tritonImage,
    },
    {
        name: 'Xforce',
        label: 'Newer models',
        description: 'Fitment-led parts search and faster quote preparation for newer Mitsubishi units.',
        image: xforceImage,
    },
    {
        name: 'Destinator',
        label: 'Fresh lineups',
        description: 'Inquiry-ready parts and package recommendations for newer product lines and early buyer questions.',
        image: destinatorImage,
    },
];

const quickPaths = [
    {
        title: 'Search genuine parts',
        description: 'Jump straight into SKU, fitment, and model-specific browsing.',
        route: '/catalog',
        icon: Search,
    },
    {
        title: 'Build an estimate',
        description: 'Move from inquiry to quotation without losing the selected vehicle context.',
        route: '/estimate',
        icon: Calculator,
    },
    {
        title: 'Plan service work',
        description: 'Open the service-order path for repair, labor, and maintenance requests.',
        route: '/service-orders',
        icon: Wrench,
    },
];

const PublicHome = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const navigate = useNavigate();

    const handleSearch = () => {
        const query = searchQuery.trim();
        navigate(query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog');
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-primary-950 pb-20 text-primary-100">
            <section className="relative px-4 pb-16 pt-28 md:px-8 xl:px-12">
                <div className="mx-auto grid max-w-[1700px] gap-8 xl:grid-cols-[1.05fr_0.95fr]">
                    <motion.div
                        initial={{ opacity: 0, y: 22 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45 }}
                        className="shell-panel relative overflow-hidden px-6 py-8 sm:px-8 sm:py-10"
                    >
                        <div className="absolute right-[-4rem] top-[-5rem] h-56 w-56 rounded-full bg-accent-info/16 blur-[110px]" />
                        <div className="absolute bottom-[-7rem] left-[-3rem] h-64 w-64 rounded-full bg-accent-blue/18 blur-[110px]" />

                        <div className="relative max-w-3xl">
                            <div className="data-pill">Premium showroom flow</div>
                            <h1 className="mt-6 text-5xl font-semibold leading-[0.95] sm:text-6xl xl:text-7xl">
                                Genuine Mitsubishi parts with a faster path from search to quote.
                            </h1>
                            <p className="mt-6 max-w-2xl text-base leading-relaxed text-primary-300 sm:text-lg">
                                LIMEN connects catalog search, vehicle-fitment guidance, quotation prep, and service planning into one cleaner customer journey.
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <span className="badge badge-info">Vehicle-aware browsing</span>
                                <span className="badge badge-neutral">Quote retrieval</span>
                                <span className="badge badge-neutral">Service-ready bundles</span>
                            </div>

                            <div className="mt-8 rounded-[28px] border border-white/10 bg-white/[0.05] p-3 backdrop-blur-xl">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                    <div className="flex flex-1 items-center gap-3 rounded-[22px] border border-white/10 bg-primary-950/70 px-4 py-3">
                                        <Search className="h-5 w-5 text-primary-500" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(event) => setSearchQuery(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    handleSearch();
                                                }
                                            }}
                                            placeholder="Search Mitsubishi part name, SKU, or vehicle model"
                                            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-primary-500"
                                        />
                                    </div>
                                    <button type="button" onClick={handleSearch} className="btn btn-primary min-w-[180px]">
                                        Search catalog
                                        <ChevronRight className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                                <Link to="/catalog" className="btn btn-primary">
                                    Browse catalog
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                                <Link to="/estimate" className="btn btn-secondary">
                                    Build estimate
                                    <Calculator className="h-4 w-4" />
                                </Link>
                            </div>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, x: 18 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.45, delay: 0.08 }}
                        className="grid gap-6"
                    >
                        <div className="shell-panel overflow-hidden">
                            <img src={storefrontImage} alt="Limen Auto Parts storefront" className="h-[360px] w-full object-cover sm:h-[430px]" />
                            <div className="border-t border-white/8 px-6 py-6">
                                <div className="data-pill">Physical showroom</div>
                                <h2 className="mt-4 text-3xl font-semibold text-white">A real parts counter with a sharper digital layer.</h2>
                                <p className="mt-3 text-sm leading-relaxed text-primary-300">
                                    Customers can move from real store inquiries into catalog search, estimate preparation, and service planning without repeating the same context.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-3">
                            <div className="shell-panel px-5 py-5">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-primary-500">Speed</p>
                                <p className="mt-3 text-2xl font-semibold text-white">Same-day</p>
                                <p className="mt-2 text-sm text-primary-300">Quotation support for walk-in and repeat buyers.</p>
                            </div>
                            <div className="shell-panel px-5 py-5">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-primary-500">Coverage</p>
                                <p className="mt-3 text-2xl font-semibold text-white">OEM focus</p>
                                <p className="mt-2 text-sm text-primary-300">Catalog organized around genuine Mitsubishi lines.</p>
                            </div>
                            <div className="shell-panel px-5 py-5">
                                <p className="text-[11px] uppercase tracking-[0.22em] text-primary-500">Flow</p>
                                <p className="mt-3 text-2xl font-semibold text-white">Search to quote</p>
                                <p className="mt-2 text-sm text-primary-300">One path from parts discovery to customer-ready totals.</p>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </section>

            <section className="px-4 py-8 md:px-8 xl:px-12">
                <div className="mx-auto max-w-[1700px]">
                    <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="max-w-3xl">
                            <div className="data-pill">Vehicle-led discovery</div>
                            <h2 className="mt-4 text-4xl font-semibold text-white">Browse the lines your customers ask for most.</h2>
                            <p className="mt-3 text-sm leading-relaxed text-primary-300">
                                Start with the Mitsubishi vehicle line, then flow into fitment-aware parts, quote-ready bundles, and service recommendations.
                            </p>
                        </div>
                        <Link to="/catalog" className="btn btn-secondary self-start">
                            Explore full catalog
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                        {showcaseVehicles.map((vehicle, index) => (
                            <motion.article
                                key={vehicle.name}
                                initial={{ opacity: 0, y: 18 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-60px' }}
                                transition={{ duration: 0.35, delay: index * 0.05 }}
                                className="shell-panel overflow-hidden"
                            >
                                <div className="relative h-[250px] overflow-hidden bg-gradient-to-br from-primary-900 to-primary-950">
                                    <div className="absolute inset-0 bg-gradient-to-t from-primary-950 via-transparent to-transparent" />
                                    <img src={vehicle.image} alt={vehicle.name} className="h-full w-full object-contain p-6" />
                                </div>
                                <div className="border-t border-white/8 px-5 py-5">
                                    <p className="text-[11px] uppercase tracking-[0.22em] text-primary-500">{vehicle.label}</p>
                                    <h3 className="mt-3 text-2xl font-semibold text-white">{vehicle.name}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-primary-300">{vehicle.description}</p>
                                    <Link to={`/catalog?q=${encodeURIComponent(vehicle.name)}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-info hover:text-white">
                                        View parts for {vehicle.name}
                                        <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </div>
                            </motion.article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-4 py-8 md:px-8 xl:px-12">
                <div className="mx-auto grid max-w-[1700px] gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                    <div className="shell-panel px-6 py-7 sm:px-8">
                        <div className="data-pill">Why it feels better</div>
                        <h2 className="mt-4 text-3xl font-semibold text-white">Built for faster customer decisions, not just browsing.</h2>
                        <div className="mt-6 space-y-4">
                            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                                <div className="flex items-start gap-3">
                                    <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-info" />
                                    <div>
                                        <p className="text-sm font-semibold text-white">Vehicle context stays visible</p>
                                        <p className="mt-2 text-sm text-primary-300">Model-first browsing reduces guesswork and keeps the catalog tied to the buyer's actual Mitsubishi.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                                <div className="flex items-start gap-3">
                                    <Sparkles className="mt-0.5 h-5 w-5 text-accent-info" />
                                    <div>
                                        <p className="text-sm font-semibold text-white">Quote and bundle paths are closer</p>
                                        <p className="mt-2 text-sm text-primary-300">Customers can shift from single-part inquiries into packages, estimates, and service-ready flows with less friction.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-3">
                        {quickPaths.map((path) => {
                            const Icon = path.icon;
                            return (
                                <Link key={path.title} to={path.route} className="shell-panel group px-5 py-6 transition hover:-translate-y-1">
                                    <span className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/18 bg-accent-info/10 text-accent-info">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <h3 className="mt-5 text-2xl font-semibold text-white">{path.title}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-primary-300">{path.description}</p>
                                    <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent-info group-hover:text-white">
                                        Open flow
                                        <ArrowRight className="h-4 w-4" />
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="px-4 py-10 md:px-8 xl:px-12">
                <div className="mx-auto flex max-w-[1700px] flex-col gap-6 rounded-[34px] border border-white/8 bg-gradient-to-r from-accent-info/10 to-accent-blue/10 px-6 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <div className="max-w-3xl">
                        <div className="data-pill">Ready to move</div>
                        <h2 className="mt-4 text-3xl font-semibold text-white">Search parts now or move directly into a customer-ready quote.</h2>
                        <p className="mt-3 text-sm leading-relaxed text-primary-300">
                            The public catalog, estimate flow, and service-order path now behave like one connected experience.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Link to="/catalog" className="btn btn-primary">
                            Browse parts
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to="/estimate" className="btn btn-secondary">
                            Build estimate
                            <Calculator className="h-4 w-4" />
                        </Link>
                        <a href="tel:+639171234567" className="btn btn-secondary">
                            Call store
                            <PhoneCall className="h-4 w-4" />
                        </a>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default PublicHome;
