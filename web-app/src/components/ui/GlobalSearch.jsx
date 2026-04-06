import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    ArrowRight,
    Box,
    Command,
    FileText,
    LayoutDashboard,
    Package,
    Plus,
    Search,
    ShoppingCart,
    Sparkles,
    Wrench,
    X,
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import useDataStore from '../../store/useDataStore';
import useExperienceStore from '../../store/useExperienceStore';
import { listEstimates } from '../../services/estimatesApi';
import { listPosSales } from '../../services/posApi';
import { useAuth } from '../../context/useAuth';

const iconMap = {
    dashboard: LayoutDashboard,
    inventory: Package,
    pos: ShoppingCart,
    quotation: FileText,
    services: Wrench,
    stockroom: Box,
    command: Sparkles,
    product: Package,
    sale: ShoppingCart,
    estimate: FileText,
    public: Search,
};

const publicPages = [
    {
        id: 'page-home',
        type: 'page',
        title: 'Homepage',
        subtitle: 'Showroom entry and featured Mitsubishi lines.',
        keywords: ['home', 'landing', 'showroom'],
        route: '/',
        iconKey: 'public',
    },
    {
        id: 'page-catalog',
        type: 'page',
        title: 'Catalog',
        subtitle: 'Search genuine Mitsubishi parts by part name, SKU, or vehicle.',
        keywords: ['catalog', 'parts', 'sku', 'vehicles'],
        route: '/catalog',
        iconKey: 'product',
    },
    {
        id: 'page-estimate',
        type: 'page',
        title: 'Get Estimate',
        subtitle: 'Build a parts-and-service quotation or retrieve a saved quote.',
        keywords: ['estimate', 'quote', 'quotation'],
        route: '/estimate',
        iconKey: 'estimate',
    },
    {
        id: 'page-service-orders',
        type: 'page',
        title: 'Service Orders',
        subtitle: 'Understand the service workflow from intake to completion.',
        keywords: ['service', 'repair', 'workflow'],
        route: '/service-orders',
        iconKey: 'services',
    },
];

const adminPages = [
    {
        id: 'page-dashboard',
        type: 'page',
        title: 'Dashboard',
        subtitle: 'Open the operations overview and KPI surface.',
        keywords: ['dashboard', 'overview', 'operations'],
        route: '/dashboard',
        iconKey: 'dashboard',
    },
    {
        id: 'page-inventory',
        type: 'page',
        title: 'Inventory',
        subtitle: 'Review parts stock, quantities, and availability.',
        keywords: ['inventory', 'stock', 'products'],
        route: '/inventory',
        iconKey: 'inventory',
    },
    {
        id: 'page-pos',
        type: 'page',
        title: 'Point of Sale',
        subtitle: 'Open the checkout flow and sales terminal.',
        keywords: ['pos', 'sale', 'checkout'],
        route: '/pos',
        iconKey: 'pos',
    },
    {
        id: 'page-quotation',
        type: 'page',
        title: 'Quotation',
        subtitle: 'Build and revise estimates for customers.',
        keywords: ['quote', 'quotation', 'estimate'],
        route: '/quotation',
        iconKey: 'quotation',
    },
    {
        id: 'page-services',
        type: 'page',
        title: 'Service Orders',
        subtitle: 'Track and update workshop requests.',
        keywords: ['services', 'service orders', 'repairs'],
        route: '/services',
        iconKey: 'services',
    },
    {
        id: 'page-stockroom',
        type: 'page',
        title: '3D Stockroom',
        subtitle: 'Navigate the cinematic store model.',
        keywords: ['stockroom', '3d', 'locator'],
        route: '/stockroom',
        iconKey: 'stockroom',
    },
];

