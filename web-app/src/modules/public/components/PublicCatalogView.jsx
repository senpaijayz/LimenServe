import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  ShoppingCart,
  ChevronRight,
  X,
  LayoutGrid,
  Check,
  Award,
  ArrowUpDown,
  ChevronLeft,
  ChevronDown,
  Sparkles,
  CarFront,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Barcode from 'react-barcode';
import { formatCurrency } from '../../../utils/formatters';
import useProductCatalog from '../../../hooks/useProductCatalog';
import usePublicVehicleSelection from '../../../hooks/usePublicVehicleSelection';
import useVehiclePackages from '../../../hooks/useVehiclePackages';
import ProductPackageSuggestions from './ProductPackageSuggestions';
import PublicVehicleSelector from './PublicVehicleSelector';
import VehiclePackageShowcase from './VehiclePackageShowcase';

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: 'name-asc', label: 'A-Z' },
  { value: 'name-desc', label: 'Z-A' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
];

const GenuinePartsLabel = ({ product, compact = false, dense = false }) => {
  const labelHeight = dense ? 'h-48 sm:h-52' : compact ? 'h-56' : 'h-full min-h-[300px]';
  const barcodeWidth = dense ? 1.2 : compact ? 1.45 : 1.7;
  const barcodeHeight = dense ? 38 : compact ? 48 : 68;
  const skuTextSize = dense ? 'text-[1.55rem] sm:text-[1.75rem]' : compact ? 'text-[1.95rem]' : 'text-[2.4rem]';
  const headerLabelSize = dense ? 'text-[7px]' : compact ? 'text-[8px]' : 'text-[10px]';

  return (
    <div className={`${labelHeight} bg-[#f7f7f5] rounded-[1.35rem] border-2 border-primary-200 flex flex-col relative overflow-hidden shadow-[0_14px_34px_rgba(17,18,22,0.08)]`}>
      <div className="h-10 bg-[#17181c] flex items-center justify-between px-4 w-full shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative w-5 h-4 flex items-center justify-center">
            <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -top-[1px]" />
            <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -left-[5px] top-[3px]" />
            <div className="absolute w-[7px] h-[7px] bg-[#e60012] rotate-45 -right-[5px] top-[3px]" />
          </div>
          <span className={`${headerLabelSize} font-bold text-white leading-tight uppercase tracking-[0.18em]`}>
            Mitsubishi
            <br />
            Motors
          </span>
        </div>
        <span className="text-[10px] font-bold text-white tracking-[0.28em] uppercase">Genuine Parts</span>
        <span className="text-[9px] font-bold text-white">R</span>
      </div>

      <div className="flex justify-between items-start px-4 pt-4">
        <span className="text-[12px] text-primary-700 font-bold uppercase tracking-wide line-clamp-2">
          {product.name}
        </span>
      </div>

      <div className="px-4 pt-3 text-center">
        <span className={`${skuTextSize} font-semibold tracking-[0.18em] text-primary-900 leading-none`}>
          {product.sku || 'UNKNOWN'}
        </span>
      </div>

      <div className="flex-1 px-4 pt-5 pb-4 flex items-center justify-center">
        <div className="w-full bg-transparent px-1 py-2 flex justify-center overflow-hidden">
          <Barcode
            value={product.sku || 'UNKNOWN'}
            format="CODE128"
            width={barcodeWidth}
            height={barcodeHeight}
            fontSize={0}
            margin={0}
            displayValue={false}
            background="transparent"
            lineColor="#111216"
          />
        </div>
      </div>
    </div>
  );
};

