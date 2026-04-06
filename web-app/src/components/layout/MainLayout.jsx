import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import ActivityRail from './ActivityRail';

const chromeHiddenRoutes = ['/stockroom', '/stockroom/admin'];

const MainLayout = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const { sidebarCollapsed } = useTheme();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center px-6">
                <div className="shell-panel w-full max-w-md p-8 text-center">
                    <div className="mx-auto h-14 w-14 animate-pulse rounded-3xl border border-accent-info/20 bg-accent-info/10" />
                    <h1 className="mt-6 text-2xl font-semibold text-white">Preparing LIMEN workspace</h1>
                    <p className="mt-2 text-sm text-primary-400">
                        Loading your dashboard, navigation state, and latest operational signals.
                    </p>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    const isFullCanvasRoute = chromeHiddenRoutes.some((route) => location.pathname.startsWith(route));

    return (
        <div className="ambient-grid min-h-screen overflow-x-hidden">
            <div className="pointer-events-none fixed inset-0">
                <div className="absolute left-[-12%] top-[-12%] h-[28rem] w-[28rem] rounded-full bg-accent-info/12 blur-[130px]" />
                <div className="absolute bottom-[-18%] right-[-6%] h-[30rem] w-[30rem] rounded-full bg-accent-blue/14 blur-[150px]" />
            </div>

            <Sidebar />
            <Header />

            <main className={`main-content ${sidebarCollapsed ? 'main-content-collapsed' : ''}`}>
                <div className={`mx-auto w-full max-w-[1760px] px-4 pb-10 sm:px-6 lg:px-8 ${isFullCanvasRoute ? 'xl:px-10' : ''}`}>
                    {isFullCanvasRoute ? (
                        <div className="relative">
                            <Outlet />
                        </div>
                    ) : (
                        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                            <div className="relative min-w-0">
                                <Outlet />
                            </div>
                            <ActivityRail />
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
