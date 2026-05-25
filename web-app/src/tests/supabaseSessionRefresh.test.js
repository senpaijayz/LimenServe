import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = {
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(() => ({
    data: {
      subscription: {
        unsubscribe: vi.fn(),
      },
    },
  })),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: authMock,
  })),
}));

async function loadSupabaseService() {
  vi.resetModules();
  return import('../services/supabase');
}

function expiringSession(overrides = {}) {
  return {
    access_token: 'old-token',
    refresh_token: 'refresh-token',
    expires_at: Math.floor(Date.now() / 1000) + 10,
    user: { id: 'user-1' },
    ...overrides,
  };
}

describe('Supabase session refresh helper', () => {
  beforeEach(() => {
    authMock.getSession.mockReset();
    authMock.onAuthStateChange.mockClear();
    authMock.refreshSession.mockReset();
    authMock.signOut.mockReset();
    authMock.onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });
  });

  it('shares one refresh request across concurrent protected API calls', async () => {
    const currentSession = expiringSession();
    authMock.getSession.mockResolvedValue({ data: { session: currentSession }, error: null });
    authMock.refreshSession.mockResolvedValue({
      data: {
        session: expiringSession({
          access_token: 'new-token',
          refresh_token: 'new-refresh-token',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        }),
      },
      error: null,
    });

    const { getFreshAccessToken } = await loadSupabaseService();
    const [firstToken, secondToken] = await Promise.all([
      getFreshAccessToken(),
      getFreshAccessToken(),
    ]);

    expect(authMock.refreshSession).toHaveBeenCalledTimes(1);
    expect(firstToken).toBe('new-token');
    expect(secondToken).toBe('new-token');
  });

  it('clears local auth state when Supabase rejects the refresh token', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: expiringSession() }, error: null });
    authMock.refreshSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token: Refresh Token Not Found' },
    });

    const { getFreshAccessToken } = await loadSupabaseService();

    await expect(getFreshAccessToken()).rejects.toMatchObject({
      code: 'AUTH_SESSION_EXPIRED',
    });
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});
