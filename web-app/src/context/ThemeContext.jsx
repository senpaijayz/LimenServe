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

    // Toggle sidebar collapsed state
    const toggleSidebar = useCallback(() => {
        setSidebarCollapsed(prev => {
            const newValue = !prev;
            localStorage.setItem(STORAGE_KEYS.SIDEBAR_COLLAPSED, String(newValue));
            return newValue;
        });
    }, []);

    // Toggle mobile sidebar
    const toggleMobileSidebar = useCallback(() => {
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
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const value = {
        sidebarCollapsed,
        sidebarOpen,
        toggleSidebar,
        toggleMobileSidebar,
        closeMobileSidebar,
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
export function useTheme() {
    const context = useContext(ThemeContext);

    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }

    return context;
}

export default ThemeContext;
