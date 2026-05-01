import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import { NAV_ITEMS, ROLE_LABELS, ROLES } from '../../utils/constants';

const privateRouteRoles = new Map([
    ...NAV_ITEMS.main.map((item) => [item.path, item.roles]),
    ...NAV_ITEMS.admin.map((item) => [item.path, item.roles]),
    ['/parts-mapping', [ROLES.ADMIN, ROLES.STOCK_CLERK]],
]);

function getRouteRoles(pathname) {
    const match = [...privateRouteRoles.entries()]
        .sort((left, right) => right[0].length - left[0].length)
        .find(([path]) => pathname === path || pathname.startsWith(`${path}/`));

    return match?.[1] ?? null;
}

function PermissionDenied({ role }) {
    return (
        <div className="mx-auto max-w-2xl rounded-3xl border border-primary-200 bg-white p-6 text-center shadow-sm sm:p-10">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-100 text-primary-950">
                <span className="text-2xl font-bold">!</span>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-primary-400">Permission denied</p>
            <h1 className="mt-3 font-display text-2xl font-black text-primary-950">This workspace is restricted</h1>
            <p className="mt-3 text-sm leading-6 text-primary-500">
                Your current role is {ROLE_LABELS[role] || 'Clerk'}. Ask an administrator if you need access to this page.
            </p>
        </div>
    );
}

/**
 * MainLayout Component
 * Authenticated layout with sidebar and header
 */
const MainLayout = () => {
    const { user, isAuthenticated, isLoadingAuth } = useAuth();
    const { sidebarCollapsed } = useTheme();
    const location = useLocation();

    if (isLoadingAuth) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner spinner-lg mx-auto mb-4" />
                    <p className="text-primary-400">Loading...</p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    const allowedRoles = getRouteRoles(location.pathname);
    const canAccessRoute = !allowedRoles || allowedRoles.includes(user?.role);

    return (
        <div className="min-h-screen overflow-x-hidden">
            <Sidebar />
            <Header />

            <main className={`main-content ${sidebarCollapsed ? 'main-content-collapsed' : ''} bg-primary-50`}>
                <div className="mx-auto w-full max-w-[1600px] p-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] transition-all duration-300 sm:p-6 sm:pb-24 lg:p-10">
                    {canAccessRoute ? <Outlet /> : <PermissionDenied role={user?.role} />}
                </div>
            </main>
            <MobileBottomNav />
        </div>
    );
};

export default MainLayout;
