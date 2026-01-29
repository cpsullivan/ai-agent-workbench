/**
 * Tests for useAuth Hook
 *
 * Comprehensive test suite for authentication hook covering:
 * - Context provider setup
 * - User session management
 * - OAuth and email authentication
 * - Permission checking
 * - Role-based access control
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth, useRequireAuth, usePermission } from '../useAuth';
import { supabase } from '@/lib/supabase';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
      getUser: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    })),
  },
}));

// Mock window.location
delete (window as any).location;
window.location = { ...window.location, href: '', origin: 'http://localhost:3000' };

// ============================================================================
// Test Data
// ============================================================================

const mockAuthUser: User = {
  id: 'auth-user-123',
  email: 'test@example.com',
  user_metadata: {
    full_name: 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
  },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

const mockSession: Session = {
  access_token: 'mock-access-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: mockAuthUser,
};

const mockAppUser = {
  id: 'user-123',
  email: 'test@example.com',
  full_name: 'Test User',
  organization_id: 'org-123',
  auth_user_id: 'auth-user-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockPermissions = [
  { resource: 'sessions', action: 'create', allowed: true },
  { resource: 'sessions', action: 'read', allowed: true },
  { resource: 'workflows', action: 'create', allowed: true },
  { resource: 'users', action: 'delete', allowed: false },
];

const mockRole = { role: 'member' };

// ============================================================================
// Helper Functions
// ============================================================================

function createWrapper() {
  return ({ children }: { children: React.ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );
}

function setupMocks(options: {
  session?: Session | null;
  user?: typeof mockAppUser | null;
  role?: typeof mockRole | null;
  permissions?: typeof mockPermissions;
}) {
  const { session = mockSession, user = mockAppUser, role = mockRole, permissions = mockPermissions } = options;

  // Mock getSession
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session },
    error: null,
  });

  // Mock onAuthStateChange
  const subscription = { unsubscribe: vi.fn() };
  vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
    data: { subscription },
  } as any);

  // Mock database queries
  const fromMock = vi.mocked(supabase.from);

  // User query
  fromMock.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    if (table === 'users') {
      query.single.mockResolvedValue({
        data: user,
        error: null,
      });
    } else if (table === 'user_roles') {
      query.single.mockResolvedValue({
        data: role,
        error: null,
      });
    } else if (table === 'permissions') {
      query.single.mockResolvedValue({
        data: permissions,
        error: null,
      });
      // For select without single (permissions query)
      const selectMock = query.select as any;
      selectMock.mockImplementation(() => ({
        ...query,
        eq: vi.fn(() => ({
          data: permissions,
          error: null,
        })),
      }));
    }

    return query;
  });

  return { subscription };
}

// ============================================================================
// Tests: Context Provider
// ============================================================================

describe('AuthProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when useAuth is used outside provider', () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');

    consoleSpy.mockRestore();
  });

  it('should initialize with loading state', () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('should load user session on mount', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toEqual(mockAppUser);
    expect(result.current.session).toEqual(mockSession);
  });

  it('should handle no session on mount', async () => {
    setupMocks({ session: null, user: null });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('should subscribe to auth state changes', async () => {
    setupMocks({ session: mockSession });

    renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
    });
  });

  it('should unsubscribe on unmount', async () => {
    const { subscription } = setupMocks({ session: mockSession });

    const { unmount } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(supabase.auth.onAuthStateChange).toHaveBeenCalled();
    });

    unmount();

    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: OAuth Authentication
// ============================================================================

describe('signInWithOAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign in with Google OAuth', async () => {
    setupMocks({ session: null, user: null });
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'google' as any, url: 'https://oauth.url' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signInWithOAuth('google');
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
      },
    });
  });

  it('should sign in with GitHub OAuth', async () => {
    setupMocks({ session: null, user: null });
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: 'github' as any, url: 'https://oauth.url' },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.signInWithOAuth('github');
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: {
        redirectTo: 'http://localhost:3000/auth/callback',
      },
    });
  });

  it('should handle OAuth errors', async () => {
    setupMocks({ session: null, user: null });
    const mockError: AuthError = {
      name: 'AuthError',
      message: 'OAuth failed',
      status: 400,
    };
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValue({
      data: { provider: null as any, url: null },
      error: mockError,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.signInWithOAuth('google');
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Tests: Email Authentication
// ============================================================================

describe('signInWithEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign in with email and password', async () => {
    setupMocks({ session: null, user: null });
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: mockSession, user: mockAuthUser },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const response = await act(async () => {
      return await result.current.signInWithEmail('test@example.com', 'password123');
    });

    expect(response.error).toBeNull();
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('should handle invalid credentials', async () => {
    setupMocks({ session: null, user: null });
    const mockError: AuthError = {
      name: 'AuthError',
      message: 'Invalid credentials',
      status: 401,
    };
    vi.mocked(supabase.auth.signInWithPassword).mockResolvedValue({
      data: { session: null, user: null },
      error: mockError,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const response = await act(async () => {
      return await result.current.signInWithEmail('test@example.com', 'wrongpassword');
    });

    expect(response.error).toEqual(mockError);
  });
});

// ============================================================================
// Tests: Sign Up
// ============================================================================

describe('signUp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign up new user', async () => {
    setupMocks({ session: null, user: null });
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { session: mockSession, user: mockAuthUser },
      error: null,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const response = await act(async () => {
      return await result.current.signUp('test@example.com', 'password123', 'Test User');
    });

    expect(response.error).toBeNull();
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      options: {
        data: {
          full_name: 'Test User',
        },
      },
    });
  });

  it('should handle duplicate email error', async () => {
    setupMocks({ session: null, user: null });
    const mockError: AuthError = {
      name: 'AuthError',
      message: 'User already registered',
      status: 422,
    };
    vi.mocked(supabase.auth.signUp).mockResolvedValue({
      data: { session: null, user: null },
      error: mockError,
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    const response = await act(async () => {
      return await result.current.signUp('existing@example.com', 'password123', 'Test User');
    });

    expect(response.error).toEqual(mockError);
  });
});

// ============================================================================
// Tests: Sign Out
// ============================================================================

describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should sign out user', async () => {
    setupMocks({ session: mockSession });
    vi.mocked(supabase.auth.signOut).mockResolvedValue({ error: null });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockAppUser);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(supabase.auth.signOut).toHaveBeenCalled();
    expect(result.current.user).toBeNull();
  });

  it('should handle sign out errors gracefully', async () => {
    setupMocks({ session: mockSession });
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(supabase.auth.signOut).mockResolvedValue({
      error: { name: 'Error', message: 'Sign out failed', status: 500 },
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.user).toEqual(mockAppUser);
    });

    await act(async () => {
      await result.current.signOut();
    });

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Tests: Permission Checking
// ============================================================================

describe('hasPermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return true for allowed permissions', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasPermission('sessions', 'create')).toBe(true);
    expect(result.current.hasPermission('workflows', 'create')).toBe(true);
  });

  it('should return false for denied permissions', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasPermission('users', 'delete')).toBe(false);
  });

  it('should return false for undefined permissions', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.hasPermission('unknown', 'action')).toBe(false);
  });
});

// ============================================================================
// Tests: Role Helpers
// ============================================================================

describe('Role Helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should identify admin users', async () => {
    const adminPermissions = [
      ...mockPermissions,
      { resource: 'users', action: 'delete', allowed: true },
    ];
    setupMocks({ session: mockSession, permissions: adminPermissions });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAdmin).toBe(true);
  });

  it('should identify non-admin users', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isAdmin).toBe(false);
  });

  it('should identify member users', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isMember).toBe(true);
  });
});

// ============================================================================
// Tests: useRequireAuth Hook
// ============================================================================

describe('useRequireAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return user when authenticated', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => useRequireAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    expect(result.current.user).toEqual(mockAppUser);
  });

  it('should redirect when not authenticated', async () => {
    setupMocks({ session: null, user: null });

    renderHook(() => useRequireAuth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
  });
});

// ============================================================================
// Tests: usePermission Hook
// ============================================================================

describe('usePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return permission status', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => usePermission('sessions', 'create'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allowed).toBe(true);
  });

  it('should return false for denied permission', async () => {
    setupMocks({ session: mockSession });

    const { result } = renderHook(() => usePermission('users', 'delete'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.allowed).toBe(false);
  });
});
