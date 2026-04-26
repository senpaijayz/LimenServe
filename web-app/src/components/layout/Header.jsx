import { useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/useAuth';

/**
 * Header Component
 * Top navigation bar with page context and staff status messaging
 */
const Header = () => {
    const { sidebarCollapsed, toggleMobileSidebar } = useTheme();
    const { user, isProfileReady, profileWarning } = useAuth();
    const location = useLocation();

    // Get page title from path
    const getPageTitle = () => {
        if (location.pathname.startsWith('/stockroom/admin')) {
            return 'Stockroom Admin';
        }

        const pathMap = {
            '/dashboard': 'Dashboard',
            '/pos': 'Point of Sale',
            '/inventory': 'Inventory Management',
            '/quotation': 'Cost Estimation & Quotation',
            '/services': 'Service Orders',
            '/stockroom': 'Internal Locator',
            '/stockroom/admin': 'Parts Mapping Design',
            '/reports': 'Reports & Analytics',
            '/users': 'User Management',
        };

        const basePath = '/' + location.pathname.split('/')[1];
        return pathMap[basePath] || 'LimenServe';
    };

    return (
        <header className={`header ${sidebarCollapsed ? 'header-collapsed' : ''}`}>
            {/* Left Section */}
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
                {/* Mobile Menu Toggle */}
                <button
                    onClick={toggleMobileSidebar}
                    className="min-h-11 min-w-11 rounded-lg border border-primary-200 p-2 transition-colors hover:bg-primary-50 lg:hidden"
                    aria-label="Open navigation menu"
                >
                    <Menu className="w-5 h-5 text-primary-700" />
                </button>

                {/* Page Title & Date */}
                <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <h1 className="max-w-[48vw] truncate text-base font-display font-bold text-primary-950 sm:max-w-none sm:text-xl">
                        {getPageTitle()}
                    </h1>
                    <span className="hidden h-5 w-px bg-primary-200 sm:block" />
                    <span className="hidden text-sm font-medium text-primary-500 sm:block">
                        {new Date().toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                </div>
            </div>

            {/* Right Section */}
            <div className="flex items-center gap-3">
                {!isProfileReady && (
                    <div className="hidden rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-500 md:inline-flex">
                        Syncing profile...
                    </div>
                )}

                {profileWarning && (
                    <div className="hidden max-w-[240px] rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 lg:inline-flex">
                        {profileWarning}
                    </div>
                )}

                {/* User Avatar (Mobile) */}
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-200 bg-primary-100 lg:hidden">
                    <span className="text-primary-700 text-sm font-bold">
                        {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                </div>
            </div>
        </header>
    );
};

export default Header;
