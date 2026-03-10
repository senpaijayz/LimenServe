import { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search, X, Package, ShoppingCart, Wrench, FileText,
    BarChart3, Users, Box, LayoutDashboard, ArrowRight, Command
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import useDataStore from '../../store/useDataStore';

const searchableOrders = [
    { id: 'SVC-001', name: 'Juan Dela Cruz - Oil Change', status: 'in_progress', type: 'service' },
    { id: 'SVC-002', name: 'Maria Santos - Brake Replacement', status: 'pending', type: 'service' },
    { id: 'SVC-003', name: 'Pedro Reyes - Engine Tune-up', status: 'completed', type: 'service' },
];

const searchablePages = [
    { id: 'nav-dash', name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, type: 'page' },
    { id: 'nav-inv', name: 'Inventory Management', path: '/inventory', icon: Package, type: 'page' },
    { id: 'nav-pos', name: 'Point of Sale', path: '/pos', icon: ShoppingCart, type: 'page' },
    { id: 'nav-quote', name: 'Cost Estimation & Quotation', path: '/quotation', icon: FileText, type: 'page' },
    { id: 'nav-svc', name: 'Service Orders', path: '/services', icon: Wrench, type: 'page' },
    { id: 'nav-stock', name: '3D Stockroom Viewer', path: '/stockroom', icon: Box, type: 'page' },
    { id: 'nav-reports', name: 'Reports & Analytics', path: '/reports', icon: BarChart3, type: 'page' },
    { id: 'nav-users', name: 'User Management', path: '/users', icon: Users, type: 'page' },
];

const typeLabels = {
    product: 'Products',
    service: 'Service Orders',
    page: 'Pages',
};

const typeIcons = {
    product: Package,
    service: Wrench,
    page: LayoutDashboard,
};

/**
 * GlobalSearch
 * Command-palette style global search with keyboard navigation
 */
const GlobalSearch = () => {
    const navigate = useNavigate();
    const { products: storeProducts } = useDataStore();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const containerRef = useRef(null);

    // Filtered results
    const results = useMemo(() => {
        if (!query.trim()) return [];

        const searchableProducts = storeProducts.map(p => ({
            id: `p${p.id}`,
            name: p.name,
            sku: p.sku,
            price: p.price,
            category: p.category,
            model: p.model,
            type: 'product',
        }));

        const q = query.toLowerCase();
        const products = searchableProducts.filter(p =>
            p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || (p.model && p.model.toLowerCase().includes(q))
        ).slice(0, 5);

        const orders = searchableOrders.filter(o =>
            o.name.toLowerCase().includes(q) || o.id.toLowerCase().includes(q)
        ).slice(0, 3);

        const pages = searchablePages.filter(p =>
            p.name.toLowerCase().includes(q)
        ).slice(0, 4);

        return [...pages, ...products, ...orders];
    }, [query]);

    // Keyboard shortcut to open (Ctrl+K)
    useEffect(() => {
        const handleKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, []);

    // Focus input when opened
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 50);
            setQuery('');
            setSelectedIndex(0);
        }
    }, [isOpen]);

    // Handle keyboard navigation
    const handleKeyDown = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter' && results[selectedIndex]) {
            handleSelect(results[selectedIndex]);
        }
    };

    // Handle selection
    const handleSelect = (item) => {
        setIsOpen(false);
        if (item.type === 'page') {
            navigate(item.path);
        } else if (item.type === 'product') {
            navigate('/inventory');
        } else if (item.type === 'service') {
            navigate('/services');
        }
    };

    // Reset selectedIndex when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    // Group results by type
    const groupedResults = useMemo(() => {
        const groups = {};
        results.forEach(item => {
            if (!groups[item.type]) groups[item.type] = [];
            groups[item.type].push(item);
        });
        return groups;
    }, [results]);

    return (
        <>
            {/* Search Trigger */}
            <button
                onClick={() => setIsOpen(true)}
                className="relative flex items-center gap-2 w-64 pl-10 pr-4 py-2 bg-primary-800 border border-primary-600 rounded-lg text-sm text-primary-500 hover:border-primary-500 transition-colors cursor-pointer"
            >
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary-500" />
                <span>Search products, orders...</span>
                <kbd className="ml-auto flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-700 rounded text-[10px] font-mono text-primary-400 border border-primary-600">
                    <Command className="w-2.5 h-2.5" />K
                </kbd>
            </button>

            {/* Search Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-start justify-center pt-[15vh]"
                        onClick={() => setIsOpen(false)}
                    >
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            transition={{ duration: 0.15 }}
                            ref={containerRef}
                            className="w-full max-w-xl bg-primary-900 border border-primary-700 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Search Input */}
                            <div className="flex items-center gap-3 px-4 border-b border-primary-700">
                                <Search className="w-5 h-5 text-primary-500 flex-shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Search products, orders, pages..."
                                    className="flex-1 py-4 bg-transparent text-primary-100 placeholder-primary-500 text-base focus:outline-none"
                                />
                                {query && (
                                    <button onClick={() => setQuery('')} className="p-1 rounded-md hover:bg-primary-700 text-primary-500">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                                <kbd className="px-2 py-1 bg-primary-800 rounded text-xs font-mono text-primary-500 border border-primary-700">
                                    ESC
                                </kbd>
                            </div>

                            {/* Results */}
                            <div className="max-h-[400px] overflow-y-auto">
                                {query.trim() && results.length === 0 && (
                                    <div className="text-center py-12 px-4">
                                        <Search className="w-10 h-10 text-primary-700 mx-auto mb-3" />
                                        <p className="text-sm text-primary-500">No results found for "{query}"</p>
                                        <p className="text-xs text-primary-600 mt-1">Try searching for a product name, SKU, or page</p>
                                    </div>
                                )}

                                {!query.trim() && (
                                    <div className="px-4 py-6">
                                        <p className="text-xs font-semibold text-primary-500 uppercase tracking-wider mb-3">Quick Navigation</p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {searchablePages.slice(0, 6).map((page) => {
                                                const Icon = page.icon;
                                                return (
                                                    <button
                                                        key={page.id}
                                                        onClick={() => handleSelect(page)}
                                                        className="flex items-center gap-2 p-2.5 rounded-lg bg-primary-800/50 hover:bg-primary-700 transition-colors text-left"
                                                    >
                                                        <Icon className="w-4 h-4 text-accent-info flex-shrink-0" />
                                                        <span className="text-sm text-primary-200 truncate">{page.name}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {Object.entries(groupedResults).map(([type, items]) => {
                                    const TypeIcon = typeIcons[type] || Package;
                                    return (
                                        <div key={type}>
                                            <div className="px-4 py-2 flex items-center gap-2">
                                                <TypeIcon className="w-3.5 h-3.5 text-primary-500" />
                                                <span className="text-xs font-semibold text-primary-500 uppercase tracking-wider">
                                                    {typeLabels[type]}
                                                </span>
                                            </div>
                                            {items.map((item) => {
                                                const globalIdx = results.indexOf(item);
                                                const isSelected = globalIdx === selectedIndex;
                                                return (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleSelect(item)}
                                                        onMouseEnter={() => setSelectedIndex(globalIdx)}
                                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${isSelected ? 'bg-accent-primary/10 text-primary-100' : 'text-primary-300 hover:bg-primary-800'}`}
                                                    >
                                                        {item.type === 'page' && item.icon ? (
                                                            <item.icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-accent-primary' : 'text-primary-500'}`} />
                                                        ) : (
                                                            <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${isSelected ? 'bg-accent-primary/20 text-accent-primary' : 'bg-primary-700 text-primary-400'}`}>
                                                                {item.type === 'product' ? 'P' : 'S'}
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-sm font-medium truncate">{item.name}</p>
                                                            {item.type === 'product' && (
                                                                <p className="text-xs text-primary-500">{item.sku} · {item.category} · {formatCurrency(item.price)}</p>
                                                            )}
                                                            {item.type === 'service' && (
                                                                <p className="text-xs text-primary-500">{item.id} · {item.status.replace('_', ' ')}</p>
                                                            )}
                                                        </div>
                                                        {isSelected && <ArrowRight className="w-4 h-4 text-accent-primary flex-shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer */}
                            {results.length > 0 && (
                                <div className="px-4 py-2.5 border-t border-primary-700 flex items-center gap-4 text-[11px] text-primary-500">
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-primary-800 rounded border border-primary-700 font-mono">↑↓</kbd> Navigate</span>
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-primary-800 rounded border border-primary-700 font-mono">↵</kbd> Select</span>
                                    <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-primary-800 rounded border border-primary-700 font-mono">Esc</kbd> Close</span>
                                </div>
                            )}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default GlobalSearch;
