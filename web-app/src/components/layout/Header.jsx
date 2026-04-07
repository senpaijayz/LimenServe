import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Menu, Wifi, WifiOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/useAuth';
import NotificationsDropdown from '../ui/NotificationsDropdown';

/**
 * Header Component
 * Top navigation bar with search, notifications, and offline indicator
 */
const Header = () => {
    const { sidebarCollapsed, toggleMobileSidebar } = useTheme();
    const { user } = useAuth();
    const location = useLocation();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Monitor online status
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

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

                {/* Online/Offline Indicator */}
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${isOnline
                    ? 'bg-accent-success/20 text-accent-success'
                    : 'bg-accent-danger/20 text-accent-danger'
                    }`}>
                    {isOnline ? (
                        <>
                            <Wifi className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Online</span>
                        </>
                    ) : (
                        <>
                            <WifiOff className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Offline</span>
                        </>
                    )}
                </div>

                {/* Notifications */}
                <NotificationsDropdown />

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
