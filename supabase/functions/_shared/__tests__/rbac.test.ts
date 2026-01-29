/**
 * Tests for RBAC (Role-Based Access Control) Module
 *
 * Test suite covering:
 * - Permission checking for resources and actions
 * - Role-based access control (admin, member, viewer)
 * - Resource ownership verification
 * - Organization-based access control
 * - Middleware functions
 * - Role assignment
 */

import { describe, it, expect, beforeEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import {
  checkPermission,
  checkMultiplePermissions,
  requirePermission,
  isAdmin,
  isMemberOrHigher,
  getUserPermissions,
  userOwnsResource,
  canAccessResource,
  requireAdmin,
  assignRole,
} from '../rbac.ts';
import type { AuthenticatedUser } from '../auth.ts';

// ============================================================================
// Mock Data
// ============================================================================

const mockAdminUser: AuthenticatedUser = {
  id: 'user-admin',
  email: 'admin@example.com',
  full_name: 'Admin User',
  organization_id: 'org-123',
  auth_user_id: 'auth-admin',
  role: 'admin',
};

const mockMemberUser: AuthenticatedUser = {
  id: 'user-member',
  email: 'member@example.com',
  full_name: 'Member User',
  organization_id: 'org-123',
  auth_user_id: 'auth-member',
  role: 'member',
};

const mockViewerUser: AuthenticatedUser = {
  id: 'user-viewer',
  email: 'viewer@example.com',
  full_name: 'Viewer User',
  organization_id: 'org-123',
  auth_user_id: 'auth-viewer',
  role: 'viewer',
};

const mockUserWithoutOrg: AuthenticatedUser = {
  id: 'user-no-org',
  email: 'noorg@example.com',
  full_name: 'No Org User',
  organization_id: null,
  auth_user_id: 'auth-no-org',
};

// ============================================================================
// Mock Permissions
// ============================================================================

const mockPermissions = {
  admin: {
    sessions: { create: true, read: true, update: true, delete: true, execute: true },
    workflows: { create: true, read: true, update: true, delete: true, execute: true },
    secrets: { create: true, read: true, update: true, delete: true },
    users: { create: true, read: true, update: true, delete: true },
    organizations: { create: true, read: true, update: true, delete: true },
    analytics: { read: true },
  },
  member: {
    sessions: { create: true, read: true, update: true, delete: false, execute: true },
    workflows: { create: true, read: true, update: true, delete: false, execute: true },
    secrets: { create: true, read: true, update: true, delete: true },
    users: { create: false, read: true, update: false, delete: false },
    organizations: { create: false, read: true, update: false, delete: false },
    analytics: { read: true },
  },
  viewer: {
    sessions: { create: false, read: true, update: false, delete: false, execute: false },
    workflows: { create: false, read: true, update: false, delete: false, execute: false },
    secrets: { create: false, read: true, update: false, delete: false },
    users: { create: false, read: true, update: false, delete: false },
    organizations: { create: false, read: true, update: false, delete: false },
    analytics: { read: true },
  },
};

// ============================================================================
// Mock Supabase Client
// ============================================================================

function createMockSupabase(options: {
  role?: string;
  permissions?: any;
  ownsResource?: boolean;
  resourceData?: any;
}) {
  const {
    role = 'member',
    permissions = mockPermissions[role as keyof typeof mockPermissions],
    ownsResource = true,
    resourceData = null,
  } = options;

  return {
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: () => query,
        single: async () => {
          if (table === 'user_roles') {
            return { data: { role }, error: null };
          }
          if (table === 'permissions') {
            // Return flat array of permissions
            const perms: any[] = [];
            Object.keys(permissions).forEach((resource) => {
              Object.keys(permissions[resource]).forEach((action) => {
                perms.push({
                  resource,
                  action,
                  allowed: permissions[resource][action],
                });
              });
            });
            return { data: perms, error: null };
          }
          if (table === 'free_agent_sessions' || table === 'workflows' || table === 'user_secrets') {
            if (ownsResource) {
              return {
                data: resourceData || { user_id: 'user-member', ...resourceData },
                error: null,
              };
            }
            return { data: { user_id: 'other-user' }, error: null };
          }
          return { data: null, error: null };
        },
        upsert: () => ({
          data: null,
          error: null,
        }),
      };
      // For multi-row queries
      if (table === 'permissions') {
        const selectFn = query.select as any;
        const eqFn = () => {
          const perms: any[] = [];
          Object.keys(permissions).forEach((resource) => {
            Object.keys(permissions[resource]).forEach((action) => {
              perms.push({
                resource,
                action,
                allowed: permissions[resource][action],
              });
            });
          });
          return Promise.resolve({ data: perms, error: null });
        };
        selectFn.mockReturnValue = () => ({ eq: eqFn });
      }
      return query;
    },
  };
}

// ============================================================================
// Tests: checkPermission
// ============================================================================

