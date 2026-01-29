/**
 * Authentication Middleware for Supabase Edge Functions
 *
 * This module provides authentication and authorization utilities for all edge functions.
 * It verifies JWT tokens, extracts user information, and validates permissions.
 *
 * @module auth
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// Types
// ============================================================================

export interface AuthenticatedUser {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  auth_user_id: string;
  role?: string;
}

export interface AuthError {
  error: string;
  message: string;
  status: number;
}

export interface AuthResult {
  user: AuthenticatedUser | null;
  error: AuthError | null;
  supabase: SupabaseClient;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract JWT token from Authorization header
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}

/**
 * Create Supabase client with service role key
 */
function createServiceClient(): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Create Supabase client with user's JWT token
 */
function createUserClient(token: string): SupabaseClient {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
}

// ============================================================================
// Main Authentication Function
// ============================================================================

/**
 * Authenticate request and return user information
 *
 * This function:
 * 1. Extracts JWT token from Authorization header
 * 2. Verifies token with Supabase Auth
 * 3. Fetches user data from database
 * 4. Returns user object or error
 *
 * @param req - The incoming request
 * @returns AuthResult with user, error, and supabase client
 *
 * @example
 * ```ts
 * const { user, error, supabase } = await authenticateRequest(req);
 * if (error) {
 *   return new Response(JSON.stringify({ error }), { status: error.status });
 * }
 * // Use user and supabase client...
 * ```
 */
export async function authenticateRequest(req: Request): Promise<AuthResult> {
  try {
    // Extract token
    const token = extractToken(req);
    if (!token) {
      return {
        user: null,
        error: {
          error: 'unauthorized',
          message: 'Missing or invalid Authorization header',
          status: 401,
        },
        supabase: createServiceClient(),
      };
    }

    // Create client with user token
    const supabase = createUserClient(token);

    // Verify token and get auth user
    const { data: authData, error: authError } = await supabase.auth.getUser(token);

    if (authError || !authData?.user) {
      return {
        user: null,
        error: {
          error: 'unauthorized',
          message: authError?.message || 'Invalid token',
          status: 401,
        },
        supabase,
      };
    }

    // Fetch application user data
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, email, full_name, organization_id, auth_user_id')
      .eq('auth_user_id', authData.user.id)
      .single();

    if (userError || !userData) {
      // User not found in database - may need to create user profile
      return {
        user: null,
        error: {
          error: 'user_not_found',
          message: 'User profile not found. Please complete registration.',
          status: 404,
        },
        supabase,
      };
    }

    // Get user's role if they have an organization
    let role: string | undefined;
    if (userData.organization_id) {
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userData.id)
        .eq('organization_id', userData.organization_id)
        .single();

      role = roleData?.role;
    }

    return {
      user: {
        ...userData,
        role,
      },
      error: null,
      supabase,
    };
  } catch (err) {
    console.error('Authentication error:', err);
    return {
      user: null,
      error: {
        error: 'internal_error',
        message: 'An error occurred during authentication',
        status: 500,
      },
      supabase: createServiceClient(),
    };
  }
}

/**
 * Middleware to require authentication for an edge function
 *
 * @example
 * ```ts
 * serve(requireAuth(async (req, user, supabase) => {
 *   // user is guaranteed to be authenticated here
 *   return new Response(JSON.stringify({ user }));
 * }));
 * ```
 */
export function requireAuth(
  handler: (req: Request, user: AuthenticatedUser, supabase: SupabaseClient) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const { user, error, supabase } = await authenticateRequest(req);

    if (error || !user) {
      return new Response(
        JSON.stringify({
          error: error?.error || 'unauthorized',
          message: error?.message || 'Authentication required',
        }),
        {
          status: error?.status || 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return handler(req, user, supabase);
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  error: string,
  message: string,
  status: number
): Response {
  return new Response(
    JSON.stringify({ error, message }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(data: unknown, status = 200): Response {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}

/**
 * Update user's last login timestamp
 */
export async function updateLastLogin(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', userId);
}

/**
 * Create or update user profile from auth user
 *
 * This should be called when a new user signs up via OAuth
 */
export async function upsertUserProfile(
  supabase: SupabaseClient,
  authUserId: string,
  email: string,
  fullName?: string,
  avatarUrl?: string
): Promise<{ user: AuthenticatedUser | null; error: AuthError | null }> {
  try {
    const { data, error } = await supabase
      .from('users')
      .upsert(
        {
          auth_user_id: authUserId,
          email,
          full_name: fullName,
          avatar_url: avatarUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'auth_user_id',
          ignoreDuplicates: false,
        }
      )
      .select('id, email, full_name, organization_id, auth_user_id')
      .single();

    if (error) {
      return {
        user: null,
        error: {
          error: 'profile_upsert_failed',
          message: error.message,
          status: 500,
        },
      };
    }

    return {
      user: data,
      error: null,
    };
  } catch (err) {
    return {
      user: null,
      error: {
        error: 'internal_error',
        message: 'Failed to create/update user profile',
        status: 500,
      },
    };
  }
}
