import { useEffect, useState } from 'react';
import { motion as Motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
    ArrowRight,
    BatteryCharging,
    CarFront,
    Cog,
    Disc3,
    Gauge,
    PackageCheck,
    Search,
    ShieldCheck,
    Sparkles,
    Star,
    Truck,
    Wrench,
} from 'lucide-react';
import storefrontImage from '../../../assets/homepage/limen-storefront-real.jpg';
import monteroImage from '../../../assets/homepage/montero-trimmed.png';
import tritonImage from '../../../assets/homepage/triton-trimmed.png';
import xforceImage from '../../../assets/homepage/xforce-trimmed.png';
import xpanderImage from '../../../assets/homepage/xpander-trimmed.png';
import { getPublicCmsPage } from '../../../services/cmsApi';

const categoryCards = [
    { title: 'Engine Parts', description: 'Filters, timing components, gaskets, and cooling parts.', icon: Cog, query: 'engine' },
    { title: 'Brakes', description: 'Pads, rotors, brake hardware, and wear items for daily safety.', icon: Disc3, query: 'brake' },
    { title: 'Suspension', description: 'Shocks, bushings, steering links, and ride-control parts.', icon: Gauge, query: 'suspension' },
    { title: 'Electrical', description: 'Sensors, charging parts, relays, and wiring support.', icon: BatteryCharging, query: 'electrical' },
    { title: 'Body Parts', description: 'Panels, lamps, trims, mirrors, and exterior replacement parts.', icon: CarFront, query: 'body parts' },
    { title: 'Maintenance', description: 'Tune-up items and service kits for regular preventive work.', icon: Wrench, query: 'maintenance' },
];

const featuredParts = [
    {
        name: 'Montero Sport Oil Filter',
        partNo: 'ME-013307',
        price: 'PHP 1,245',
        image: monteroImage,
        catalogQuery: 'Montero Sport Oil Filter',
        vehicle: 'Montero Sport',
        note: 'Best for PMS and daily service visits',
    },
    {
        name: 'Triton Front Brake Pads',
        partNo: 'MB-699200',
        price: 'PHP 3,980',
        image: tritonImage,
        catalogQuery: 'Triton Front Brake Pads',
        vehicle: 'Triton',
        note: 'Fast-moving pickup wear-item replacement',
    },
    {
        name: 'Xforce Air Filter',
        partNo: '1500A760',
        price: 'PHP 1,760',
        image: xforceImage,
        catalogQuery: 'Xforce Air Filter',
        vehicle: 'Xforce',
        note: 'Clean intake maintenance for newer compact SUVs',
    },
    {
        name: 'Xpander Cabin Filter Set',
        partNo: '7803A167',
        price: 'PHP 2,140',
        image: xpanderImage,
        catalogQuery: 'Xpander Cabin Filter Set',
        vehicle: 'Xpander',
        note: 'Popular MPV maintenance item for family-use vehicles',
    },
];

const trustSignals = [
    {
        title: 'Genuine Parts Available',
        description: 'OEM-focused inventory for Mitsubishi and other popular vehicle lines.',
        icon: ShieldCheck,
    },
    {
        title: 'Fast Delivery in the Philippines',
        description: 'Quick quotation support and local fulfillment for urgent repair needs.',
        icon: Truck,
    },
    {
        title: 'Trusted Local Store',
        description: 'Real in-store assistance in Pasay City for fitment checks and customer support.',
        icon: PackageCheck,
    },
];

const quickStats = [
    { value: 'OEM', label: 'Genuine parts support' },
    { value: 'PH', label: 'Local delivery and pickup' },
    { value: 'Real', label: 'Store-based customer support' },
];

const supportedVehicles = ['Montero Sport', 'Triton', 'Xforce', 'Xpander', 'Mirage', 'L300'];

function getCmsSection(page, sectionType, sectionKey = '') {
    const sections = page?.sections ?? [];
    const section = sectionKey
        ? sections.find((item) => (item.sectionKey || item.section_key) === sectionKey)
        : sections.find((item) => item.sectionType === sectionType || item.section_type === sectionType);

    return section?.content || {};
}

function resolveStorefrontHeroImage(imageUrl) {
    const value = String(imageUrl || '').trim();
    if (!value || /logo/i.test(value)) {
        return storefrontImage;
    }
    return value;
}

