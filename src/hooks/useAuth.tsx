/**
 * Authentication Hook
 *
 * Provides authentication state and functions to the React application.
 * Manages user session, login/logout, and permission checking.
 *
 * @module useAuth
 */

import { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { User as AppUser } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface AuthContextValue {
  // State
  user: AppUser | null;
  session: Session | null;
  loading: boolean;

  // Auth functions
  signInWithOAuth: (provider: 'google' | 'github' | 'azure') => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;

  // Permission checking
  hasPermission: (resource: string, action: string) => boolean;
  isAdmin: boolean;
  isMember: boolean;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// ============================================================================
// Provider Component
// ============================================================================

export interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({});

  // ============================================================================
  // Initialize auth state
  // ============================================================================

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event);
        setSession(session);

        if (session?.user) {
          await fetchUserProfile(session.user.id);
        } else {
          setUser(null);
          setPermissions({});
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // ============================================================================
  // Fetch user profile and permissions
  // ============================================================================

  async function fetchUserProfile(authUserId: string) {
    try {
      // Fetch user data
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, email, full_name, organization_id, auth_user_id, created_at, updated_at')
        .eq('auth_user_id', authUserId)
        .single();

      if (userError) {
        console.error('Error fetching user profile:', userError);
        setLoading(false);
        return;
      }

      if (!userData) {
        // User profile doesn't exist yet - create it
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser?.user) {
          await createUserProfile(authUser.user);
        }
        return;
      }

      setUser(userData);

      // Fetch user permissions
      if (userData.organization_id) {
        await fetchUserPermissions(userData.id, userData.organization_id);
      }

      // Update last login
      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', userData.id);

      setLoading(false);
    } catch (error) {
      console.error('Error in fetchUserProfile:', error);
      setLoading(false);
    }
  }

  async function fetchUserPermissions(userId: string, organizationId: string) {
    try {
      // Get user's role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .single();

      if (!roleData) {
        return;
      }

      // Get all permissions for this role
      const { data: permissionsData } = await supabase
        .from('permissions')
        .select('resource, action, allowed')
        .eq('role', roleData.role);

      if (!permissionsData) {
        return;
      }

      // Format as nested object
      const perms: Record<string, Record<string, boolean>> = {};
      for (const perm of permissionsData) {
        if (!perms[perm.resource]) {
          perms[perm.resource] = {};
        }
        perms[perm.resource][perm.action] = perm.allowed;
      }

      setPermissions(perms);
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  }

  async function createUserProfile(authUser: User) {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert({
          auth_user_id: authUser.id,
          email: authUser.email!,
          full_name: authUser.user_metadata?.full_name || null,
          avatar_url: authUser.user_metadata?.avatar_url || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating user profile:', error);
        return;
      }

      setUser(data);
      setLoading(false);
    } catch (error) {
      console.error('Error in createUserProfile:', error);
      setLoading(false);
    }
  }

  // ============================================================================
  // Authentication functions
  // ============================================================================

  async function signInWithOAuth(provider: 'google' | 'github' | 'azure') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error('OAuth sign in error:', error);
      throw error;
    }
  }

  async function signInWithEmail(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error };
  }

  async function signUp(email: string, password: string, fullName: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    return { error };
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Sign out error:', error);
    }
    setUser(null);
    setPermissions({});
  }

  // ============================================================================
  // Permission checking
  // ============================================================================

  function hasPermission(resource: string, action: string): boolean {
    return permissions[resource]?.[action] === true;
  }

  const isAdmin = user?.organization_id
    ? hasPermission('users', 'delete') // Only admins can delete users
    : false;

  const isMember = user?.organization_id
    ? hasPermission('sessions', 'create') // Members and admins can create sessions
    : false;

  // ============================================================================
  // Context value
  // ============================================================================

  const value: AuthContextValue = {
    user,
    session,
    loading,
    signInWithOAuth,
    signInWithEmail,
    signUp,
    signOut,
    hasPermission,
    isAdmin,
    isMember,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use authentication context
 *
 * @throws Error if used outside AuthProvider
 *
 * @example
 * ```tsx
 * const { user, signInWithOAuth, signOut } = useAuth();
 *
 * if (!user) {
 *   return <LoginForm onLogin={() => signInWithOAuth('google')} />;
 * }
 *
 * return <Dashboard user={user} onLogout={signOut} />;
 * ```
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

// ============================================================================
// Helper hooks
// ============================================================================

/**
 * Hook to require authentication
 * Redirects to login if not authenticated
 */
export function useRequireAuth() {
  const { user, loading } = useAuth();
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Redirect to login
        window.location.href = '/login';
      } else {
        setIsReady(true);
      }
    }
  }, [user, loading]);

  return { user, loading, isReady };
}

/**
 * Hook to check specific permission
 */
export function usePermission(resource: string, action: string) {
  const { hasPermission, loading } = useAuth();
  return {
    allowed: hasPermission(resource, action),
    loading,
  };
}
