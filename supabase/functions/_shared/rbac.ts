/**
 * Role-Based Access Control (RBAC) Module
 *
 * Provides permission checking and authorization for the AI Agent Workbench.
 * Works in conjunction with auth.ts to enforce fine-grained access control.
 *
 * @module rbac
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { AuthenticatedUser, createErrorResponse } from './auth.ts';

// ============================================================================
// Types
// ============================================================================

export type UserRole = 'admin' | 'member' | 'viewer';

export type Resource =
  | 'sessions'
  | 'workflows'
  | 'secrets'
  | 'users'
  | 'organizations'
  | 'analytics';

export type Action =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'execute'
  | 'share';

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

// ============================================================================
// Permission Checking
// ============================================================================

/**
 * Check if user has permission for a specific action on a resource
 *
 * @param supabase - Supabase client
 * @param user - Authenticated user
 * @param resource - Resource type (e.g., 'sessions', 'workflows')
 * @param action - Action type (e.g., 'create', 'read', 'update')
 * @param organizationId - Optional organization ID (defaults to user's organization)
 * @returns Promise<PermissionCheck>
 *
 * @example
 * ```ts
 * const check = await checkPermission(supabase, user, 'workflows', 'create');
 * if (!check.allowed) {
 *   return createErrorResponse('forbidden', check.reason || 'Access denied', 403);
 * }
 * ```
 */
export async function checkPermission(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  resource: Resource,
  action: Action,
  organizationId?: string
): Promise<PermissionCheck> {
  try {
    const targetOrgId = organizationId || user.organization_id;

    // User must have an organization
    if (!targetOrgId) {
      return {
        allowed: false,
        reason: 'User does not belong to an organization',
      };
    }

    // Get user's role in the organization
    const { data: roleData, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', targetOrgId)
      .single();

    if (roleError || !roleData) {
      return {
        allowed: false,
        reason: 'User has no role in this organization',
      };
    }

    const role = roleData.role as UserRole;

    // Check permission in permissions table
    const { data: permData, error: permError } = await supabase
      .from('permissions')
      .select('allowed')
      .eq('role', role)
      .eq('resource', resource)
      .eq('action', action)
      .single();

    if (permError || !permData) {
      return {
        allowed: false,
        reason: `No permission defined for ${role} to ${action} ${resource}`,
      };
    }

    return {
      allowed: permData.allowed,
      reason: permData.allowed ? undefined : `Role ${role} cannot ${action} ${resource}`,
    };
  } catch (err) {
    console.error('Permission check error:', err);
    return {
      allowed: false,
      reason: 'Error checking permissions',
    };
  }
}

/**
 * Check multiple permissions at once
 *
 * @returns Object with permission results keyed by action
 *
 * @example
 * ```ts
 * const permissions = await checkMultiplePermissions(
 *   supabase,
 *   user,
 *   'workflows',
 *   ['read', 'update', 'delete']
 * );
 * // permissions = { read: true, update: true, delete: false }
 * ```
 */
export async function checkMultiplePermissions(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  resource: Resource,
  actions: Action[]
): Promise<Record<Action, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.all(
    actions.map(async (action) => {
      const check = await checkPermission(supabase, user, resource, action);
      results[action] = check.allowed;
    })
  );

  return results as Record<Action, boolean>;
}

/**
 * Middleware to require specific permission for an edge function
 *
 * @example
 * ```ts
 * serve(requireAuth(requirePermission('workflows', 'create', async (req, user, supabase) => {
 *   // User has permission to create workflows
 *   return createSuccessResponse({ success: true });
 * })));
 * ```
 */
export function requirePermission(
  resource: Resource,
  action: Action,
  handler: (req: Request, user: AuthenticatedUser, supabase: SupabaseClient) => Promise<Response>
) {
  return async (
    req: Request,
    user: AuthenticatedUser,
    supabase: SupabaseClient
  ): Promise<Response> => {
    const check = await checkPermission(supabase, user, resource, action);

    if (!check.allowed) {
      return createErrorResponse(
        'forbidden',
        check.reason || 'You do not have permission to perform this action',
        403
      );
    }

    return handler(req, user, supabase);
  };
}

/**
 * Check if user is an admin in their organization
 */
export async function isAdmin(
  supabase: SupabaseClient,
  user: AuthenticatedUser
): Promise<boolean> {
  if (!user.organization_id) {
    return false;
  }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', user.organization_id)
    .single();

  return data?.role === 'admin';
}

/**
 * Check if user is a member (or higher) in their organization
 */
export async function isMemberOrHigher(
  supabase: SupabaseClient,
  user: AuthenticatedUser
): Promise<boolean> {
  if (!user.organization_id) {
    return false;
  }

  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', user.organization_id)
    .single();

  return data?.role === 'admin' || data?.role === 'member';
}

