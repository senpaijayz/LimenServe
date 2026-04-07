import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AuthContext from './auth-context';
import { ROLES } from '../utils/constants';
import { ensureSessionLoaded, supabase } from '../services/supabase';
import { getCurrentUserProfile } from '../services/authApi';

const PROFILE_TIMEOUT_MS = 3000;

function normalizeRole(role, email) {
    if (role === 'staff') {
        return ROLES.STOCK_CLERK;
    }

    if (role) {
        return role;
    }

    const normalizedEmail = email?.trim().toLowerCase();

    if (normalizedEmail === 'admin@limen.com') {
        return ROLES.ADMIN;
    }

    if (normalizedEmail?.endsWith('@limen.com')) {
        return ROLES.STOCK_CLERK;
    }

    return ROLES.CUSTOMER;
}

function mapSupabaseUser(sessionUser, profile) {
    const fullName = profile?.fullName || profile?.full_name || sessionUser.user_metadata?.full_name || '';
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

function buildSessionKey(session) {
    if (!session?.user) {
        return null;
    }

    return `${session.user.id}:${session.access_token || 'sessionless'}`;
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);
    const [isProfileReady, setIsProfileReady] = useState(false);
    const [error, setError] = useState(null);
    const [profileWarning, setProfileWarning] = useState(null);
    const pendingProfileSessionKeyRef = useRef(null);
    const resolvedProfileSessionKeyRef = useRef(null);

    const clearProfileTracking = useCallback(() => {
        pendingProfileSessionKeyRef.current = null;
        resolvedProfileSessionKeyRef.current = null;
    }, []);

    const resetAuthState = useCallback(() => {
        clearProfileTracking();
        setUser(null);
        setError(null);
        setProfileWarning(null);
        setIsProfileReady(true);
    }, [clearProfileTracking]);

    const applyProvisionalUser = useCallback((sessionUser) => {
        const provisionalUser = mapSupabaseUser(sessionUser, null);

        setUser((currentUser) => {
            if (!currentUser || currentUser.id !== provisionalUser.id) {
                return provisionalUser;
            }

            return {
                ...currentUser,
                ...provisionalUser,
                firstName: provisionalUser.firstName || currentUser.firstName,
                lastName: provisionalUser.lastName || currentUser.lastName,
                fullName: provisionalUser.fullName || currentUser.fullName,
                role: provisionalUser.role || currentUser.role,
            };
        });
    }, []);

    const hydrateProfile = useCallback(async (session, { force = false } = {}) => {
        if (!session?.user) {
            setIsProfileReady(true);
            setProfileWarning(null);
            return;
        }

        const sessionKey = buildSessionKey(session);

        if (!sessionKey) {
            setIsProfileReady(true);
            return;
        }

        if (!force && (resolvedProfileSessionKeyRef.current === sessionKey || pendingProfileSessionKeyRef.current === sessionKey)) {
            return;
        }

        pendingProfileSessionKeyRef.current = sessionKey;
        setIsProfileReady(false);
        setProfileWarning(null);

        try {
            const profile = await getCurrentUserProfile({ timeoutMs: PROFILE_TIMEOUT_MS });

            if (pendingProfileSessionKeyRef.current !== sessionKey) {
                return;
            }

            resolvedProfileSessionKeyRef.current = sessionKey;
            setUser(mapSupabaseUser(session.user, profile));
        } catch (profileError) {
            if (pendingProfileSessionKeyRef.current !== sessionKey) {
                return;
            }

            setProfileWarning(profileError.message || 'Profile sync is taking longer than expected.');
        } finally {
            if (pendingProfileSessionKeyRef.current === sessionKey) {
                pendingProfileSessionKeyRef.current = null;
                setIsProfileReady(true);
            }
        }
    }, []);

    const applySession = useCallback((session, options = {}) => {
        if (!session?.user) {
            resetAuthState();
            return;
        }

        applyProvisionalUser(session.user);
        setError(null);

        void hydrateProfile(session, options);
    }, [applyProvisionalUser, hydrateProfile, resetAuthState]);

    useEffect(() => {
        let mounted = true;

        const initializeAuth = async () => {
            try {
                const session = await ensureSessionLoaded();

                if (!mounted) {
                    return;
                }

                applySession(session);
            } catch (authError) {
                if (mounted) {
                    resetAuthState();
                    setError(authError.message || 'Unable to restore session.');
                }
            } finally {
                if (mounted) {
                    setIsLoadingAuth(false);
                }
            }
        };

        initializeAuth();

        const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
            if (!mounted) {
                return;
            }

            applySession(session);
            setIsLoadingAuth(false);
        });

        return () => {
            mounted = false;
            subscription.subscription.unsubscribe();
        };
    }, [applySession, resetAuthState]);

    const login = useCallback(async (email, password) => {
        setIsLoadingAuth(true);
        setError(null);
        setProfileWarning(null);

        try {
            const { data, error: signInError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (signInError) {
                throw signInError;
            }

            const session = data?.session ?? await ensureSessionLoaded();
            applySession(session, { force: true });

            return { success: true };
        } catch (loginError) {
            const message = loginError.message || 'Invalid email or password.';
            setError(message);
            return { success: false, error: message };
        } finally {
            setIsLoadingAuth(false);
        }
    }, [applySession]);

    const logout = useCallback(async () => {
        await supabase.auth.signOut();
        resetAuthState();
    }, [resetAuthState]);

    const hasRole = useCallback((roles) => {
        if (!user) return false;
        if (typeof roles === 'string') {
            return user.role === roles;
        }

        return roles.includes(user.role);
    }, [user]);

    const value = useMemo(() => ({
        user,
        isLoading: isLoadingAuth,
        isLoadingAuth,
        isProfileReady,
        error,
        profileWarning,
        isAuthenticated: !!user,
        isAdmin: user?.role === ROLES.ADMIN,
        login,
        logout,
        hasRole,
    }), [user, isLoadingAuth, isProfileReady, error, profileWarning, login, logout, hasRole]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}