const routeActions = {
    public: [
        {
            id: 'action-search-catalog',
            type: 'action',
            title: 'Search the catalog',
            subtitle: 'Jump into Mitsubishi parts browsing.',
            keywords: ['catalog', 'search', 'parts'],
            route: '/catalog',
            iconKey: 'command',
        },
        {
            id: 'action-start-estimate',
            type: 'action',
            title: 'Start a new estimate',
            subtitle: 'Open the guided quotation flow.',
            keywords: ['estimate', 'quote'],
            route: '/estimate',
            iconKey: 'estimate',
        },
    ],
    '/dashboard': [
        {
            id: 'action-low-stock',
            type: 'action',
            title: 'View low stock items',
            subtitle: 'Open the inventory queue filtered for urgent replenishment.',
            keywords: ['low stock', 'inventory', 'replenishment'],
            route: '/inventory?filter=low-stock',
            iconKey: 'inventory',
        },
        {
            id: 'action-new-quote',
            type: 'action',
            title: 'Create quotation draft',
            subtitle: 'Open the quotation workspace immediately.',
            keywords: ['quote', 'quotation', 'estimate'],
            route: '/quotation',
            iconKey: 'quotation',
        },
    ],
    '/inventory': [
        {
            id: 'action-open-stockroom',
            type: 'action',
            title: 'Open 3D stockroom',
            subtitle: 'Switch to the locator experience for mapped shelf locations.',
            keywords: ['stockroom', 'locator', '3d'],
            route: '/stockroom',
            iconKey: 'stockroom',
        },
    ],
    '/quotation': [
        {
            id: 'action-resume-estimate',
            type: 'action',
            title: 'Resume public estimate flow',
            subtitle: 'Open the public quotation journey to validate the customer path.',
            keywords: ['estimate', 'public', 'quote'],
            route: '/estimate',
            iconKey: 'estimate',
        },
    ],
    '/services': [
        {
            id: 'action-open-service-queue',
            type: 'action',
            title: 'Review active service queue',
            subtitle: 'Jump back to the top of the workshop queue.',
            keywords: ['service', 'queue', 'workshop'],
            route: '/services',
            iconKey: 'services',
        },
    ],
};

const groupOrder = ['recent', 'actions', 'pages', 'entities'];
const groupLabels = {
    recent: 'Recent',
    actions: 'Actions',
    pages: 'Pages',
    entities: 'Entities',
};

function normalizeText(value) {
    return String(value || '').toLowerCase().trim();
}

function getMatches(command, query) {
    const haystack = [
        command.title,
        command.subtitle,
        ...(command.keywords || []),
    ].join(' ');

    return normalizeText(haystack).includes(normalizeText(query));
}

