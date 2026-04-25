import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';

/**
 * MainLayout Component
 * Authenticated layout with sidebar and header
 */
const MainLayout = () => {
    const { isAuthenticated, isLoadingAuth } = useAuth();
    const { sidebarCollapsed } = useTheme();

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

    return (
        <div className="min-h-screen overflow-x-hidden">
            <Sidebar />
            <Header />

            <main className={`main-content ${sidebarCollapsed ? 'main-content-collapsed' : ''} bg-primary-50`}>
                <div className="w-full max-w-[1600px] mx-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:p-10 transition-all duration-300">
                    <Outlet />
                </div>
            </main>
            <MobileBottomNav />
        </div>
    );
};

export default MainLayout;
