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
            <div className="flex items-center gap-4">
                {/* Mobile Menu Toggle */}
                <button
                    onClick={toggleMobileSidebar}
                    className="lg:hidden p-2 rounded-lg hover:bg-primary-50 transition-colors border border-primary-200"
                >
                    <Menu className="w-5 h-5 text-primary-700" />
                </button>

                {/* Page Title & Date */}
                <div className="hidden sm:flex items-center gap-3">
                    <h1 className="text-xl font-display font-bold text-primary-950">
                        {getPageTitle()}
                    </h1>
                    <span className="w-px h-5 bg-primary-200" />
                    <span className="text-sm text-primary-500 font-medium">
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
                <div className="lg:hidden w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center border border-primary-200">
                    <span className="text-primary-700 text-sm font-bold">
                        {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                </div>
            </div>
        </header>
    );
};

export default Header;
