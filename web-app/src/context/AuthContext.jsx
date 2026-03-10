import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ROLES, STORAGE_KEYS } from '../utils/constants';

// Create Auth Context
const AuthContext = createContext(null);

// Mock user data for development
const MOCK_USERS = {
    'admin@limen.com': { id: '1', email: 'admin@limen.com', firstName: 'Wilson', lastName: 'Limen', role: ROLES.ADMIN },
    'cashier@limen.com': { id: '2', email: 'cashier@limen.com', firstName: 'Maria', lastName: 'Santos', role: ROLES.CASHIER },
    'clerk@limen.com': { id: '3', email: 'clerk@limen.com', firstName: 'Juan', lastName: 'Dela Cruz', role: ROLES.STOCK_CLERK },
};

/**
 * Auth Provider Component
 * Manages authentication state and provides auth methods to children
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check for existing session on mount
    useEffect(() => {
        const checkAuth = async () => {
            try {
                const savedUser = localStorage.getItem(STORAGE_KEYS.USER_DATA);
                const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);

                if (savedUser && token) {
                    setUser(JSON.parse(savedUser));
                }
            } catch (err) {
                console.error('Auth check failed:', err);
                localStorage.removeItem(STORAGE_KEYS.USER_DATA);
                localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
            } finally {
                setIsLoading(false);
            }
        };

        checkAuth();
    }, []);

    /**
     * Login with email and password
     */
    const login = useCallback(async (email, password) => {
        setIsLoading(true);
        setError(null);

        try {
            // Simulate API call delay
            await new Promise(resolve => setTimeout(resolve, 800));

            // Mock authentication (replace with real API call)
            const mockUser = MOCK_USERS[email.toLowerCase()];

            if (!mockUser || password.length < 6) {
                throw new Error('Invalid email or password');
            }

            // Store auth data
            const token = `mock_token_${Date.now()}`;
            localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
            localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(mockUser));

            setUser(mockUser);
            return { success: true, user: mockUser };
        } catch (err) {
            setError(err.message);
            return { success: false, error: err.message };
        } finally {
            setIsLoading(false);
        }
    }, []);

    /**
     * Logout current user
     */
    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.USER_DATA);
        setUser(null);
        setError(null);
    }, []);

    /**
     * Check if user has specific role
     */
    const hasRole = useCallback((roles) => {
        if (!user) return false;
        if (typeof roles === 'string') {
            return user.role === roles;
        }
        return roles.includes(user.role);
    }, [user]);

    /**
     * Check if user is authenticated
     */
    const isAuthenticated = !!user;

    /**
     * Check if user is admin
     */
    const isAdmin = user?.role === ROLES.ADMIN;

    const value = {
        user,
        isLoading,
        error,
        isAuthenticated,
        isAdmin,
        login,
        logout,
        hasRole,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

/**
 * Hook to access auth context
 */
export function useAuth() {
    const context = useContext(AuthContext);

    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }

    return context;
}

export default AuthContext;