/**
 * Get all permissions for a user's role
 *
 * Useful for UI to show/hide features based on permissions
 */
export async function getUserPermissions(
  supabase: SupabaseClient,
  user: AuthenticatedUser
): Promise<Record<string, Record<string, boolean>>> {
  if (!user.organization_id) {
    return {};
  }

  // Get user's role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .eq('organization_id', user.organization_id)
    .single();

  if (!roleData) {
    return {};
  }

  // Get all permissions for this role
  const { data: permissions } = await supabase
    .from('permissions')
    .select('resource, action, allowed')
    .eq('role', roleData.role);

  if (!permissions) {
    return {};
  }

  // Format as nested object: { resource: { action: allowed } }
  const result: Record<string, Record<string, boolean>> = {};

  for (const perm of permissions) {
    if (!result[perm.resource]) {
      result[perm.resource] = {};
    }
    result[perm.resource][perm.action] = perm.allowed;
  }

  return result;
}

/**
 * Check if user owns a resource (for resource-level permissions)
 *
 * @example
 * ```ts
 * const owns = await userOwnsResource(supabase, user, 'workflows', workflowId);
 * if (!owns) {
 *   return createErrorResponse('forbidden', 'Not your workflow', 403);
 * }
 * ```
 */
export async function userOwnsResource(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  resource: Resource,
  resourceId: string
): Promise<boolean> {
  let tableName: string;

  switch (resource) {
    case 'sessions':
      tableName = 'free_agent_sessions';
      break;
    case 'workflows':
      tableName = 'workflows';
      break;
    case 'secrets':
      tableName = 'user_secrets';
      break;
    default:
      return false;
  }

  const { data } = await supabase
    .from(tableName)
    .select('user_id')
    .eq('id', resourceId)
    .single();

  return data?.user_id === user.id;
}

/**
 * Check if user can access resource in organization
 *
 * Resources can be private (user only), organization-wide, or public
 */
export async function canAccessResource(
  supabase: SupabaseClient,
  user: AuthenticatedUser,
  resource: Resource,
  resourceId: string
): Promise<PermissionCheck> {
  // Check if user owns the resource
  const owns = await userOwnsResource(supabase, user, resource, resourceId);
  if (owns) {
    return { allowed: true };
  }

  // Check if resource is organization-wide and user is in organization
  let tableName: string;

  switch (resource) {
    case 'workflows':
      tableName = 'workflows';
      break;
    case 'sessions':
      tableName = 'free_agent_sessions';
      break;
    default:
      return {
        allowed: false,
        reason: 'Resource type does not support organization sharing',
      };
  }

  const { data } = await supabase
    .from(tableName)
    .select('organization_id, visibility')
    .eq('id', resourceId)
    .single();

  if (!data) {
    return {
      allowed: false,
      reason: 'Resource not found',
    };
  }

  // Check visibility
  if (data.visibility === 'public') {
    return { allowed: true };
  }

  if (data.visibility === 'organization' && data.organization_id === user.organization_id) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'You do not have access to this resource',
  };
}

/**
 * Middleware to require admin role
 */
export function requireAdmin(
  handler: (req: Request, user: AuthenticatedUser, supabase: SupabaseClient) => Promise<Response>
) {
  return async (
    req: Request,
    user: AuthenticatedUser,
    supabase: SupabaseClient
  ): Promise<Response> => {
    const admin = await isAdmin(supabase, user);

    if (!admin) {
      return createErrorResponse(
        'forbidden',
        'Admin access required',
        403
      );
    }

    return handler(req, user, supabase);
  };
}

/**
 * Assign role to user in organization
 *
 * Only admins can call this
 */
export async function assignRole(
  supabase: SupabaseClient,
  adminUser: AuthenticatedUser,
  targetUserId: string,
  organizationId: string,
  role: UserRole
): Promise<{ success: boolean; error?: string }> {
  // Verify admin has permission
  const adminCheck = await isAdmin(supabase, adminUser);
  if (!adminCheck) {
    return {
      success: false,
      error: 'Only admins can assign roles',
    };
  }

  // Verify both users are in the same organization
  if (adminUser.organization_id !== organizationId) {
    return {
      success: false,
      error: 'Cannot assign roles in other organizations',
    };
  }

  // Assign role
  const { error } = await supabase
    .from('user_roles')
    .upsert(
      {
        user_id: targetUserId,
        organization_id: organizationId,
        role,
        created_by: adminUser.id,
      },
      {
        onConflict: 'user_id,organization_id',
      }
    );

  if (error) {
    return {
      success: false,
      error: error.message,
    };
  }

  return { success: true };
}