describe('checkPermission', () => {
  it('should allow admin to create sessions', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await checkPermission(supabase, mockAdminUser, 'sessions', 'create');

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should allow member to create workflows', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await checkPermission(supabase, mockMemberUser, 'workflows', 'create');

    expect(result.allowed).toBe(true);
  });

  it('should deny viewer from creating sessions', async () => {
    const supabase = createMockSupabase({ role: 'viewer' }) as any;

    const result = await checkPermission(supabase, mockViewerUser, 'sessions', 'create');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('viewer cannot create sessions');
  });

  it('should deny member from deleting users', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await checkPermission(supabase, mockMemberUser, 'users', 'delete');

    expect(result.allowed).toBe(false);
  });

  it('should deny user without organization', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await checkPermission(supabase, mockUserWithoutOrg, 'sessions', 'create');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('does not belong to an organization');
  });

  it('should deny user with no role in organization', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: 'No role found' } }),
          }),
        }),
      }),
    } as any;

    const result = await checkPermission(supabase, mockMemberUser, 'sessions', 'create');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('no role');
  });
});

// ============================================================================
// Tests: checkMultiplePermissions
// ============================================================================

describe('checkMultiplePermissions', () => {
  it('should check multiple permissions for admin', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await checkMultiplePermissions(
      supabase,
      mockAdminUser,
      'sessions',
      ['create', 'read', 'update', 'delete']
    );

    expect(result.create).toBe(true);
    expect(result.read).toBe(true);
    expect(result.update).toBe(true);
    expect(result.delete).toBe(true);
  });

  it('should show mixed results for member', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await checkMultiplePermissions(
      supabase,
      mockMemberUser,
      'sessions',
      ['create', 'delete']
    );

    expect(result.create).toBe(true);
    expect(result.delete).toBe(false);
  });

  it('should return all false for viewer on write actions', async () => {
    const supabase = createMockSupabase({ role: 'viewer' }) as any;

    const result = await checkMultiplePermissions(
      supabase,
      mockViewerUser,
      'workflows',
      ['create', 'update', 'delete']
    );

    expect(result.create).toBe(false);
    expect(result.update).toBe(false);
    expect(result.delete).toBe(false);
  });
});

// ============================================================================
// Tests: requirePermission Middleware
// ============================================================================

describe('requirePermission', () => {
  it('should call handler when permission is granted', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;
    let handlerCalled = false;

    const handler = requirePermission('sessions', 'create', async (req, user, supabase) => {
      handlerCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const req = new Request('https://api.example.com/test');
    const response = await handler(req, mockAdminUser, supabase);

    expect(handlerCalled).toBe(true);
    expect(response.status).toBe(200);
  });

  it('should return 403 when permission is denied', async () => {
    const supabase = createMockSupabase({ role: 'viewer' }) as any;
    let handlerCalled = false;

    const handler = requirePermission('sessions', 'create', async (req, user, supabase) => {
      handlerCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const req = new Request('https://api.example.com/test');
    const response = await handler(req, mockViewerUser, supabase);

    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe('forbidden');
  });
});

// ============================================================================
// Tests: isAdmin
// ============================================================================

describe('isAdmin', () => {
  it('should return true for admin user', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await isAdmin(supabase, mockAdminUser);

    expect(result).toBe(true);
  });

  it('should return false for member user', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await isAdmin(supabase, mockMemberUser);

    expect(result).toBe(false);
  });

  it('should return false for viewer user', async () => {
    const supabase = createMockSupabase({ role: 'viewer' }) as any;

    const result = await isAdmin(supabase, mockViewerUser);

    expect(result).toBe(false);
  });

  it('should return false for user without organization', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await isAdmin(supabase, mockUserWithoutOrg);

    expect(result).toBe(false);
  });
});

// ============================================================================
// Tests: isMemberOrHigher
// ============================================================================

describe('isMemberOrHigher', () => {
  it('should return true for admin', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await isMemberOrHigher(supabase, mockAdminUser);

    expect(result).toBe(true);
  });

  it('should return true for member', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await isMemberOrHigher(supabase, mockMemberUser);

    expect(result).toBe(true);
  });

  it('should return false for viewer', async () => {
    const supabase = createMockSupabase({ role: 'viewer' }) as any;

    const result = await isMemberOrHigher(supabase, mockViewerUser);

    expect(result).toBe(false);
  });
});

// ============================================================================
// Tests: getUserPermissions
// ============================================================================

describe('getUserPermissions', () => {
  it('should return all permissions for user role', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    // Mock the from().select().eq() chain to return permissions
    supabase.from = (table: string) => {
      if (table === 'user_roles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { role: 'member' }, error: null }),
            }),
          }),
        };
      }
      if (table === 'permissions') {
        return {
          select: () => ({
            eq: () => ({
              data: [
                { resource: 'sessions', action: 'create', allowed: true },
                { resource: 'sessions', action: 'read', allowed: true },
                { resource: 'users', action: 'delete', allowed: false },
              ],
              error: null,
            }),
          }),
        };
      }
      return { select: () => ({}) };
    };

    const result = await getUserPermissions(supabase, mockMemberUser);

    expect(result.sessions).toBeDefined();
    expect(result.sessions.create).toBe(true);
    expect(result.sessions.read).toBe(true);
    expect(result.users.delete).toBe(false);
  });

  it('should return empty for user without organization', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await getUserPermissions(supabase, mockUserWithoutOrg);

    expect(result).toEqual({});
  });
});

