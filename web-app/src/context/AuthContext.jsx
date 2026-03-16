import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthContext from './auth-context';
import { ROLES } from '../utils/constants';
import { supabase } from '../services/supabase';
import { getCurrentUserProfile } from '../services/authApi';

function normalizeRole(role) {
    if (role === 'staff') {
        return ROLES.STOCK_CLERK;
    }

    return role || ROLES.CUSTOMER;
}

function mapSupabaseUser(sessionUser, profile) {
    const fullName = profile?.fullName || sessionUser.user_metadata?.full_name || '';
    const [firstName = '', ...lastNameParts] = fullName.split(' ').filter(Boolean);

    return {
        id: sessionUser.id,
        email: profile?.email || sessionUser.email,
        firstName,
        lastName: lastNameParts.join(' '),
        fullName,
        role: normalizeRole(profile?.role || sessionUser.app_metadata?.role),
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const hydrateUser = useCallback(async (session) => {
        if (!session?.user) {
            setUser(null);
            return;
        }

        try {
            const profile = await getCurrentUserProfile();
            setUser(mapSupabaseUser(session.user, profile));
        } catch (profileError) {
            setUser(mapSupabaseUser(session.user, null));
            setError(profileError.message);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                const { data, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) {
                    throw sessionError;
                }

                if (!mounted) {
                    return;
                }

                await hydrateUser(data.session);
            } catch (authError) {
                if (mounted) {
                    setError(authError.message || 'Unable to restore session.');
                    setUser(null);
                }
            } finally {
                if (mounted) {
                    setIsLoading(false);
                }
            }
        };

        initializeAuth();

        const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
            if (!mounted) {
                return;
            }

            await hydrateUser(session);
            setIsLoading(false);
        });

        return () => {
            mounted = false;
            subscription.subscription.unsubscribe();
        };
    }, [hydrateUser]);

    const login = useCallback(async (email, password) => {
        setIsLoading(true);
        setError(null);

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                throw signInError;
            }

            await hydrateUser(data.session);
            return { success: true };
        } catch (loginError) {
            const message = loginError.message || 'Invalid email or password.';
            setError(message);
            return { success: false, error: message };
        } finally {
            setIsLoading(false);
        }
    }, [hydrateUser]);

    const logout = useCallback(async () => {
        await supabase.auth.signOut();
        setUser(null);
        setError(null);
    }, []);

    const hasRole = useCallback((roles) => {
        if (!user) return false;
        if (typeof roles === 'string') {
            return user.role === roles;
        }

        return roles.includes(user.role);
    }, [user]);

    const value = useMemo(() => ({
        user,
        isLoading,
        error,
        isAuthenticated: !!user,
        isAdmin: user?.role === ROLES.ADMIN,
        login,
        logout,
        hasRole,
    }), [user, isLoading, error, login, logout, hasRole]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
