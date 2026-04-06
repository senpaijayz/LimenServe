import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, Menu, Wifi, WifiOff } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/useAuth';
import NotificationsDropdown from '../ui/NotificationsDropdown';
import GlobalSearch from '../ui/GlobalSearch';

const pageMeta = {
    '/dashboard': {
        title: 'Operations overview',
        subtitle: 'Revenue, stock pressure, and service movement in one live workspace.',
    },
    '/pos': {
        title: 'Point of sale',
        subtitle: 'Process checkout with cleaner focus and faster access to next actions.',
    },
    '/inventory': {
        title: 'Inventory control',
        subtitle: 'Monitor parts depth, stock alerts, and replenishment decisions.',
    },
    '/quotation': {
        title: 'Quotation workflow',
        subtitle: 'Build, revise, and convert estimates without breaking context.',
    },
    '/services': {
        title: 'Service queue',
        subtitle: 'Track intake, approvals, and workshop status from one queue.',
    },
    '/stockroom': {
        title: '3D stockroom viewer',
        subtitle: 'Navigate the cinematic store model and locate mapped parts visually.',
    },
    '/stockroom/admin': {
        title: 'Stockroom admin',
        subtitle: 'Adjust mapped locations, floors, and 3D plan placement.',
    },
    '/reports': {
        title: 'Reports and analytics',
        subtitle: 'Inspect sales patterns, forecast signals, and performance summaries.',
    },
    '/users': {
        title: 'Team access',
        subtitle: 'Manage roles, permissions, and staff presence across the operation.',
    },
};

const Header = () => {
    const { sidebarCollapsed, toggleMobileSidebar } = useTheme();
    const { user } = useAuth();
    const location = useLocation();
    const [isOnline, setIsOnline] = useState(navigator.onLine);

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

    const pageInfo = useMemo(() => {
        if (location.pathname.startsWith('/stockroom/admin')) {
            return pageMeta['/stockroom/admin'];
        }

        const basePath = `/${location.pathname.split('/')[1]}`;
        return pageMeta[basePath] || {
            title: 'LIMEN workspace',
            subtitle: 'Operate the showroom, quotations, and fulfillment workflows with less friction.',
        };
    }, [location.pathname]);

    const greeting = useMemo(() => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    }, []);

    return (
        <header className={`header ${sidebarCollapsed ? 'header-collapsed' : ''}`}>
            <div className="flex items-center gap-3">
                <button
                    onClick={toggleMobileSidebar}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary-200 transition hover:border-accent-info/25 hover:text-white lg:hidden"
                    aria-label="Open sidebar"
                >
                    <Menu className="h-5 w-5" />
                </button>

                <div className="hidden min-w-0 sm:block">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary-500">
                        {greeting}, {user?.firstName || 'team'}
                    </p>
                    <h1 className="mt-1 truncate text-lg font-semibold text-white lg:text-[1.35rem]">
                        {pageInfo.title}
                    </h1>
                    <p className="mt-1 hidden text-sm text-primary-400 xl:block">
                        {pageInfo.subtitle}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <div className="hidden lg:block">
                    <GlobalSearch />
                </div>

                <div className={`hidden items-center gap-2 rounded-full border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] md:flex ${isOnline
                    ? 'border-accent-success/20 bg-accent-success/10 text-accent-success'
                    : 'border-accent-danger/20 bg-accent-danger/10 text-accent-danger'
                    }`}
                >
                    {isOnline ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                    <span>{isOnline ? 'Connected' : 'Offline'}</span>
                </div>

                <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-300 xl:flex">
                    <Activity className="h-3.5 w-3.5 text-accent-info" />
                    <span>{new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' })}</span>
                </div>

                <NotificationsDropdown />

                <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-2">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-accent-info/20 bg-accent-info/10 text-sm font-bold text-accent-info">
                        {user?.firstName?.[0]}{user?.lastName?.[0]}
                    </span>
                    <div className="hidden pr-2 lg:block">
                        <p className="text-sm font-semibold text-white">{user?.firstName} {user?.lastName}</p>
                        <p className="text-[11px] uppercase tracking-[0.18em] text-primary-500">
                            {String(user?.role || 'staff').replace('_', ' ')}
                        </p>
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
