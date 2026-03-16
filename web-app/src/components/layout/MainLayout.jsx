import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { useTheme } from '../../context/ThemeContext';
import Sidebar from './Sidebar';
import Header from './Header';

/**
 * MainLayout Component
 * Authenticated layout with sidebar and header
 */
const MainLayout = () => {
    const { isAuthenticated, isLoading } = useAuth();
    const { sidebarCollapsed } = useTheme();

    // Show loading state
    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-center">
                    <div className="spinner spinner-lg mx-auto mb-4" />
                    <p className="text-primary-400">Loading...</p>
                </div>
            </div>
        );
    }

    // Redirect to login if not authenticated
    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return (
        <div className="min-h-screen overflow-x-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Header */}
            <Header />

            {/* Main Content */}
            <main className={`main-content ${sidebarCollapsed ? 'main-content-collapsed' : ''} bg-primary-50`}>
                <div className="w-full max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-10 transition-all duration-300">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

export default MainLayout;