function mergeCmsCards(fallbackCards, cmsItems = []) {
    if (!Array.isArray(cmsItems) || cmsItems.length === 0) {
        return fallbackCards;
    }

    return fallbackCards.map((card, index) => ({
        ...card,
        title: cmsItems[index]?.title || card.title,
        name: cmsItems[index]?.title || card.name,
        description: cmsItems[index]?.description || card.description,
        query: cmsItems[index]?.href?.replace('/catalog?q=', '') || card.query,
        href: cmsItems[index]?.href || card.href,
        image: cmsItems[index]?.imageUrl || card.image,
        imageAlt: cmsItems[index]?.imageAlt || card.imageAlt,
        partNo: cmsItems[index]?.partNo || card.partNo,
        price: cmsItems[index]?.price || card.price,
        vehicle: cmsItems[index]?.eyebrow || card.vehicle,
        badge: cmsItems[index]?.badge || card.badge,
        note: cmsItems[index]?.description || card.note,
        catalogQuery: cmsItems[index]?.href?.replace('/catalog?q=', '') || card.catalogQuery,
    }));
}

function mergeCmsStats(fallbackStats, cmsItems = []) {
    if (!Array.isArray(cmsItems) || cmsItems.length === 0) {
        return fallbackStats;
    }

    return fallbackStats.map((stat, index) => ({
        ...stat,
        value: cmsItems[index]?.value || stat.value,
        label: cmsItems[index]?.label || stat.label,
    }));
}

function getFeaturedPartNumber(part = {}) {
    return String(part.partNo || part.catalogQuery || part.name || '').trim();
}

function buildFeaturedPartCatalogHref(part = {}) {
    const query = getFeaturedPartNumber(part);
    return query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog';
}

function buildFeaturedPartEstimateHref(part = {}) {
    const query = getFeaturedPartNumber(part);
    return query ? `/estimate?part=${encodeURIComponent(query)}` : '/estimate';
}