const PublicCatalogView = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('name-asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const { vehicle, updateVehicle, clearVehicle, hasVehicle } = usePublicVehicleSelection({ syncToSearch: true });
  const { packages: vehiclePackages, loading: vehiclePackagesLoading, error: vehiclePackagesError } = useVehiclePackages(vehicle);

  const {
    products,
    categories,
    pagination,
    loading,
    error,
  } = useProductCatalog({
    page: currentPage,
    pageSize: PAGE_SIZE,
    searchQuery,
    selectedCategory,
    sortBy,
    vehicleModel: vehicle.model,
    vehicleYear: vehicle.year,
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedCategory, sortBy, vehicle.model, vehicle.year]);

  const visibleProducts = useMemo(() => products.map((product) => ({
    id: product.id,
    name: product.name,
    sku: product.sku,
    category: product.category,
    price: Number(product.price ?? 0),
    inStock: Number(product.stock ?? 0) > 0,
    model: product.model || 'Universal',
    compatibility: [product.model || 'Universal'],
    description: `Genuine Mitsubishi ${product.name} for ${product.model || vehicle.displayLabel || 'Universal'}. Engineered for exact fitment.`,
  })), [products, vehicle.displayLabel]);

  const totalCount = pagination.totalCount || 0;
  const totalPages = pagination.totalPages || 1;
  const rangeStart = totalCount === 0 ? 0 : ((pagination.page - 1) * pagination.pageSize) + 1;
  const rangeEnd = totalCount === 0 ? 0 : Math.min(pagination.page * pagination.pageSize, totalCount);
  const canGoPrev = pagination.page > 1;
  const canGoNext = pagination.page < totalPages;

  const resetFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSortBy('name-asc');
  };

  const buildEstimateHref = (packageKey = '', serviceGroup = '') => {
    const params = new URLSearchParams();
    if (vehicle.model) params.set('vehicleModel', vehicle.model);
    if (vehicle.year) params.set('vehicleYear', vehicle.year);
    if (packageKey) params.set('packageKey', packageKey);
    if (serviceGroup) params.set('serviceGroup', serviceGroup);
    return {
      pathname: '/estimate',
      search: params.toString() ? `?${params.toString()}` : '',
    };
  };

  return (
    <div className="bg-primary-50 min-h-screen relative font-sans text-primary-900">
      <div className="absolute top-0 right-0 h-[60vh] w-full bg-gradient-to-b from-white via-primary-50 to-primary-50 -z-10" />
      <div className="absolute top-[-20%] right-[-10%] w-[70vw] h-[70vw] bg-accent-blue/10 rounded-full blur-[150px] mix-blend-multiply -z-10 pointer-events-none opacity-60" />
      <div className="absolute top-[20%] left-[-10%] w-[40vw] h-[40vw] bg-accent-danger/5 rounded-full blur-[120px] mix-blend-multiply -z-10 pointer-events-none opacity-50" />

      <section className="relative pt-32 pb-10 px-4 md:px-8 xl:px-12 z-20 layout-container">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-12 mb-10 border-b border-primary-200 pb-12 relative">
            <div className="absolute bottom-0 left-0 w-1/3 h-[2px] bg-gradient-to-r from-accent-blue to-transparent" />

            <div className="max-w-3xl">
              <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 mb-6">
                <span className="w-8 h-1 bg-accent-blue" />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-primary-600 font-sans">Parts Catalog</span>
              </motion.div>
              <motion.h1 initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="text-5xl md:text-7xl font-display font-extrabold text-primary-950 tracking-tighter leading-[1.1]">
                {hasVehicle ? `Parts for your ${vehicle.displayLabel}` : 'Trusted auto parts for Mitsubishi and more'}
              </motion.h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-primary-600">
                {hasVehicle
                  ? 'Compatible parts, service packages, and bundle suggestions are now tuned to your selected vehicle.'
                  : 'Search by part name, part number, or vehicle details to browse a cleaner, customer-ready parts catalog.'}
              </p>
            </div>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="w-full md:w-[420px] shrink-0">
              <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-accent-blue to-accent-danger rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
                <div className="relative flex items-center bg-white border border-primary-200 p-1.5 rounded-xl shadow-sm">
                  <Search className="w-5 h-5 text-primary-400 ml-3" />
                  <input
                    type="text"
                    placeholder={hasVehicle ? `Search parts for ${vehicle.model}...` : 'Search by part name, part number, or vehicle...'}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    className="w-full bg-transparent border-none text-primary-900 focus:ring-0 placeholder-primary-400 px-3 py-3 outline-none"
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="p-2 hover:bg-primary-50 text-primary-500 hover:text-primary-900 rounded-lg transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>

          <PublicVehicleSelector
            vehicle={vehicle}
            onChange={updateVehicle}
            onClear={clearVehicle}
            title="Choose your vehicle before you browse"
            subtitle="Filter catalog results by model first, then unlock matched service packages and more useful bundle suggestions."
          />

          {hasVehicle && (
            <div className="mt-6 rounded-[28px] border border-accent-blue/20 bg-gradient-to-r from-accent-blue/8 via-white to-accent-primary/5 px-5 py-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-accent-blue/20 bg-white text-accent-blue shadow-sm">
                    <CarFront className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.26em] text-accent-blue/70">Vehicle context active</p>
                    <h2 className="mt-2 text-2xl font-display font-semibold text-primary-950">Compatible packages for {vehicle.displayLabel}</h2>
                    <p className="mt-2 text-sm text-primary-500">Recommended service cards and clicked-product bundles now align with the vehicle you selected.</p>
                  </div>
                </div>
                <div className="rounded-2xl border border-primary-200 bg-white/90 px-4 py-3 text-sm text-primary-500">
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-400">Selected vehicle</p>
                  <p className="mt-2 text-base font-semibold text-primary-950">{vehicle.displayLabel}</p>
                </div>
              </div>
            </div>
          )}

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-8 flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
            {categories.map((category) => (
              <button
                key={category.value}
                onClick={() => setSelectedCategory(category.value)}
                className={`whitespace-nowrap flex items-center gap-3 px-6 py-3 rounded-none text-sm font-bold tracking-wide uppercase transition-all duration-300 border-l-2 ${
                  selectedCategory === category.value
                    ? 'bg-white border-accent-primary text-accent-primary shadow-sm'
                    : 'bg-white/50 border-transparent text-primary-500 hover:text-primary-900 hover:bg-white'
                }`}
              >
                {category.label}
                <span className={`text-[10px] px-2 py-0.5 rounded-sm font-mono ${
                  selectedCategory === category.value ? 'bg-accent-primary/10 text-accent-primary' : 'bg-primary-100 text-primary-600'
                }`}>
                  {category.count}
                </span>
              </button>
            ))}
          </motion.div>
        </div>
      </section>

      <section className="px-4 md:px-8 xl:px-12 pb-32 relative z-10">
        <div className="max-w-[1600px] mx-auto space-y-6">
          {hasVehicle && (
            <VehiclePackageShowcase
              vehicle={vehicle}
              packages={vehiclePackages}
              loading={vehiclePackagesLoading}
              error={vehiclePackagesError}
              mode="catalog"
              buildBundleHref={(pkg) => buildEstimateHref(pkg.packageKey, pkg.serviceGroup)}
              title="Vehicle-first service packages"
              subtitle="Visual service-led offers tuned to the Mitsubishi you selected. Open a bundle to build it as an estimate with one click."
              emptyLabel={`No featured packages are ready for ${vehicle.displayLabel} yet.`}
            />
          )}

          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-primary-600">
              <span>
                Showing <strong className="text-primary-950">{rangeStart}-{rangeEnd}</strong> of{' '}
                <strong className="text-primary-950">{totalCount}</strong> parts
              </span>
              <p className="mt-1 text-xs uppercase tracking-[0.22em] text-primary-400">
                Page {pagination.page} of {totalPages}
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="text-xs font-bold uppercase tracking-[0.22em] text-primary-500">Sort by</label>
              <div className="relative min-w-[220px]">
                <ArrowUpDown className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-400" />
                <select
                  value={sortBy}
                  onChange={(event) => setSortBy(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-primary-200 bg-primary-50 py-3 pl-11 pr-11 text-sm font-semibold text-primary-900 outline-none transition focus:border-accent-blue focus:bg-white"
                >
                  {SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
              <div className="spinner mx-auto mb-4" />
              <h3 className="text-xl font-display font-medium text-primary-950">Loading catalog data...</h3>
            </div>
          ) : error ? (
            <div className="w-full bg-white border border-accent-danger/20 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
              <LayoutGrid className="w-20 h-20 text-accent-danger/40 mb-8" />
              <h3 className="text-3xl font-display font-bold text-primary-950 mb-3">Catalog unavailable</h3>
              <p className="text-primary-600 mb-8 max-w-md font-sans text-lg">{error}</p>
              <button onClick={resetFilters} className="btn btn-outline text-accent-primary hover:bg-accent-primary/5 hover:border-accent-primary">Reset Filters</button>
            </div>
          ) : totalCount === 0 ? (
            <div className="w-full bg-white border border-primary-200 p-24 text-center flex flex-col items-center justify-center rounded-2xl shadow-sm">
              <LayoutGrid className="w-20 h-20 text-primary-300 mb-8" />
              <h3 className="text-3xl font-display font-bold text-primary-950 mb-3">No components matched</h3>
              <p className="text-primary-600 mb-8 max-w-md font-sans text-lg">Adjust your filters or try a broader search to view more items.</p>
              <button onClick={resetFilters} className="btn btn-outline text-accent-primary hover:bg-accent-primary/5 hover:border-accent-primary">Reset Filters</button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
                {visibleProducts.map((product, index) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: index * 0.05 }}
                    onClick={() => setSelectedProduct(product)}
                  >
                    <div className="group cursor-pointer flex flex-col h-full bg-white border border-primary-200 shadow-sm relative overflow-hidden transition-all duration-500 hover:-translate-y-2 hover:shadow-xl rounded-2xl">
                      <div className="absolute bottom-0 left-0 w-full h-1 bg-accent-primary scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left z-20" />

                      <div className="relative p-4 border-b border-primary-200 bg-gradient-to-b from-white to-primary-50/80">
                        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
                          {product.inStock && (
                            <span className="bg-accent-blue text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 shadow-[0_0_15px_rgba(37,99,235,0.4)] rounded-sm">Available</span>
                          )}
                          {hasVehicle && (
                            <span className="bg-primary-950 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm">Vehicle matched</span>
                          )}
                        </div>

                        <GenuinePartsLabel product={product} compact />
                      </div>

                      <div className="p-5 flex flex-col flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold text-primary-500 uppercase tracking-wider">{product.category}</span>
                          <span className="text-xs text-primary-400 font-mono">{product.sku}</span>
                        </div>

                        <h3 className="font-display font-semibold text-lg text-primary-950 mb-2 line-clamp-2">{product.name}</h3>
                        <p className="text-sm text-primary-600 line-clamp-2 mb-4 flex-1">{product.description}</p>
                        {hasVehicle && (
                          <div className="mb-4 rounded-xl border border-primary-200 bg-primary-50/70 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-500">
                            Compatible packages ready for {vehicle.model}
                          </div>
                        )}

                        <div className="flex items-center justify-between mt-auto">
                          <div className="text-xl font-bold text-accent-blue">{formatCurrency(product.price)}</div>
                          <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-500 group-hover:bg-accent-primary group-hover:text-white transition-colors">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="mt-10 flex flex-col gap-4 rounded-2xl border border-primary-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-primary-600">
                  <span className="font-semibold text-primary-950">{totalCount}</span> total parts available
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={canGoPrev ? () => setCurrentPage((page) => Math.max(1, page - 1)) : undefined}
                    disabled={!canGoPrev}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                  >
                    <ChevronLeft className="h-4 w-4" /> Previous
                  </button>

                  {canGoNext && (
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-800"
                    >
                      See More
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={canGoNext ? () => setCurrentPage((page) => Math.min(totalPages, page + 1)) : undefined}
                    disabled={!canGoNext}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-700 transition disabled:cursor-not-allowed disabled:opacity-40 hover:border-primary-300 hover:bg-primary-50"
                  >
                    Next <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      <AnimatePresence>
        {selectedProduct && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-primary-950/40 backdrop-blur-sm sm:items-center sm:p-6"
            onClick={() => setSelectedProduct(null)}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0, y: 28 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.98, opacity: 0, y: 28 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              onClick={(event) => event.stopPropagation()}
              className="relative w-full overflow-hidden rounded-t-[2rem] border border-primary-200 bg-white shadow-2xl sm:my-6 sm:max-w-[min(88vw,1120px)] sm:rounded-3xl"
            >
              <div className="pointer-events-none flex justify-center pt-3 sm:hidden">
                <span className="h-1.5 w-14 rounded-full bg-primary-300" />
              </div>

              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-primary-600 shadow-sm backdrop-blur-sm transition-colors hover:bg-primary-100 hover:text-primary-950"
                aria-label="Close product details"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="max-h-[84dvh] overflow-y-auto sm:max-h-[86vh]">
                <div className="grid lg:grid-cols-[minmax(240px,0.82fr)_minmax(0,1.18fr)]">
                  <div className="relative flex min-h-[210px] flex-col overflow-hidden bg-gradient-to-br from-primary-50 to-white p-4 sm:p-5 lg:min-h-[250px] lg:p-6">
                    <div className="absolute inset-0 bg-grid-pattern opacity-10" />
                    <div className="relative z-10 mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-primary-500 sm:mb-6 sm:text-xs">ID: {selectedProduct.sku}</div>
                    <div className="relative z-10 flex-1">
                      <GenuinePartsLabel product={selectedProduct} dense />
                    </div>
                    <div className="relative z-10 mt-4 flex items-center gap-2 sm:mt-6">
                      <Award className="w-4 h-4 text-accent-primary" />
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-600 sm:text-xs">OEM Verified</span>
                    </div>
                  </div>

                  <div className="flex flex-col bg-white p-4 sm:p-5 lg:border-l lg:border-primary-200 lg:p-6">
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary-600">{selectedProduct.category}</span>
                      {selectedProduct.inStock && (
                        <span className="flex items-center gap-1 rounded-full bg-accent-success/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-success">
                          <Check className="w-3 h-3" /> In Stock
                        </span>
                      )}
                      {hasVehicle && (
                        <span className="rounded-full bg-accent-blue/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-blue">For {vehicle.displayLabel}</span>
                      )}
                    </div>

                    <h2 className="mb-3 pr-12 text-xl font-display font-bold leading-tight text-primary-950 sm:text-[2rem]">{selectedProduct.name}</h2>
                    <p className="mb-4 text-sm leading-relaxed text-primary-600 sm:mb-5">{selectedProduct.description} Designed to meet exact specifications and ensure optimal performance for your vehicle.</p>

                    <div className="mb-4 sm:mb-5">
                      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-primary-500">Model Compatibility</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedProduct.compatibility.map((model, index) => (
                          <span key={index} className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs text-primary-600">{model}</span>
                        ))}
                      </div>
                    </div>

                    <div className="mb-4 sm:mb-5">
                      <ProductPackageSuggestions
                        product={selectedProduct}
                        vehicleModelId={vehicle.model || selectedProduct.model}
                        vehicleContext={vehicle}
                        bundleMode="catalog"
                        buildBundleHref={(pkg) => buildEstimateHref(pkg.packageKey, pkg.serviceGroup)}
                        title="Good / Better / Best smart bundles"
                        subtitle="Pick a tier and jump straight into estimate with this vehicle and bundle already selected."
                        compact
                      />
                    </div>

                    <div className="mt-auto flex flex-col gap-3 border-t border-primary-200 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pt-5">
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.22em] text-primary-500">Unit Valuation (VAT Inc.)</p>
                        <p className="text-2xl font-display font-bold text-accent-blue sm:text-[2rem]">{formatCurrency(selectedProduct.price)}</p>
                      </div>

                      <div className="flex flex-col gap-2.5 sm:flex-row">
                        <button type="button" onClick={() => setSelectedProduct(null)} className="btn btn-secondary w-full sm:w-auto">Back to Catalog</button>
                        <Link to={buildEstimateHref()} className="btn btn-primary w-full sm:w-auto px-8" onClick={() => setSelectedProduct(null)}>
                          <ShoppingCart className="w-5 h-5" /> Calculate Quote
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default PublicCatalogView;
