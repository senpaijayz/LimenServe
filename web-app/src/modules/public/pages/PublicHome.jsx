import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Calculator, ChevronRight, PhoneCall, Search, ShieldCheck, Store, Wrench } from 'lucide-react';
import storefrontImage from '../../../assets/homepage/limen-storefront-optimized.jpg';
import monteroImage from '../../../assets/homepage/montero-optimized.jpg';
import tritonImage from '../../../assets/homepage/triton-optimized.jpg';
import xforceImage from '../../../assets/homepage/xforce-optimized.jpg';
import destinatorImage from '../../../assets/homepage/destinator-optimized.jpg';

const vehicleShowcase = [
  {
    name: 'Montero Sport',
    label: 'SUV Best Seller',
    caption: 'Brake lines, maintenance kits, filters, and cooling parts for everyday SUV service work.',
    image: monteroImage,
    panelClass: 'bg-[radial-gradient(circle_at_top,#ffffff_0%,#ece5d8_58%,#d8cebd_100%)]',
    imageClass: 'mix-blend-multiply scale-[1.08]',
    accentClass: 'bg-[#c1121f]',
  },
  {
    name: 'Triton',
    label: 'Pickup Ready',
    caption: 'Suspension lines, hard-wearing maintenance items, and work-ready replacement parts.',
    image: tritonImage,
    panelClass: 'bg-[radial-gradient(circle_at_top,#475569_0%,#111827_58%,#020617_100%)]',
    imageClass: 'mix-blend-screen scale-[1.05]',
    accentClass: 'bg-[#f97316]',
  },
  {
    name: 'Xforce',
    label: 'Newer Model Support',
    caption: 'Fitment-led replacement items, filters, and fast quotation support for newer units.',
    image: xforceImage,
    panelClass: 'bg-[radial-gradient(circle_at_top,#ffffff_0%,#efefea_60%,#ddd9cf_100%)]',
    imageClass: 'mix-blend-multiply scale-[1.04]',
    accentClass: 'bg-[#2563eb]',
  },
  {
    name: 'Destinator',
    label: 'New Line Inquiries',
    caption: 'Fresh lineup support for quotation requests, package offers, and parts availability checks.',
    image: destinatorImage,
    panelClass: 'bg-[radial-gradient(circle_at_top,#3f3f46_0%,#111827_58%,#020617_100%)]',
    imageClass: 'mix-blend-screen scale-[1.05]',
    accentClass: 'bg-[#dc2626]',
  },
];

const featureCards = [
  {
    title: 'Shop Genuine Parts',
    description: 'Open the Mitsubishi pricelist and go straight to active part names, SKU references, and vehicle compatibility.',
    to: '/catalog',
    action: 'Browse Catalog',
    icon: Store,
  },
  {
    title: 'Request A Quotation',
    description: 'Build a clean estimate for walk-in customers, repairs, or fleet inquiries without the usual back-and-forth.',
    to: '/estimate',
    action: 'Start Estimate',
    icon: Calculator,
  },
  {
    title: 'Parts + Labor Packages',
    description: 'Surface maintenance bundles, brake work, and service-ready add-ons that help close bigger orders.',
    to: '/estimate',
    action: 'Open Packages',
    icon: Wrench,
  },
];

const stats = [
  { label: 'Quotation Support', value: 'Same-day' },
  { label: 'Popular Lines', value: 'Brakes to filters' },
  { label: 'Customer Fit', value: 'Walk-in to fleet' },
];

