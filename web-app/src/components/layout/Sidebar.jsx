import { AnimatePresence, motion } from 'framer-motion';
import { NavLink, useLocation } from 'react-router-dom';
import {
    BarChart3,
    Box,
    ChevronLeft,
    LayoutDashboard,
    LogOut,
    Package,
    ShoppingCart,
    Sparkles,
    Users,
    Wrench,
    FileText,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import { NAV_ITEMS } from '../../utils/constants';

const iconMap = {
    LayoutDashboard,
    ShoppingCart,
    Package,
    FileText,
    Wrench,
    Box,
    BarChart3,
    Users,
};

const Sidebar = () => {
    const { user, logout } = useAuth();
    const { sidebarCollapsed, sidebarOpen, toggleSidebar, closeMobileSidebar } = useTheme();
    const location = useLocation();

    const filterByRole = (items) => items.filter((item) => item.roles.includes(user?.role));
    const mainNavItems = filterByRole(NAV_ITEMS.main);
    const adminNavItems = filterByRole(NAV_ITEMS.admin);

    const NavItem = ({ item }) => {
        const Icon = iconMap[item.icon];
        const isActive = location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);

        return (
            <NavLink
                to={item.path}
                onClick={closeMobileSidebar}
                className={`sidebar-nav-item ${isActive ? 'sidebar-nav-item-active' : ''}`}
            >
                {Icon && <Icon className="h-5 w-5 shrink-0" />}
                <AnimatePresence initial={false}>
                    {!sidebarCollapsed && (
                        <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="min-w-0 overflow-hidden"
                        >
                            <p className="truncate text-sm font-semibold">{item.label}</p>
                            <p className="truncate text-xs text-primary-500">
                                {item.path === '/dashboard' && 'Pulse, trends, and operational health'}
                                {item.path === '/inventory' && 'Depth, movement, and replenishment'}
                                {item.path === '/pos' && 'Fast checkout and sales flow'}
                                {item.path === '/quotation' && 'Drafts, revisions, and conversions'}
                                {item.path === '/services' && 'Active service workload'}
                                {item.path === '/stockroom' && '3D locator and shelf mapping'}
                                {item.path === '/reports' && 'Forecast and performance views'}
                                {item.path === '/users' && 'Access and role management'}
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </NavLink>
        );
    };

    return (
        <>
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.button
                        type="button"
                        aria-label="Close sidebar"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeMobileSidebar}
                        className="fixed inset-0 z-30 bg-black/65 backdrop-blur-sm lg:hidden"
                    />
                )}
            </AnimatePresence>

            <aside className={`sidebar ${sidebarCollapsed ? 'sidebar-collapsed' : ''} ${sidebarOpen ? 'sidebar-open' : ''}`}>
                <div className="sidebar-logo">
                    <div className="flex h-12 w-12 items-center justify-center rounded-[20px] border border-accent-info/20 bg-white/[0.05] shadow-[0_12px_40px_rgba(79,223,255,0.14)]">
                        <img src="/LogoLimen.jpg" alt="Limen logo" className="h-9 w-9 rounded-xl object-contain" />
                    </div>

                    <AnimatePresence initial={false}>
                        {!sidebarCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="overflow-hidden"
                            >
                                <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary-500">LIMEN</p>
                                <h1 className="mt-1 text-xl font-semibold text-white">Operations cockpit</h1>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        onClick={closeMobileSidebar}
                        className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary-300 lg:hidden"
                        aria-label="Close sidebar"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="px-4 pt-4">
                    <AnimatePresence initial={false}>
                        {!sidebarCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="rounded-[26px] border border-white/8 bg-gradient-to-br from-accent-info/12 to-accent-blue/10 p-4"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/12 bg-white/[0.06] text-accent-info">
                                        <Sparkles className="h-4 w-4" />
                                    </span>
                                    <div>
                                        <p className="text-sm font-semibold text-white">Premium control layer</p>
                                        <p className="text-xs leading-relaxed text-primary-400">
                                            Faster navigation, richer signals, and cleaner workflow handoffs.
                                        </p>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <nav className="sidebar-nav">
                    <div className="mb-5">
                        {!sidebarCollapsed && <p className="sidebar-section-title">Core workflow</p>}
                        {mainNavItems.map((item) => <NavItem key={item.path} item={item} />)}
                    </div>

                    {adminNavItems.length > 0 && (
                        <div>
                            {!sidebarCollapsed && <p className="sidebar-section-title">Admin controls</p>}
                            {adminNavItems.map((item) => <NavItem key={item.path} item={item} />)}
                        </div>
                    )}
                </nav>

                <div className="mt-auto border-t border-white/8 px-4 py-4">
                    <div className="mb-4 flex items-center gap-3 rounded-[24px] border border-white/8 bg-white/[0.03] p-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-accent-info/20 bg-accent-info/10 text-sm font-bold text-accent-info">
                            {user?.firstName?.[0]}{user?.lastName?.[0]}
                        </span>

                        <AnimatePresence initial={false}>
                            {!sidebarCollapsed && (
                                <motion.div
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    className="min-w-0 overflow-hidden"
                                >
                                    <p className="truncate text-sm font-semibold text-white">
                                        {user?.firstName} {user?.lastName}
                                    </p>
                                    <p className="truncate text-[11px] uppercase tracking-[0.18em] text-primary-500">
                                        {String(user?.role || 'staff').replace('_', ' ')}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    <button
                        onClick={toggleSidebar}
                        className="hidden w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-3 py-3 text-sm font-semibold text-primary-300 transition hover:border-accent-info/20 hover:text-white lg:flex"
                    >
                        <ChevronLeft className={`h-4 w-4 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                        {!sidebarCollapsed && <span>Collapse navigation</span>}
                    </button>

                    <button
                        onClick={logout}
                        className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-accent-danger/15 bg-accent-danger/8 px-3 py-3 text-sm font-semibold text-accent-danger transition hover:bg-accent-danger/12"
                    >
                        <LogOut className="h-4 w-4" />
                        {!sidebarCollapsed && <span>Sign out</span>}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