// ============================================================================
// Tests: userOwnsResource
// ============================================================================

describe('userOwnsResource', () => {
  it('should return true when user owns session', async () => {
    const supabase = createMockSupabase({
      role: 'member',
      ownsResource: true,
      resourceData: { user_id: 'user-member' },
    }) as any;

    const result = await userOwnsResource(supabase, mockMemberUser, 'sessions', 'session-123');

    expect(result).toBe(true);
  });

  it('should return false when user does not own workflow', async () => {
    const supabase = createMockSupabase({
      role: 'member',
      ownsResource: false,
      resourceData: { user_id: 'other-user' },
    }) as any;

    const result = await userOwnsResource(supabase, mockMemberUser, 'workflows', 'workflow-123');

    expect(result).toBe(false);
  });

  it('should return true when user owns secret', async () => {
    const supabase = createMockSupabase({
      role: 'member',
      ownsResource: true,
      resourceData: { user_id: 'user-member' },
    }) as any;

    const result = await userOwnsResource(supabase, mockMemberUser, 'secrets', 'secret-123');

    expect(result).toBe(true);
  });

  it('should return false for unsupported resource types', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await userOwnsResource(
      supabase,
      mockMemberUser,
      'analytics' as any,
      'analytics-123'
    );

    expect(result).toBe(false);
  });
});

// ============================================================================
// Tests: canAccessResource
// ============================================================================

describe('canAccessResource', () => {
  it('should allow access when user owns resource', async () => {
    const supabase = createMockSupabase({
      role: 'member',
      ownsResource: true,
      resourceData: { user_id: 'user-member' },
    }) as any;

    const result = await canAccessResource(supabase, mockMemberUser, 'workflows', 'workflow-123');

    expect(result.allowed).toBe(true);
  });

  it('should allow access to public resources', async () => {
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                user_id: 'other-user',
                organization_id: 'org-123',
                visibility: 'public',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const result = await canAccessResource(supabase, mockMemberUser, 'workflows', 'workflow-123');

    expect(result.allowed).toBe(true);
  });

  it('should allow access to organization resources', async () => {
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                user_id: 'other-user',
                organization_id: 'org-123',
                visibility: 'organization',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const result = await canAccessResource(supabase, mockMemberUser, 'workflows', 'workflow-123');

    expect(result.allowed).toBe(true);
  });

  it('should deny access to private resources', async () => {
    const supabase = {
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: {
                user_id: 'other-user',
                organization_id: 'other-org',
                visibility: 'private',
              },
              error: null,
            }),
          }),
        }),
      }),
    } as any;

    const result = await canAccessResource(supabase, mockMemberUser, 'workflows', 'workflow-123');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('do not have access');
  });
});

// ============================================================================
// Tests: requireAdmin Middleware
// ============================================================================

describe('requireAdmin', () => {
  it('should call handler for admin user', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;
    let handlerCalled = false;

    const handler = requireAdmin(async (req, user, supabase) => {
      handlerCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const req = new Request('https://api.example.com/test');
    const response = await handler(req, mockAdminUser, supabase);

    expect(handlerCalled).toBe(true);
    expect(response.status).toBe(200);
  });

  it('should return 403 for non-admin user', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;
    let handlerCalled = false;

    const handler = requireAdmin(async (req, user, supabase) => {
      handlerCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });

    const req = new Request('https://api.example.com/test');
    const response = await handler(req, mockMemberUser, supabase);

    expect(handlerCalled).toBe(false);
    expect(response.status).toBe(403);

    const body = await response.json();
    expect(body.error).toBe('forbidden');
    expect(body.message).toContain('Admin access required');
  });
});

// ============================================================================
// Tests: assignRole
// ============================================================================

describe('assignRole', () => {
  it('should allow admin to assign role', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    supabase.from = (table: string) => {
      if (table === 'user_roles') {
        if (table === 'user_roles') {
          return {
            select: () => ({
              eq: () => ({
                single: async () => ({ data: { role: 'admin' }, error: null }),
              }),
            }),
            upsert: async () => ({ data: null, error: null }),
          };
        }
      }
      return { select: () => ({}), upsert: async () => ({}) };
    };

    const result = await assignRole(
      supabase,
      mockAdminUser,
      'user-target',
      'org-123',
      'member'
    );

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should deny non-admin from assigning roles', async () => {
    const supabase = createMockSupabase({ role: 'member' }) as any;

    const result = await assignRole(
      supabase,
      mockMemberUser,
      'user-target',
      'org-123',
      'admin'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Only admins');
  });

  it('should deny assigning roles in other organizations', async () => {
    const supabase = createMockSupabase({ role: 'admin' }) as any;

    const result = await assignRole(
      supabase,
      mockAdminUser,
      'user-target',
      'other-org',
      'member'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('other organizations');
  });
});