const GlobalSearch = ({ compact = false }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const { products, fetchProducts } = useDataStore();
    const {
        isCommandOpen,
        recentItems,
        recentSearches,
        setCommandOpen,
        pushRecentItem,
        pushRecentSearch,
    } = useExperienceStore();

    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [sales, setSales] = useState([]);
    const [estimates, setEstimates] = useState([]);
    const [isLoadingSources, setIsLoadingSources] = useState(false);
    const inputRef = useRef(null);

    const deferredQuery = useDeferredValue(query);

    useEffect(() => {
        const handleShortcut = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                setCommandOpen(true);
            }

            if (event.key === 'Escape') {
                setCommandOpen(false);
            }
        };

        document.addEventListener('keydown', handleShortcut);
        return () => document.removeEventListener('keydown', handleShortcut);
    }, [setCommandOpen]);

    useEffect(() => {
        if (!isCommandOpen) {
            return;
        }

        setQuery('');
        setSelectedIndex(0);
        window.setTimeout(() => inputRef.current?.focus(), 40);

        let isMounted = true;

        const loadSources = async () => {
            setIsLoadingSources(true);

            try {
                await fetchProducts();

                if (!isAuthenticated) {
                    return;
                }

                const [salesResponse, estimateResponse] = await Promise.all([
                    listPosSales({ limit: 5, page: 1 }),
                    listEstimates('', 5),
                ]);

                if (!isMounted) {
                    return;
                }

                setSales(salesResponse?.sales ?? []);
                setEstimates(estimateResponse ?? []);
            } catch (error) {
                if (!isMounted) {
                    return;
                }

                setSales([]);
                setEstimates([]);
            } finally {
                if (isMounted) {
                    setIsLoadingSources(false);
                }
            }
        };

        void loadSources();

        return () => {
            isMounted = false;
        };
    }, [fetchProducts, isAuthenticated, isCommandOpen]);

    const pageCommands = useMemo(
        () => [...publicPages, ...(isAuthenticated ? adminPages : [])],
        [isAuthenticated],
    );

    const actionCommands = useMemo(() => {
        const basePath = `/${location.pathname.split('/')[1]}`;
        const contextual = routeActions[location.pathname] || routeActions[basePath] || (isAuthenticated ? routeActions['/dashboard'] : routeActions.public);
        return contextual;
    }, [isAuthenticated, location.pathname]);

    const entityCommands = useMemo(() => {
        const productItems = products.slice(0, 25).map((product) => ({
            id: `product-${product.id}`,
            type: 'entity',
            entityType: 'product',
            title: product.name,
            subtitle: `${product.sku} • ${product.category} • ${formatCurrency(product.price)}`,
            keywords: [product.sku, product.category, product.model, 'product'],
            route: isAuthenticated ? '/inventory' : `/catalog?q=${encodeURIComponent(product.name)}`,
            iconKey: 'product',
        }));

        const saleItems = isAuthenticated
            ? sales.map((sale) => ({
                id: `sale-${sale.sale_id}`,
                type: 'entity',
                entityType: 'sale',
                title: sale.customer_name || 'Walk-in sale',
                subtitle: `${sale.transaction_number} • ${formatCurrency(Number(sale.total_amount ?? 0))}`,
                keywords: [sale.transaction_number, sale.customer_name, 'sale'],
                route: '/reports/sales',
                iconKey: 'sale',
            }))
            : [];

        const estimateItems = isAuthenticated
            ? estimates.map((estimate) => ({
                id: `estimate-${estimate.id}`,
                type: 'entity',
                entityType: 'estimate',
                title: estimate.estimate_number || 'Draft quotation',
                subtitle: `${estimate.customer_name || 'Customer'} • ${formatCurrency(Number(estimate.grand_total ?? 0))}`,
                keywords: [estimate.estimate_number, estimate.customer_name, 'quote', 'estimate'],
                route: '/quotation',
                iconKey: 'estimate',
            }))
            : [];

        return [...productItems, ...estimateItems, ...saleItems];
    }, [estimates, isAuthenticated, products, sales]);

    const recentCommands = useMemo(
        () => recentItems.map((item) => ({ ...item, group: 'recent' })),
        [recentItems],
    );

    const queryTrimmed = deferredQuery.trim();

    const groupedResults = useMemo(() => {
        const groups = {
            recent: [],
            actions: [],
            pages: [],
            entities: [],
        };

        if (!queryTrimmed) {
            groups.recent = recentCommands;
            groups.actions = actionCommands.slice(0, 4);
            groups.pages = pageCommands.slice(0, 5);
            return groups;
        }

        groups.recent = recentCommands.filter((item) => getMatches(item, queryTrimmed)).slice(0, 4);
        groups.actions = actionCommands.filter((item) => getMatches(item, queryTrimmed)).slice(0, 4);
        groups.pages = pageCommands.filter((item) => getMatches(item, queryTrimmed)).slice(0, 6);
        groups.entities = entityCommands.filter((item) => getMatches(item, queryTrimmed)).slice(0, 8);
        return groups;
    }, [actionCommands, entityCommands, pageCommands, queryTrimmed, recentCommands]);

    const flattenedResults = useMemo(
        () => groupOrder.flatMap((group) => groupedResults[group]),
        [groupedResults],
    );

    useEffect(() => {
        setSelectedIndex(0);
    }, [queryTrimmed, isCommandOpen]);

    const handleSelect = (item) => {
        if (queryTrimmed) {
            pushRecentSearch(queryTrimmed);
        }

        pushRecentItem({
            id: item.id,
            type: item.type,
            title: item.title,
            subtitle: item.subtitle,
            keywords: item.keywords,
            route: item.route,
            iconKey: item.iconKey,
        });

        setCommandOpen(false);
        navigate(item.route);
    };

    const handleInputKeyDown = (event) => {
        if (!flattenedResults.length && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
            event.preventDefault();
            return;
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSelectedIndex((current) => Math.min(current + 1, flattenedResults.length - 1));
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSelectedIndex((current) => Math.max(current - 1, 0));
        }

        if (event.key === 'Enter' && flattenedResults[selectedIndex]) {
            event.preventDefault();
            handleSelect(flattenedResults[selectedIndex]);
        }
    };

    const triggerClasses = compact
        ? 'w-full justify-start'
        : 'w-[300px] min-w-[300px] justify-start';

    return (
        <>
            <button
                type="button"
                onClick={() => setCommandOpen(true)}
                className={`relative inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.05] px-4 py-3 text-left text-sm text-primary-300 transition hover:border-accent-info/25 hover:bg-white/[0.08] ${triggerClasses}`}
            >
                <Search className="h-4 w-4 text-primary-500" />
                <span className="truncate">Search pages, parts, quotes, and quick actions</span>
                {!compact && (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] uppercase tracking-[0.18em] text-primary-500">
                        <Command className="h-3 w-3" />K
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isCommandOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[70] flex items-start justify-center bg-black/72 px-4 pt-[12vh] backdrop-blur-xl"
                        onClick={() => setCommandOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.97, y: 18 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.97, y: 18 }}
                            transition={{ duration: 0.18 }}
                            className="w-full max-w-4xl overflow-hidden rounded-[32px] border border-white/10 bg-primary-950/95 shadow-[0_36px_110px_rgba(2,8,23,0.72)]"
                            onClick={(event) => event.stopPropagation()}
                        >
                            <div className="flex items-center gap-4 border-b border-white/8 px-5 py-4">
                                <Search className="h-5 w-5 text-primary-500" />
                                <input
                                    ref={inputRef}
                                    value={query}
                                    onChange={(event) => setQuery(event.target.value)}
                                    onKeyDown={handleInputKeyDown}
                                    placeholder={isAuthenticated ? 'Search the workspace, products, quotations, and actions' : 'Search pages, catalog items, and quote flows'}
                                    className="flex-1 bg-transparent text-base text-white placeholder:text-primary-500 outline-none"
                                />
                                <div className="hidden items-center gap-2 md:flex">
                                    {recentSearches.slice(0, 2).map((recentQuery) => (
                                        <button
                                            key={recentQuery}
                                            type="button"
                                            onClick={() => setQuery(recentQuery)}
                                            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-primary-300"
                                        >
                                            {recentQuery}
                                        </button>
                                    ))}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setCommandOpen(false)}
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-primary-300 transition hover:text-white"
                                    aria-label="Close command center"
                                >
                                    <X className="h-4 w-4" />
                                </button>
                            </div>

                            <div className="grid min-h-[420px] md:grid-cols-[minmax(0,1fr)_300px]">
                                <div className="max-h-[70vh] overflow-y-auto px-4 py-4">
                                    {!queryTrimmed && (
                                        <div className="mb-4 rounded-[26px] border border-accent-info/15 bg-gradient-to-r from-accent-info/10 to-accent-blue/10 px-5 py-5">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-400">
                                                Route-aware suggestions
                                            </p>
                                            <h2 className="mt-2 text-xl font-semibold text-white">
                                                {isAuthenticated ? 'Jump to the next operational move.' : 'Move from browse to quote with less friction.'}
                                            </h2>
                                            <p className="mt-2 text-sm text-primary-300">
                                                The command center surfaces actions based on your current route, recent visits, and available data.
                                            </p>
                                        </div>
                                    )}

                                    {groupOrder.map((groupKey) => {
                                        const items = groupedResults[groupKey];
                                        if (!items.length) {
                                            return null;
                                        }

                                        return (
                                            <div key={groupKey} className="mb-5">
                                                <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-500">
                                                    {groupLabels[groupKey]}
                                                </div>
                                                <div className="space-y-2">
                                                    {items.map((item) => {
                                                        const globalIndex = flattenedResults.findIndex((result) => result.id === item.id);
                                                        const isSelected = globalIndex === selectedIndex;
                                                        const Icon = iconMap[item.iconKey] || Search;

                                                        return (
                                                            <button
                                                                key={item.id}
                                                                type="button"
                                                                onClick={() => handleSelect(item)}
                                                                onMouseEnter={() => setSelectedIndex(globalIndex)}
                                                                className={`flex w-full items-center gap-3 rounded-[24px] border px-4 py-4 text-left transition ${isSelected
                                                                    ? 'border-accent-info/25 bg-accent-info/10'
                                                                    : 'border-white/8 bg-white/[0.03] hover:border-white/12 hover:bg-white/[0.05]'
                                                                    }`}
                                                            >
                                                                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${isSelected
                                                                    ? 'border-accent-info/25 bg-accent-info/12 text-accent-info'
                                                                    : 'border-white/10 bg-white/[0.04] text-primary-300'
                                                                    }`}
                                                                >
                                                                    <Icon className="h-4 w-4" />
                                                                </span>
                                                                <span className="min-w-0 flex-1">
                                                                    <span className="block truncate text-sm font-semibold text-white">{item.title}</span>
                                                                    <span className="mt-1 block truncate text-sm text-primary-400">{item.subtitle}</span>
                                                                </span>
                                                                {isSelected && <ArrowRight className="h-4 w-4 shrink-0 text-accent-info" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {queryTrimmed && flattenedResults.length === 0 && (
                                        <div className="flex min-h-[260px] flex-col items-center justify-center rounded-[28px] border border-dashed border-white/10 bg-white/[0.02] px-8 text-center">
                                            <Search className="h-10 w-10 text-primary-500" />
                                            <h2 className="mt-5 text-lg font-semibold text-white">No matching command found</h2>
                                            <p className="mt-2 max-w-md text-sm text-primary-400">
                                                Try a product SKU, page name, customer quote number, or route action like low stock or service queue.
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="border-l border-white/8 bg-white/[0.02] px-5 py-5">
                                    <div className="data-pill">Command center</div>
                                    <div className="mt-5 space-y-4">
                                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-500">Quick keys</p>
                                            <div className="mt-4 space-y-3 text-sm text-primary-300">
                                                <p><span className="font-semibold text-white">Ctrl/Cmd + K</span> open the palette</p>
                                                <p><span className="font-semibold text-white">Arrow keys</span> move between commands</p>
                                                <p><span className="font-semibold text-white">Enter</span> launch the selected result</p>
                                            </div>
                                        </div>

                                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-500">Recent searches</p>
                                            <div className="mt-4 flex flex-wrap gap-2">
                                                {recentSearches.length > 0 ? recentSearches.map((recentQuery) => (
                                                    <button
                                                        key={recentQuery}
                                                        type="button"
                                                        onClick={() => setQuery(recentQuery)}
                                                        className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-primary-300 transition hover:text-white"
                                                    >
                                                        {recentQuery}
                                                    </button>
                                                )) : (
                                                    <p className="text-sm text-primary-400">
                                                        Search history appears here after you use the command center.
                                                    </p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="rounded-[24px] border border-white/8 bg-white/[0.03] p-4">
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-500">Data sources</p>
                                            <div className="mt-4 space-y-3 text-sm text-primary-300">
                                                <p>{products.length} catalog products indexed for quick matching.</p>
                                                {isAuthenticated && <p>{estimates.length} recent quotations and {sales.length} recent sales available.</p>}
                                                {isLoadingSources && <p className="text-primary-500">Refreshing searchable data...</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between border-t border-white/8 px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-primary-500">
                                <span className="flex items-center gap-2">
                                    <Plus className="h-3.5 w-3.5 text-accent-info" />
                                    Actions, pages, entities, and recents in one layer
                                </span>
                                <span>LIMEN command palette</span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default GlobalSearch;
