import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    FileText,
    Wrench,
    Box,
    BarChart3,
    Users,
    ChevronLeft,
    LogOut,
    X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { NAV_ITEMS } from '../../utils/constants';

// Icon mapping
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

/**
 * Sidebar Component
 * Main navigation sidebar with collapsible state
 */
const Sidebar = () => {
    const { user, logout } = useAuth();
    const { sidebarCollapsed, sidebarOpen, toggleSidebar, closeMobileSidebar } = useTheme();
    const location = useLocation();

    // Filter nav items based on user role
    const filterByRole = (items) => {
        return items.filter(item => item.roles.includes(user?.role));
    };

    const mainNavItems = filterByRole(NAV_ITEMS.main);
    const adminNavItems = filterByRole(NAV_ITEMS.admin);

    // Render navigation item
    const NavItem = ({ item }) => {
        const Icon = iconMap[item.icon];
        const isActive = location.pathname === item.path || location.pathname.startsWith(item.path + '/');

        return (
            <NavLink
                to={item.path}
                onClick={closeMobileSidebar}
                className={`
          sidebar-nav-item
          ${isActive ? 'sidebar-nav-item-active' : ''}
        `}
            >
                {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                <AnimatePresence>
                    {!sidebarCollapsed && (
                        <motion.span
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 'auto' }}
                            exit={{ opacity: 0, width: 0 }}
                            className="whitespace-nowrap overflow-hidden"
                        >
                            {item.label}
                        </motion.span>
                    )}
                </AnimatePresence>
            </NavLink>
        );
    };

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {sidebarOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeMobileSidebar}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside
                className={`
          sidebar
          ${sidebarCollapsed ? 'sidebar-collapsed' : ''}
          ${sidebarOpen ? 'sidebar-open translate-x-0' : ''}
        `}
            >
                {/* Logo */}
                <div className="sidebar-logo pb-6 border-b border-primary-200">
                    <img src="/LogoLimen.jpg" alt="Limen Logo" className="w-10 h-10 object-contain rounded-lg bg-white p-1 flex-shrink-0 border border-primary-200" />
                    <AnimatePresence>
                        {!sidebarCollapsed && (
                            <motion.div
                                initial={{ opacity: 0, width: 0 }}
                                animate={{ opacity: 1, width: 'auto' }}
                                exit={{ opacity: 0, width: 0 }}
                                className="overflow-hidden"
                            >
                                <h1 className="font-display font-bold text-lg text-primary-950 whitespace-nowrap">
                                    LimenServe
                                </h1>
                                <p className="text-xs text-primary-500 whitespace-nowrap">Auto Parts MIS</p>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Mobile close button */}
                    <button
                        onClick={closeMobileSidebar}
                        className="lg:hidden ml-auto p-1 rounded hover:bg-primary-100"
                    >
                        <X className="w-5 h-5 text-primary-500" />
                    </button>
                </div>

                {/* Navigation */}
                <nav className="sidebar-nav">
                    {/* Main Navigation */}
                    <div className="mb-6">
                        {!sidebarCollapsed && (
                            <p className="sidebar-section-title">Main Menu</p>
                        )}
                        {mainNavItems.map((item) => (
                            <NavItem key={item.path} item={item} />
                        ))}
                    </div>

                    {/* Admin Navigation */}
                    {adminNavItems.length > 0 && (
                        <div className="mb-6">
                            {!sidebarCollapsed && (
                                <p className="sidebar-section-title">Administration</p>
                            )}
                            {adminNavItems.map((item) => (
                                <NavItem key={item.path} item={item} />
                            ))}
                        </div>
                    )}
                </nav>

                {/* Bottom Section */}
                <div className="mt-auto border-t border-primary-200 p-4">
                    {/* User Info */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-accent-danger/10 flex items-center justify-center flex-shrink-0 border border-accent-danger/20">
                            <span className="text-accent-danger font-bold text-sm">
                                {user?.firstName?.[0]}{user?.lastName?.[0]}
                            </span>
                        </div>
                        <AnimatePresence>
                            {!sidebarCollapsed && (
                                <motion.div
                                    initial={{ opacity: 0, width: 0 }}
                                    animate={{ opacity: 1, width: 'auto' }}
                                    exit={{ opacity: 0, width: 0 }}
                                    className="overflow-hidden"
                                >
                                    <p className="text-sm font-semibold text-primary-950 whitespace-nowrap">
                                        {user?.firstName} {user?.lastName}
                                    </p>
                                    <p className="text-xs text-primary-500 capitalize whitespace-nowrap">
                                        {user?.role?.replace('_', ' ')}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Collapse Toggle (Desktop) */}
                    <button
                        onClick={toggleSidebar}
                        className="hidden lg:flex items-center gap-3 w-full px-3 py-2 rounded-lg text-primary-500 hover:bg-primary-100 hover:text-primary-900 transition-colors"
                    >
                        <ChevronLeft className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} />
                        {!sidebarCollapsed && <span className="text-sm font-medium">Collapse</span>}
                    </button>

                    {/* Logout Button */}
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 w-full px-3 py-2 mt-2 rounded-lg text-accent-danger hover:bg-accent-danger/10 transition-colors"
                    >
                        <LogOut className="w-5 h-5" />
                        {!sidebarCollapsed && <span className="text-sm">Logout</span>}
                    </button>
                </div>
            </aside>
        </>
    );
};

export default Sidebar;
