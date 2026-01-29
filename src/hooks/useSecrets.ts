/**
 * Secrets Management Hook
 *
 * Provides functions to manage encrypted secrets (API keys, credentials)
 * Uses React Query for caching and state management
 *
 * @module useSecrets
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { EncryptedSecret } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface SecretInput {
  secret_key: string;
  secret_value: string;
  description?: string;
}

export interface SecretValue {
  secret_key: string;
  secret_value: string;
  retrieved_at: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * List all secrets for the current user (metadata only)
 */
async function listSecretsAPI(): Promise<EncryptedSecret[]> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secrets-list`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to list secrets');
  }

  const result = await response.json();
  return result.secrets;
}

/**
 * Get and decrypt a specific secret
 */
async function getSecretAPI(secretKey: string): Promise<SecretValue> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secrets-get`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret_key: secretKey }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to get secret');
  }

  return await response.json();
}

/**
 * Create or update a secret
 */
async function setSecretAPI(input: SecretInput): Promise<EncryptedSecret> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secrets-set`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to set secret');
  }

  return await response.json();
}

/**
 * Delete a secret
 */
async function deleteSecretAPI(secretKey: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/secrets-delete`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ secret_key: secretKey }),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to delete secret');
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use secrets management
 *
 * Provides functions and state for managing encrypted secrets
 *
 * @example
 * ```tsx
 * const { secrets, isLoading, createSecret, getSecret, deleteSecret } = useSecrets();
 *
 * // List all secrets
 * {secrets?.map(secret => (
 *   <div key={secret.id}>{secret.secret_key}</div>
 * ))}
 *
 * // Create a secret
 * await createSecret({
 *   secret_key: 'openai_api_key',
 *   secret_value: 'sk-...',
 *   description: 'OpenAI API Key'
 * });
 *
 * // Get a secret value
 * const { secret_value } = await getSecret('openai_api_key');
 * ```
 */
export function useSecrets() {
  const queryClient = useQueryClient();

  // List all secrets
  const {
    data: secrets,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['secrets'],
    queryFn: listSecretsAPI,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Get a specific secret (not cached for security)
  const getSecretMutation = useMutation({
    mutationFn: getSecretAPI,
  });

  // Create or update a secret
  const setSecretMutation = useMutation({
    mutationFn: setSecretAPI,
    onSuccess: () => {
      // Invalidate secrets list to refresh
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
    },
  });

  // Delete a secret
  const deleteSecretMutation = useMutation({
    mutationFn: deleteSecretAPI,
    onSuccess: () => {
      // Invalidate secrets list to refresh
      queryClient.invalidateQueries({ queryKey: ['secrets'] });
    },
  });

  return {
    // Data
    secrets,
    isLoading,
    error,

    // Actions
    refetch,
    getSecret: getSecretMutation.mutateAsync,
    createSecret: setSecretMutation.mutateAsync,
    updateSecret: setSecretMutation.mutateAsync,
    deleteSecret: deleteSecretMutation.mutateAsync,

    // Mutation states
    isCreating: setSecretMutation.isPending,
    isDeleting: deleteSecretMutation.isPending,
    isGetting: getSecretMutation.isPending,

    // Mutation errors
    createError: setSecretMutation.error,
    deleteError: deleteSecretMutation.error,
    getError: getSecretMutation.error,
  };
}

// ============================================================================
// Helper Hooks
// ============================================================================

/**
 * Hook to get a specific secret by key
 *
 * Note: This does NOT cache the decrypted value for security reasons
 */
export function useSecret(secretKey: string) {
  const getSecretMutation = useMutation({
    mutationFn: () => getSecretAPI(secretKey),
  });

  return {
    getSecret: getSecretMutation.mutateAsync,
    secretValue: getSecretMutation.data?.secret_value,
    isLoading: getSecretMutation.isPending,
    error: getSecretMutation.error,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate secret key format
 */
export function validateSecretKey(secretKey: string): {
  valid: boolean;
  error?: string;
} {
  if (!secretKey) {
    return { valid: false, error: 'Secret key is required' };
  }

  if (secretKey.length < 3) {
    return { valid: false, error: 'Secret key must be at least 3 characters' };
  }

  if (secretKey.length > 64) {
    return { valid: false, error: 'Secret key cannot exceed 64 characters' };
  }

  const pattern = /^[a-z0-9_]+$/;
  if (!pattern.test(secretKey)) {
    return {
      valid: false,
      error: 'Secret key must be lowercase alphanumeric with underscores only',
    };
  }

  return { valid: true };
}

/**
 * Sanitize secret key
 */
export function sanitizeSecretKey(secretKey: string): string {
  return secretKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * Common secret key suggestions
 */
export const COMMON_SECRET_KEYS = [
  { key: 'openai_api_key', label: 'OpenAI API Key' },
  { key: 'anthropic_api_key', label: 'Anthropic API Key' },
  { key: 'google_api_key', label: 'Google API Key' },
  { key: 'github_token', label: 'GitHub Personal Access Token' },
  { key: 'supabase_service_key', label: 'Supabase Service Key' },
  { key: 'aws_access_key', label: 'AWS Access Key' },
  { key: 'aws_secret_key', label: 'AWS Secret Key' },
  { key: 'stripe_api_key', label: 'Stripe API Key' },
  { key: 'sendgrid_api_key', label: 'SendGrid API Key' },
];
