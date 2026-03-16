import { useCallback, useEffect, useMemo, useState } from 'react';
import AuthContext from './auth-context';
import { ROLES } from '../utils/constants';
import { ensureSessionLoaded, supabase } from '../services/supabase';
import { getCurrentUserProfile } from '../services/authApi';

function normalizeRole(role, email) {
    if (role === 'staff') {
        return ROLES.STOCK_CLERK;
    }

    if (role) {
        return role;
    }

    const normalizedEmail = email?.trim().toLowerCase();

    // Keep the staff portal usable even when the profile row is missing or stale.
    if (normalizedEmail === 'admin@limen.com') {
        return ROLES.ADMIN;
    }

    if (normalizedEmail?.endsWith('@limen.com')) {
        return ROLES.STOCK_CLERK;
    }

    return ROLES.CUSTOMER;
}

function mapSupabaseUser(sessionUser, profile) {
    const fullName = profile?.fullName || sessionUser.user_metadata?.full_name || '';
    const [firstName = '', ...lastNameParts] = fullName.split(' ').filter(Boolean);
    const email = profile?.email || sessionUser.email;

    return {
        id: sessionUser.id,
        email,
        firstName,
        lastName: lastNameParts.join(' '),
        fullName,
        role: normalizeRole(profile?.role || sessionUser.app_metadata?.role, email),
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const hydrateUser = useCallback(async (session) => {
        if (!session?.user) {
            setUser(null);
            setError(null);
            return;
        }

        try {
            const profile = await getCurrentUserProfile();
            setUser(mapSupabaseUser(session.user, profile));
            setError(null);
        } catch (profileError) {
            setUser(mapSupabaseUser(session.user, null));
            setError(profileError.message);
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                const session = await ensureSessionLoaded();

                if (!mounted) {
                    return;
                }

                await hydrateUser(session);
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

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) {
                return;
            }

            void (async () => {
                await hydrateUser(session);

                if (mounted) {
                    setIsLoading(false);
                }
            })();
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
            const { error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                throw signInError;
            }

            return { success: true };
        } catch (loginError) {
            const message = loginError.message || 'Invalid email or password.';
            setError(message);
            return { success: false, error: message };
        } finally {
            setIsLoading(false);
        }
    }, []);

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
