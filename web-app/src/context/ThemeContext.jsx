import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '../utils/constants';

// Create Theme Context
const ThemeContext = createContext(null);

/**
 * Theme Provider Component
 * Manages theme and sidebar state
 */
export function ThemeProvider({ children }) {
    // Sidebar state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEYS.SIDEBAR_COLLAPSED);
            return saved === 'true';
        } catch {
            return false;
        }
    });

    // Mobile sidebar open state
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [notificationsOpen, setNotificationsOpen] = useState(false);
    const openNotifications = useCallback(() => { setSidebarOpen(false); setNotificationsOpen(true); }, []);
    const closeNotifications = useCallback(() => setNotificationsOpen(false), []);

    // Toggle sidebar collapsed state
    const toggleSidebar = useCallback(() => setSidebarCollapsed(prev => !prev), []);
    useEffect(() => {
        try { localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(sidebarCollapsed)); }
        catch { /* Optional display preference must not break navigation. */ }
    }, [sidebarCollapsed]);

    // Toggle mobile sidebar
    const toggleMobileSidebar = useCallback(() => {
        setNotificationsOpen(false);
        setSidebarOpen(prev => !prev);
    }, []);

    // Close mobile sidebar
    const closeMobileSidebar = useCallback(() => {
        setSidebarOpen(false);
    }, []);

    // Close mobile sidebar on resize
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setSidebarOpen(false);
            }
        };

        window.addEventListener('resize', handleResize);
        window.addEventListener('popstate', closeMobileSidebar);
        return () => { window.removeEventListener('resize', handleResize); window.removeEventListener('popstate', closeMobileSidebar); };
    }, [closeMobileSidebar]);

    const value = {
        sidebarCollapsed,
        sidebarOpen,
        toggleSidebar,
        toggleMobileSidebar,
        closeMobileSidebar,
        notificationsOpen,
        openNotifications,
        closeNotifications,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

/**
 * Hook to access theme context
 */
// The provider and its small companion hook intentionally share one module.
// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }

    return context;
}

export default ThemeContext;
