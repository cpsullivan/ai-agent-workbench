/**
 * Tests for ProtectedRoute Component
 *
 * Test suite covering:
 * - Authentication requirement
 * - Admin role requirement
 * - Permission-based access control
 * - Loading states
 * - Fallback rendering
 * - Redirect behavior
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ProtectedRoute, { withAuth } from '../ProtectedRoute';
import { AuthProvider } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      onAuthStateChange: vi.fn(),
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
window.history.back = vi.fn();

// ============================================================================
// Test Data
// ============================================================================

const mockAuthUser: User = {
  id: 'auth-user-123',
  email: 'test@example.com',
  user_metadata: { full_name: 'Test User' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

const mockSession: Session = {
  access_token: 'mock-token',
  refresh_token: 'mock-refresh',
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

const mockRole = { role: 'member' };

const mockMemberPermissions = [
  { resource: 'sessions', action: 'create', allowed: true },
  { resource: 'sessions', action: 'read', allowed: true },
  { resource: 'workflows', action: 'create', allowed: true },
  { resource: 'users', action: 'delete', allowed: false },
];

const mockAdminPermissions = [
  ...mockMemberPermissions,
  { resource: 'users', action: 'delete', allowed: true },
];

// ============================================================================
// Helper Functions
// ============================================================================

function setupMocks(options: {
  session?: Session | null;
  user?: typeof mockAppUser | null;
  permissions?: any[];
  loading?: boolean;
}) {
  const {
    session = mockSession,
    user = mockAppUser,
    permissions = mockMemberPermissions,
    loading = false,
  } = options;

  if (loading) {
    vi.mocked(supabase.auth.getSession).mockImplementation(
      () => new Promise(() => {}) // Never resolves - stays in loading state
    );
  } else {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session },
      error: null,
    });
  }

  const subscription = { unsubscribe: vi.fn() };
  vi.mocked(supabase.auth.onAuthStateChange).mockReturnValue({
    data: { subscription },
  } as any);

  const fromMock = vi.mocked(supabase.from);
  fromMock.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
    };

    if (table === 'users') {
      query.single.mockResolvedValue({ data: user, error: null });
    } else if (table === 'user_roles') {
      query.single.mockResolvedValue({ data: mockRole, error: null });
    } else if (table === 'permissions') {
      const selectMock = query.select as any;
      selectMock.mockImplementation(() => ({
        ...query,
        eq: vi.fn(() => ({ data: permissions, error: null })),
      }));
    }

    return query;
  });
}

function renderWithAuth(ui: React.ReactElement) {
  return render(<AuthProvider>{ui}</AuthProvider>);
}

// ============================================================================
// Tests: Loading State
// ============================================================================

describe('ProtectedRoute - Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should show loading spinner while authenticating', async () => {
    setupMocks({ loading: true });

    renderWithAuth(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
  });
});

// ============================================================================
// Tests: Authentication Requirement
// ============================================================================

describe('ProtectedRoute - Authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.location.href = '';
  });

  it('should render children when user is authenticated', async () => {
    setupMocks({ session: mockSession });

    renderWithAuth(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });
  });

  it('should redirect to login when user is not authenticated', async () => {
    setupMocks({ session: null, user: null });

    renderWithAuth(
      <ProtectedRoute>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(window.location.href).toBe('/login');
    });
  });

  it('should render fallback when not authenticated', async () => {
    setupMocks({ session: null, user: null });

    renderWithAuth(
      <ProtectedRoute fallback={<div>Please log in</div>}>
        <div>Protected Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Please log in')).toBeInTheDocument();
    });
  });

  it('should not require auth when requireAuth is false', async () => {
    setupMocks({ session: null, user: null });

    renderWithAuth(
      <ProtectedRoute requireAuth={false}>
        <div>Public Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Public Content')).toBeInTheDocument();
    });
  });
});

// ============================================================================
// Tests: Admin Requirement
// ============================================================================

describe('ProtectedRoute - Admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow admin users to access admin routes', async () => {
    setupMocks({ session: mockSession, permissions: mockAdminPermissions });

    renderWithAuth(
      <ProtectedRoute requireAdmin={true}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Admin Content')).toBeInTheDocument();
    });
  });

  it('should deny non-admin users access to admin routes', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute requireAdmin={true}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.getByText(/administrator privileges/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('Admin Content')).not.toBeInTheDocument();
  });

  it('should show Go Back button on admin access denied', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute requireAdmin={true}>
        <div>Admin Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    const goBackButton = screen.getByRole('button', { name: /go back/i });
    expect(goBackButton).toBeInTheDocument();

    goBackButton.click();
    expect(window.history.back).toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: Permission Requirement
// ============================================================================

describe('ProtectedRoute - Permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow users with correct permissions', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute requirePermission={{ resource: 'sessions', action: 'create' }}>
        <div>Create Session</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Create Session')).toBeInTheDocument();
    });
  });

  it('should deny users without correct permissions', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute requirePermission={{ resource: 'users', action: 'delete' }}>
        <div>Delete Users</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Insufficient Permissions')).toBeInTheDocument();
      expect(screen.getByText(/don't have permission to delete users/i)).toBeInTheDocument();
    });

    expect(screen.queryByText('Delete Users')).not.toBeInTheDocument();
  });

  it('should show Go Back button on permission denied', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute requirePermission={{ resource: 'users', action: 'delete' }}>
        <div>Delete Users</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Insufficient Permissions')).toBeInTheDocument();
    });

    const goBackButton = screen.getByRole('button', { name: /go back/i });
    expect(goBackButton).toBeInTheDocument();

    goBackButton.click();
    expect(window.history.back).toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: Combined Requirements
// ============================================================================

describe('ProtectedRoute - Combined Requirements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should check authentication before permissions', async () => {
    setupMocks({ session: null, user: null });

    renderWithAuth(
      <ProtectedRoute
        requireAuth={true}
        requirePermission={{ resource: 'sessions', action: 'create' }}
        fallback={<div>Not Authenticated</div>}
      >
        <div>Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Not Authenticated')).toBeInTheDocument();
    });

    // Should not show permission error
    expect(screen.queryByText('Insufficient Permissions')).not.toBeInTheDocument();
  });

  it('should check admin before permissions', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    renderWithAuth(
      <ProtectedRoute
        requireAdmin={true}
        requirePermission={{ resource: 'sessions', action: 'create' }}
      >
        <div>Content</div>
      </ProtectedRoute>
    );

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    // Should show admin denial, not permission denial
    expect(screen.getByText(/administrator privileges/i)).toBeInTheDocument();
  });
});

// ============================================================================
// Tests: withAuth HOC
// ============================================================================

describe('withAuth HOC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should wrap component with protection', async () => {
    setupMocks({ session: mockSession });

    function TestComponent({ message }: { message: string }) {
      return <div>{message}</div>;
    }

    const ProtectedComponent = withAuth(TestComponent);

    renderWithAuth(<ProtectedComponent message="Hello World" />);

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  it('should apply protection options', async () => {
    setupMocks({ session: mockSession, permissions: mockAdminPermissions });

    function AdminComponent() {
      return <div>Admin Panel</div>;
    }

    const ProtectedAdminComponent = withAuth(AdminComponent, {
      requireAdmin: true,
    });

    renderWithAuth(<ProtectedAdminComponent />);

    await waitFor(() => {
      expect(screen.getByText('Admin Panel')).toBeInTheDocument();
    });
  });

  it('should deny access with HOC when requirements not met', async () => {
    setupMocks({ session: mockSession, permissions: mockMemberPermissions });

    function AdminComponent() {
      return <div>Admin Panel</div>;
    }

    const ProtectedAdminComponent = withAuth(AdminComponent, {
      requireAdmin: true,
    });

    renderWithAuth(<ProtectedAdminComponent />);

    await waitFor(() => {
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
    });

    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument();
  });
});