const PublicHome = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [cmsPage, setCmsPage] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        let active = true;

        async function loadCmsPage() {
            try {
                const page = await getPublicCmsPage('home');
                if (active) {
                    setCmsPage(page);
                }
            } catch {
                if (active) {
                    setCmsPage(null);
                }
            }
        }

        void loadCmsPage();

        return () => {
            active = false;
        };
    }, []);

    const handleSearch = () => {
        const query = searchQuery.trim();
        navigate(query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog');
    };

    const heroCms = getCmsSection(cmsPage, 'hero', 'home-hero');
    const featureCms = getCmsSection(cmsPage, 'feature_grid', 'home-features');
    const bestSellersCms = getCmsSection(cmsPage, 'feature_grid', 'home-best-sellers');
    const trustCms = getCmsSection(cmsPage, 'feature_grid', 'home-trust-signals');
    const statsCms = getCmsSection(cmsPage, 'stats', 'home-stats');
    const ctaCms = getCmsSection(cmsPage, 'cta', 'home-cta');
    const editableCategoryCards = mergeCmsCards(categoryCards, featureCms.items);
    const editableFeaturedParts = mergeCmsCards(featuredParts, bestSellersCms.items);
    const editableTrustSignals = mergeCmsCards(trustSignals, trustCms.items);
    const editableQuickStats = mergeCmsStats(quickStats, statsCms.items);
    const storefrontHeroImage = resolveStorefrontHeroImage(heroCms.imageUrl);
    const editableVehicleTags = String(heroCms.vehicleTags || supportedVehicles.join(','))
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const editableTrustTags = String(trustCms.trustTags || 'Genuine Parts, Secure Payments, Local Store Pickup')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    const heroBadges = [
        { label: heroCms.badgeOne || 'Genuine Parts', icon: ShieldCheck, tone: 'text-accent-primary' },
        { label: heroCms.badgeTwo || 'Fast Delivery in PH', icon: Truck, tone: 'text-accent-danger' },
        { label: heroCms.badgeThree || 'Search by Vehicle', icon: CarFront, tone: 'text-accent-primary' },
    ].filter((badge) => badge.label);

    return (
        <div className="bg-white text-primary-900">
            <section className="relative overflow-hidden border-b border-primary-200 bg-[radial-gradient(circle_at_top_left,_rgba(30,58,138,0.08),_transparent_32%),radial-gradient(circle_at_top_right,_rgba(220,38,38,0.10),_transparent_28%),linear-gradient(to_bottom,_#ffffff,_#f8fafc_42%,_#ffffff)] px-4 pb-16 pt-12 md:px-8 xl:px-12">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[linear-gradient(90deg,rgba(30,58,138,0.04),transparent_24%,rgba(220,38,38,0.05))]" />
                <div className="mx-auto grid max-w-[1600px] items-stretch gap-10 xl:grid-cols-[1.02fr_0.98fr]">
                    <Motion.div
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.45 }}
                        className="flex flex-col justify-center pt-8 xl:pt-14"
                    >
                        <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">
                            <Sparkles className="h-3.5 w-3.5 text-accent-danger" />
                            {heroCms.eyebrow || 'Limen Autoparts Center'}
                        </div>

                        <h1 className="mt-6 max-w-4xl text-5xl font-extrabold leading-[0.95] text-primary-950 md:text-7xl">
                            {heroCms.title || 'Genuine and aftermarket auto parts customers can trust.'}
                        </h1>

                        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-primary-700">
                            {heroCms.subtitle || 'Search by part name, part number, or vehicle model and move straight into a cleaner quotation flow backed by a real auto parts store in Pasay City.'}
                        </p>

                        <div className="mt-8 flex flex-wrap gap-3 text-sm text-primary-600">
                            {heroBadges.map((badge) => {
                                const Icon = badge.icon;
                                return (
                                    <span key={badge.label} className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-4 py-2 shadow-sm">
                                        <Icon className={`h-4 w-4 ${badge.tone}`} />
                                        {badge.label}
                                    </span>
                                );
                            })}
                        </div>

                        <div className="mt-6 flex flex-wrap gap-2">
                            {editableVehicleTags.map((vehicle) => (
                                <span
                                    key={vehicle}
                                    className="rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
                                >
                                    {vehicle}
                                </span>
                            ))}
                        </div>

                        <div className="mt-8 rounded-2xl border border-primary-200 bg-white p-3 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                            <div className="flex flex-col gap-3 lg:flex-row">
                                <div className="flex flex-1 items-center rounded-xl border border-primary-300 bg-primary-100 px-4">
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
                                        placeholder={heroCms.searchPlaceholder || 'Search by part name, vehicle make/model/year, or part number'}
                                        className="w-full bg-transparent px-3 py-4 text-sm text-primary-900 outline-none placeholder:text-primary-500"
                                    />
                                </div>
                                <button type="button" onClick={handleSearch} className="btn btn-primary min-w-[170px]">
                                    {heroCms.searchButtonLabel || 'Search Parts'}
                                    <ArrowRight className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <Link to={heroCms.primaryCta?.href || '/catalog'} className="btn btn-primary">
                                {heroCms.primaryCta?.label || 'Shop Parts'}
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link to={heroCms.secondaryCta?.href || '/estimate'} className="btn border border-red-200 bg-red-50 text-accent-danger hover:bg-red-100">
                                {heroCms.secondaryCta?.label || 'Request a Quote'}
                            </Link>
                        </div>
                    </Motion.div>

                    <Motion.div
                        initial={{ opacity: 0, x: 24 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.45, delay: 0.1 }}
                        className="grid gap-5"
                    >
                        <div className="overflow-hidden rounded-[2rem] border border-primary-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                            <div className="relative">
                                <img src={storefrontHeroImage} alt={heroCms.imageAlt || 'Limen Auto Parts storefront'} className="h-[320px] w-full object-cover md:h-[430px]" />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-900/10 to-transparent" />
                                <div className="absolute bottom-0 left-0 right-0 px-6 pb-6">
                                    <div className="max-w-xl rounded-3xl border border-white/20 bg-slate-950/70 p-5 text-white shadow-2xl backdrop-blur-sm">
                                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/65">{heroCms.imageEyebrow || 'Pasay City flagship store'}</p>
                                        <p className="mt-3 text-2xl font-bold leading-tight">{heroCms.imageTitle || 'Real counter service, fitment checks, and faster quote turnaround for walk-in and online inquiries.'}</p>
                                    </div>
                                </div>
                            </div>
                            <div className="grid gap-4 border-t border-primary-200 bg-slate-50 px-6 py-6 sm:grid-cols-3">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">{heroCms.storeLabel || 'Store'}</p>
                                    <p className="mt-2 text-lg font-semibold text-primary-950">{heroCms.storeValue || 'Real local support'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">{heroCms.catalogLabel || 'Catalog'}</p>
                                    <p className="mt-2 text-lg font-semibold text-primary-950">{heroCms.catalogValue || 'Search by part or vehicle'}</p>
                                </div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">{heroCms.quotesLabel || 'Quotes'}</p>
                                    <p className="mt-2 text-lg font-semibold text-primary-950">{heroCms.quotesValue || 'Fast response flow'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[2rem] border border-slate-200 bg-[linear-gradient(135deg,_#0f172a,_#172554_55%,_#1e3a8a)] px-6 py-6 text-white shadow-[0_24px_50px_rgba(15,23,42,0.12)]">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">{trustCms.kicker || 'Why customers buy here'}</p>
                                    <p className="mt-3 text-2xl font-bold">{trustCms.summary || 'Reliable parts, visible pricing, and store-backed support.'}</p>
                                </div>
                                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold">
                                    <Star className="h-4 w-4 text-red-300" />
                                    {trustCms.badgeLabel || 'Serious fitment and quotation support'}
                                </div>
                            </div>
                        </div>
                    </Motion.div>
                </div>
            </section>

            <section className="px-4 py-16 md:px-8 xl:px-12">
                <div className="mx-auto max-w-[1600px]">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">{featureCms.eyebrow || 'Shop by Category'}</p>
                            <h2 className="mt-2 text-4xl font-bold text-primary-950">{featureCms.title || 'Browse fast-moving auto parts categories'}</h2>
                            <p className="mt-3 text-base leading-relaxed text-primary-600">
                                {featureCms.subtitle || 'Start with the part family customers usually ask for, then narrow by Mitsubishi model or exact part number inside the catalog.'}
                            </p>
                        </div>
                        <Link to={featureCms.ctaHref || '/catalog'} className="text-sm font-semibold text-accent-primary hover:text-accent-blueDark">
                            {featureCms.ctaLabel || 'View full catalog'}
                        </Link>
                    </div>

                    <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {editableCategoryCards.map((category, index) => {
                            const Icon = category.icon;
                            return (
                                <Motion.div
                                    key={category.title}
                                    initial={{ opacity: 0, y: 20 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true, margin: '-80px' }}
                                    transition={{ duration: 0.35, delay: index * 0.05 }}
                                >
                                    <Link
                                        to={`/catalog?q=${encodeURIComponent(category.query)}`}
                                        className="group block rounded-2xl border border-primary-200 bg-white p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)] transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_24px_50px_rgba(15,23,42,0.08)]"
                                    >
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-accent-primary">
                                            <Icon className="h-6 w-6" />
                                        </div>
                                        <h3 className="mt-5 text-xl font-bold text-primary-950">{category.title}</h3>
                                        <p className="mt-3 text-sm leading-relaxed text-primary-600">{category.description}</p>
                                        <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-primary group-hover:text-accent-blueDark">
                                            {featureCms.cardCtaLabel || 'Browse category'}
                                            <ArrowRight className="h-4 w-4" />
                                        </div>
                                    </Link>
                                </Motion.div>
                            );
                        })}
                    </div>
                </div>
            </section>

            <section className="relative overflow-hidden bg-[linear-gradient(to_bottom,_#f8fafc,_#eef2ff_40%,_#ffffff)] px-4 py-16 md:px-8 xl:px-12">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_center,_rgba(30,58,138,0.10),_transparent_58%)]" />
                <div className="mx-auto max-w-[1600px]">
                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="max-w-2xl">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-danger">{bestSellersCms.eyebrow || 'Best Sellers'}</p>
                            <h2 className="mt-2 text-4xl font-bold text-primary-950">{bestSellersCms.title || 'Featured parts anchored to real Mitsubishi vehicle lines'}</h2>
                        </div>
                    </div>

                    <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
                        {editableFeaturedParts.map((part, index) => (
                            <Motion.article
                                key={part.name}
                                initial={{ opacity: 0, y: 22 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                viewport={{ once: true, margin: '-80px' }}
                                transition={{ duration: 0.35, delay: index * 0.05 }}
                                className="overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white shadow-[0_20px_45px_rgba(15,23,42,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_60px_rgba(15,23,42,0.10)]"
                            >
                                <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),_rgba(226,232,240,0.9)_55%,_rgba(203,213,225,0.85))] px-5 pb-6 pt-5">
                                    <div className="mb-4 flex items-center justify-between">
                                        <span className="rounded-full bg-slate-900 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white">
                                            {part.vehicle}
                                        </span>
                                        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold text-red-700">
                                            {part.badge || 'Best Seller'}
                                        </span>
                                    </div>
                                    <div className="flex h-[220px] items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(135deg,_rgba(255,255,255,0.96),_rgba(241,245,249,0.92)_55%,_rgba(226,232,240,0.88))] p-4 shadow-inner">
                                        <img src={part.image} alt={part.imageAlt || part.name} className="h-full w-full object-contain drop-shadow-[0_24px_30px_rgba(15,23,42,0.18)]" />
                                    </div>
                                </div>
                                <div className="p-6">
                                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">Part No. {part.partNo}</p>
                                    <h3 className="mt-3 text-xl font-bold text-primary-950">{part.name}</h3>
                                    <p className="mt-3 text-sm leading-relaxed text-primary-600">{part.note}</p>
                                    <p className="mt-4 text-2xl font-bold text-accent-primary">{part.price}</p>
                                    <div className="mt-6 flex gap-3">
                                        <Link to={buildFeaturedPartEstimateHref(part)} className="btn btn-primary flex-1 px-4 py-3">
                                            Get Quote
                                        </Link>
                                        <Link to={buildFeaturedPartCatalogHref(part)} className="btn btn-secondary px-4 py-3">
                                            Quick View
                                        </Link>
                                    </div>
                                </div>
                            </Motion.article>
                        ))}
                    </div>
                </div>
            </section>

            <section className="px-4 py-16 md:px-8 xl:px-12">
                <div className="mx-auto grid max-w-[1600px] gap-8 xl:grid-cols-[1fr_1fr]">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-primary">{trustCms.eyebrow || 'Why customers trust Limen'}</p>
                        <h2 className="mt-2 text-4xl font-bold text-primary-950">{trustCms.title || 'Built to look credible before the customer even asks for a quote.'}</h2>
                        <div className="mt-8 space-y-4">
                            {editableTrustSignals.map((signal) => {
                                const Icon = signal.icon;
                                return (
                                    <div key={signal.title} className="flex items-start gap-4 rounded-2xl border border-primary-200 bg-white p-5 shadow-sm">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-accent-danger">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-lg font-bold text-primary-950">{signal.title}</h3>
                                            <p className="mt-2 text-sm leading-relaxed text-primary-600">{signal.description}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="rounded-[2rem] border border-primary-200 bg-white p-8 shadow-[0_24px_60px_rgba(15,23,42,0.08)]">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-accent-danger">{statsCms.title || 'Customer confidence'}</p>
                        <h3 className="mt-3 text-3xl font-bold text-primary-950">"{trustCms.body || 'Fast responses, correct fitment help, and a better quote process.'}"</h3>
                        <p className="mt-5 text-base leading-relaxed text-primary-600">
                            {trustCms.subtitle || 'Customers shopping for vehicle parts need clarity first.'}</p>

                        <div className="mt-8 grid gap-4 border-t border-primary-200 pt-6 sm:grid-cols-3">
                            {editableQuickStats.map((item) => (
                                <div key={item.label}>
                                    <p className="text-3xl font-bold text-primary-950">{item.value}</p>
                                    <p className="mt-2 text-sm text-primary-600">{item.label}</p>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 rounded-2xl border border-primary-200 bg-primary-100 p-5">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">{trustCms.trustLabel || 'Trust signals'}</p>
                            <div className="mt-4 flex flex-wrap gap-3 text-sm font-semibold text-primary-700">
                                {editableTrustTags.map((tag) => (
                                    <span key={tag} className="rounded-full border border-primary-200 bg-white px-4 py-2">{tag}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="px-4 pb-16 md:px-8 xl:px-12">
                <div className="mx-auto flex max-w-[1600px] flex-col gap-6 rounded-[2rem] bg-primary-950 px-6 py-10 text-white md:flex-row md:items-center md:justify-between md:px-10">
                    <div className="max-w-3xl">
                        <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/60">{ctaCms.eyebrow || 'Ready to order'}</p>
                        <h2 className="mt-3 text-4xl font-bold text-white">{ctaCms.title || 'Search parts now or move straight into a quote request.'}</h2>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row">
                        <Link to={ctaCms.primaryCta?.href || '/catalog'} className="btn bg-white text-primary-950 hover:bg-primary-100">
                            {ctaCms.primaryCta?.label || 'Browse Catalog'}
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link to={ctaCms.secondaryCta?.href || '/estimate'} className="btn border border-white/20 bg-red-600 text-white hover:bg-red-700">
                            {ctaCms.secondaryCta?.label || 'Request a Quote'}
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default PublicHome;