const PublicHome = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const handleSearch = () => {
    const query = searchQuery.trim();
    navigate(query ? `/catalog?q=${encodeURIComponent(query)}` : '/catalog');
  };

  return (
    <div className="min-h-screen bg-[#f5f5f3] pb-20 text-primary-900">
      <section className="border-b border-primary-200 bg-[#f5f5f3] px-4 pb-14 pt-24 md:px-8 xl:px-12">
        <div className="layout-container mx-auto max-w-[1600px]">
          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[34px] border border-primary-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] md:p-8 xl:p-10">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.26em] text-primary-500"
              >
                <span className="h-2 w-2 rounded-full bg-accent-danger" />
                Genuine Mitsubishi Parts
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.05 }}
                className="mt-7 max-w-4xl text-5xl font-display font-extrabold leading-[0.94] tracking-tight text-primary-950 md:text-7xl"
              >
                Find the right Mitsubishi part fast and turn it into a quotation today.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 }}
                className="mt-6 max-w-2xl text-base leading-relaxed text-primary-600 md:text-lg"
              >
                Search genuine parts, check model compatibility, and build a professional estimate from Limen Auto Parts Center for walk-in customers, repair shops, and fleet accounts.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.15 }}
                className="mt-8 flex flex-col gap-3 rounded-[28px] border border-primary-200 bg-[#faf9f6] p-3 shadow-inner sm:flex-row sm:items-center"
              >
                <div className="flex flex-1 items-center gap-3 rounded-[22px] bg-white px-4 py-3">
                  <Search className="h-5 w-5 text-primary-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                    placeholder="Search Mitsubishi part name, SKU, or model"
                    className="w-full border-none bg-transparent text-sm font-medium text-primary-900 outline-none placeholder:text-primary-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearch}
                  className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-primary-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800"
                >
                  Search Catalog
                  <ChevronRight className="h-4 w-4" />
                </button>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.2 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <Link to="/catalog" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-primary-950 bg-primary-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-800">
                  Shop Parts Now
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/estimate" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-primary-200 bg-white px-5 py-3 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-950">
                  Request A Quote
                  <Calculator className="h-4 w-4" />
                </Link>
              </motion.div>

              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {stats.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.22 + (index * 0.05) }}
                    className="rounded-[24px] border border-primary-200 bg-[#faf9f6] px-4 py-4"
                  >
                    <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-primary-400">{item.label}</p>
                    <p className="mt-3 text-lg font-display font-semibold text-primary-950">{item.value}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.45, delay: 0.12 }}
              className="grid gap-6"
            >
              <div className="overflow-hidden rounded-[34px] border border-primary-200 bg-white shadow-[0_18px_60px_rgba(15,23,42,0.08)]">
                <img src={storefrontImage} alt="Limen Auto Parts Center storefront" className="h-[360px] w-full object-cover md:h-[420px]" />
                <div className="border-t border-primary-200 px-5 py-5">
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-primary-400">Limen Auto Parts Center</p>
                  <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">Real store support for genuine parts and quotation requests</h2>
                  <p className="mt-2 text-sm leading-relaxed text-primary-500">
                    Confirm part availability, get pricing support, and move faster from inquiry to pickup, service, or quotation approval.
                  </p>
                </div>
              </div>

              <div className="rounded-[30px] border border-primary-200 bg-primary-950 px-5 py-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-white/55">Fast-Moving Orders Start Here</p>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <div>
                    <p className="text-2xl font-display font-bold text-white">OEM</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">Genuine Mitsubishi parts focus</p>
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-white">Quote</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">Build estimates without delay</p>
                  </div>
                  <div>
                    <p className="text-2xl font-display font-bold text-white">Bundle</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/70">Parts plus labor upsell support</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-8 xl:px-12">
        <div className="layout-container mx-auto max-w-[1600px]">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Popular Mitsubishi Lines</p>
              <h2 className="mt-2 text-3xl font-display font-bold text-primary-950 md:text-4xl">Open the catalog by the vehicles your customers ask for most</h2>
              <p className="mt-3 text-sm leading-relaxed text-primary-500">
                Start with the vehicle line, then move into compatible parts, quotation-ready bundles, and service-ready recommendations.
              </p>
            </div>
            <Link to="/catalog" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-blue transition hover:text-accent-primary">
              Shop Mitsubishi catalog
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {vehicleShowcase.map((vehicle, index) => (
              <motion.article
                key={vehicle.name}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.35, delay: index * 0.05 }}
                className="overflow-hidden rounded-[30px] border border-primary-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
              >
                <div className={`relative flex h-[260px] items-center justify-center overflow-hidden p-6 ${vehicle.panelClass}`}>
                  <div className="absolute inset-x-8 bottom-5 h-10 rounded-full bg-black/20 blur-2xl" />
                  <div className={`absolute left-5 top-5 h-2.5 w-16 rounded-full ${vehicle.accentClass}`} />
                  <img src={vehicle.image} alt={vehicle.name} className={`relative z-10 h-full w-full object-contain ${vehicle.imageClass}`} />
                </div>
                <div className="border-t border-primary-200 px-5 py-5">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">{vehicle.label}</p>
                  <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{vehicle.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-500">{vehicle.caption}</p>
                  <Link to={`/catalog?q=${encodeURIComponent(vehicle.name)}`} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-950">
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
        <div className="layout-container mx-auto max-w-[1600px] rounded-[36px] border border-primary-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.06)] md:p-8">
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Why Buyers Stay On This Page</p>
              <h2 className="mt-2 text-3xl font-display font-bold text-primary-950 md:text-4xl">Built to help customers buy, not just browse.</h2>
              <p className="mt-4 text-sm leading-relaxed text-primary-500">
                The homepage now pushes customers into the actions that matter most: finding parts, requesting a quotation, and adding higher-value package offers.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3 rounded-[22px] border border-primary-200 bg-[#faf9f6] px-4 py-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-primary" />
                  <div>
                    <p className="text-sm font-semibold text-primary-950">Current pricing and vehicle fitment</p>
                    <p className="mt-1 text-sm text-primary-500">Customers can move from search to compatible parts without guessing which line to open next.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[22px] border border-primary-200 bg-[#faf9f6] px-4 py-4">
                  <Store className="mt-0.5 h-5 w-5 text-accent-primary" />
                  <div>
                    <p className="text-sm font-semibold text-primary-950">Upsell-ready bundles and packages</p>
                    <p className="mt-1 text-sm text-primary-500">Package recommendations help turn single-item inquiries into bigger parts and labor orders.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-3">
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <Link
                    key={feature.title}
                    to={feature.to}
                    className="group rounded-[28px] border border-primary-200 bg-[#faf9f6] p-5 transition hover:border-primary-300 hover:bg-white hover:shadow-[0_16px_40px_rgba(15,23,42,0.06)]"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-[18px] border border-primary-200 bg-white text-accent-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-xl font-display font-semibold text-primary-950">{feature.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-primary-500">{feature.description}</p>
                    <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary-950">
                      {feature.action}
                      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-14 md:px-8 xl:px-12">
        <div className="layout-container mx-auto max-w-[1600px] rounded-[34px] border border-primary-200 bg-primary-950 px-6 py-8 text-white md:px-8 md:py-10">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/50">Ready To Order</p>
              <h2 className="mt-2 text-3xl font-display font-bold md:text-4xl">Search parts now or move straight into a quotation request.</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/72">
                Give customers a cleaner buying path from first inquiry to final quote, with the catalog and estimate flow already connected.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/catalog" className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-white px-5 py-3 text-sm font-semibold text-primary-950 transition hover:bg-primary-100">
                Browse Catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/estimate" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Request A Quote
                <Calculator className="h-4 w-4" />
              </Link>
              <a href="tel:+639155225629" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Call Store
                <PhoneCall className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PublicHome;
