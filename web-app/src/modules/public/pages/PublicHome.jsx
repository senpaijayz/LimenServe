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
    caption: 'SUV maintenance, filters, cooling, and brake-related lines.',
    image: monteroImage,
  },
  {
    name: 'Triton',
    caption: 'Pickup parts, suspension support, lighting, and hard-working service items.',
    image: tritonImage,
  },
  {
    name: 'Xforce',
    caption: 'Modern crossover parts with fitment-first browsing for newer units.',
    image: xforceImage,
  },
  {
    name: 'Destinator',
    caption: 'Lineup-led visual browsing that makes the site feel like a Mitsubishi parts source.',
    image: destinatorImage,
  },
];

const featureCards = [
  {
    title: 'Updated Parts Catalog',
    description: 'Browse live Mitsubishi pricing, part names, SKU references, and model compatibility from the current pricelist.',
    to: '/catalog',
    action: 'Open Catalog',
    icon: Store,
  },
  {
    title: 'Guided Estimate Flow',
    description: 'Move phase by phase through customer details, vehicle selection, parts, services, and smart package review.',
    to: '/estimate',
    action: 'Build Estimate',
    icon: Calculator,
  },
  {
    title: 'Service-Ready Recommendations',
    description: 'Matched bundles, labor suggestions, and package upsells surface around the selected Mitsubishi product.',
    to: '/service-orders',
    action: 'See Services',
    icon: Wrench,
  },
];

const stats = [
  { label: 'Genuine Mitsubishi focus', value: 'OEM-first' },
  { label: 'Estimate flow', value: 'Phase-based' },
  { label: 'Vehicle browsing', value: 'Model-aware' },
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
                Mitsubishi Parts Center
              </motion.div>

              <motion.h1
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.05 }}
                className="mt-7 max-w-4xl text-5xl font-display font-extrabold leading-[0.94] tracking-tight text-primary-950 md:text-7xl"
              >
                Genuine Mitsubishi parts with a storefront feel, not a generic template.
              </motion.h1>

              <motion.p
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, delay: 0.1 }}
                className="mt-6 max-w-2xl text-base leading-relaxed text-primary-600 md:text-lg"
              >
                Limen Auto Parts Center helps drivers, repair shops, and fleet buyers find the right Mitsubishi parts, open vehicle-matched bundles, and move into a guided estimate without getting lost in one long scrolling screen.
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
                  Browse Pricelist
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/estimate" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-primary-200 bg-white px-5 py-3 text-sm font-semibold text-primary-700 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-950">
                  Build Estimate
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
                  <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-primary-400">Storefront</p>
                  <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">Built around the real Limen Auto Parts identity</h2>
                  <p className="mt-2 text-sm leading-relaxed text-primary-500">
                    The homepage now starts from the actual shop, then leads customers into catalog search, vehicle-first shopping, and estimate building.
                  </p>
                </div>
              </div>

              <div className="rounded-[30px] border border-primary-200 bg-primary-950 px-5 py-5 text-white shadow-[0_18px_50px_rgba(15,23,42,0.18)]">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.24em] text-white/55">Why this page converts better</p>
                <div className="mt-4 space-y-3 text-sm leading-relaxed text-white/78">
                  <p>It looks like a Mitsubishi parts business, not a software demo.</p>
                  <p>It uses real vehicle visuals and the actual storefront before asking the user to browse or estimate.</p>
                  <p>It pushes customers into the two highest-value actions immediately: catalog search and guided quotation.</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Vehicle Lineup</p>
              <h2 className="mt-2 text-3xl font-display font-bold text-primary-950 md:text-4xl">Mitsubishi lineup visuals that make the website feel automotive</h2>
              <p className="mt-3 text-sm leading-relaxed text-primary-500">
                These vehicle blocks support the catalog and estimate experience by making the web feel connected to real Mitsubishi owners, parts, and service work.
              </p>
            </div>
            <Link to="/catalog" className="inline-flex items-center gap-2 text-sm font-semibold text-accent-blue transition hover:text-accent-primary">
              Open Mitsubishi catalog
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
                <div className="flex h-[240px] items-center justify-center bg-[#f4f4f1] p-5">
                  <img src={vehicle.image} alt={vehicle.name} className="h-full w-full object-contain" />
                </div>
                <div className="border-t border-primary-200 px-5 py-5">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[0.22em] text-primary-400">Featured Vehicle</p>
                  <h3 className="mt-2 text-xl font-display font-semibold text-primary-950">{vehicle.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-500">{vehicle.caption}</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-primary-400">Store Strength</p>
              <h2 className="mt-2 text-3xl font-display font-bold text-primary-950 md:text-4xl">A homepage that sells confidence before the customer even opens the catalog</h2>
              <p className="mt-4 text-sm leading-relaxed text-primary-500">
                The layout now uses solid surfaces, real imagery, and direct automotive language instead of floating gradients. That keeps the design aligned with parts, service, and dealership-adjacent trust.
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3 rounded-[22px] border border-primary-200 bg-[#faf9f6] px-4 py-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-accent-primary" />
                  <div>
                    <p className="text-sm font-semibold text-primary-950">Genuine parts positioning</p>
                    <p className="mt-1 text-sm text-primary-500">The messaging stays focused on OEM trust, current pricing, and Mitsubishi-specific fitment.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-[22px] border border-primary-200 bg-[#faf9f6] px-4 py-4">
                  <Store className="mt-0.5 h-5 w-5 text-accent-primary" />
                  <div>
                    <p className="text-sm font-semibold text-primary-950">Storefront-led brand identity</p>
                    <p className="mt-1 text-sm text-primary-500">The real Limen Auto Parts Center photo now anchors the brand immediately.</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-white/50">Ready to browse</p>
              <h2 className="mt-2 text-3xl font-display font-bold md:text-4xl">Open the catalog or start a phase-by-phase quote now.</h2>
              <p className="mt-3 text-sm leading-relaxed text-white/72">
                The catalog, vehicle-first recommendations, and public estimate flow are already connected. Customers can search parts, select a Mitsubishi, and move directly into quotations.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link to="/catalog" className="inline-flex items-center justify-center gap-2 rounded-[22px] bg-white px-5 py-3 text-sm font-semibold text-primary-950 transition hover:bg-primary-100">
                Browse Catalog
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/estimate" className="inline-flex items-center justify-center gap-2 rounded-[22px] border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">
                Build Estimate
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
