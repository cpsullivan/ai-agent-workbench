/**
 * Encryption Utilities for Secrets Management
 *
 * CRITICAL SECURITY MODULE
 * Handles encryption/decryption of sensitive data (API keys, credentials)
 * Uses pgcrypto with AES-256 encryption
 *
 * @module encryption
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ============================================================================
// Types
// ============================================================================

export interface EncryptedSecret {
  id: string;
  user_id: string;
  secret_key: string;
  description?: string;
  encryption_key_version: number;
  last_used_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SecretValue {
  secret_key: string;
  secret_value: string;
}

export interface SecretAccessLog {
  user_id: string;
  secret_id: string;
  action: 'read' | 'create' | 'update' | 'delete';
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
}

// ============================================================================
// Encryption Key Management
// ============================================================================

/**
 * Get the encryption key from environment
 *
 * SECURITY: This key MUST be stored in environment variables, NOT in code
 */
function getEncryptionKey(): string {
  const key = Deno.env.get('SECRETS_ENCRYPTION_KEY');

  if (!key) {
    throw new Error('SECRETS_ENCRYPTION_KEY environment variable not set');
  }

  // Validate key strength (minimum 32 characters)
  if (key.length < 32) {
    throw new Error('Encryption key must be at least 32 characters');
  }

  return key;
}

/**
 * Get active encryption key version from database
 */
async function getActiveKeyVersion(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .rpc('get_active_encryption_key_version');

  if (error) {
    console.error('Error getting active key version:', error);
    return 1; // Default to version 1
  }

  return data || 1;
}

// ============================================================================
// Encryption Functions
// ============================================================================

/**
 * Encrypt a secret value
 *
 * Uses PostgreSQL's pgp_sym_encrypt via database function for consistency
 *
 * @param supabase - Supabase client
 * @param secretValue - The plain text secret to encrypt
 * @returns Encrypted value as base64 string (for storage as BYTEA)
 */
export async function encryptSecret(
  supabase: SupabaseClient,
  secretValue: string
): Promise<{ encrypted: string; keyVersion: number }> {
  try {
    const encryptionKey = getEncryptionKey();
    const keyVersion = await getActiveKeyVersion(supabase);

    // Call database function to encrypt
    const { data, error } = await supabase
      .rpc('encrypt_secret', {
        p_secret_value: secretValue,
        p_encryption_key: encryptionKey,
      });

    if (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }

    // Convert BYTEA to base64 for transmission
    const encrypted = btoa(String.fromCharCode(...new Uint8Array(data)));

    return {
      encrypted,
      keyVersion,
    };
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt secret');
  }
}

/**
 * Decrypt a secret value
 *
 * Uses PostgreSQL's pgp_sym_decrypt via database function
 *
 * @param supabase - Supabase client
 * @param encryptedValue - The encrypted value (base64 encoded BYTEA)
 * @returns Decrypted plain text secret
 */
export async function decryptSecret(
  supabase: SupabaseClient,
  encryptedValue: string
): Promise<string> {
  try {
    const encryptionKey = getEncryptionKey();

    // Convert base64 back to BYTEA
    const binaryStr = atob(encryptedValue);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Call database function to decrypt
    const { data, error } = await supabase
      .rpc('decrypt_secret', {
        p_encrypted_value: bytes,
        p_encryption_key: encryptionKey,
      });

    if (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }

    if (!data) {
      throw new Error('Decryption returned null (wrong key or corrupted data)');
    }

    return data;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt secret');
  }
}

// ============================================================================
// Secret Management Functions
// ============================================================================

/**
 * Store an encrypted secret in the database
 *
 * @param supabase - Supabase client
 * @param userId - User ID who owns the secret
 * @param secretKey - Identifier for the secret (e.g., "openai_api_key")
 * @param secretValue - The plain text secret value
 * @param description - Optional description
 * @returns The created secret metadata (without value)
 */
export async function storeSecret(
  supabase: SupabaseClient,
  userId: string,
  secretKey: string,
  secretValue: string,
  description?: string
): Promise<EncryptedSecret> {
  try {
    // Encrypt the secret
    const { encrypted, keyVersion } = await encryptSecret(supabase, secretValue);

    // Store in database
    const { data, error } = await supabase
      .from('user_secrets')
      .insert({
        user_id: userId,
        secret_key: secretKey,
        encrypted_value: encrypted,
        encryption_key_version: keyVersion,
        description,
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to store secret: ${error.message}`);
    }

    // Log the action
    await logSecretAccess(supabase, {
      user_id: userId,
      secret_id: data.id,
      action: 'create',
      success: true,
    });

    return data;
  } catch (error) {
    console.error('Store secret error:', error);
    throw error;
  }
}

/**
 * Retrieve and decrypt a secret from the database
 *
 * @param supabase - Supabase client
 * @param userId - User ID who owns the secret
 * @param secretKey - Identifier for the secret
 * @returns The decrypted secret value
 */
export async function retrieveSecret(
  supabase: SupabaseClient,
  userId: string,
  secretKey: string
): Promise<string> {
  try {
    // Fetch encrypted secret
    const { data, error } = await supabase
      .from('user_secrets')
      .select('id, encrypted_value')
      .eq('user_id', userId)
      .eq('secret_key', secretKey)
      .single();

    if (error) {
      throw new Error(`Secret not found: ${error.message}`);
    }

    if (!data) {
      throw new Error('Secret not found');
    }

    // Decrypt the secret
    const decrypted = await decryptSecret(supabase, data.encrypted_value);

    // Update last_used_at
    await supabase
      .from('user_secrets')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    // Log the access
    await logSecretAccess(supabase, {
      user_id: userId,
      secret_id: data.id,
      action: 'read',
      success: true,
    });

    return decrypted;
  } catch (error) {
    console.error('Retrieve secret error:', error);
    throw error;
  }
}

/**
 * Update an existing secret
 *
 * @param supabase - Supabase client
 * @param userId - User ID who owns the secret
 * @param secretKey - Identifier for the secret
 * @param newSecretValue - New plain text secret value
 * @param description - Optional updated description
 * @returns Updated secret metadata
 */
export async function updateSecret(
  supabase: SupabaseClient,
  userId: string,
  secretKey: string,
  newSecretValue: string,
  description?: string
): Promise<EncryptedSecret> {
  try {
    // Get existing secret ID
    const { data: existing, error: fetchError } = await supabase
      .from('user_secrets')
      .select('id')
      .eq('user_id', userId)
      .eq('secret_key', secretKey)
      .single();

    if (fetchError || !existing) {
      throw new Error('Secret not found');
    }

    // Encrypt the new value
    const { encrypted, keyVersion } = await encryptSecret(supabase, newSecretValue);

    // Update in database
    const updateData: any = {
      encrypted_value: encrypted,
      encryption_key_version: keyVersion,
      updated_at: new Date().toISOString(),
    };

    if (description !== undefined) {
      updateData.description = description;
    }

    const { data, error } = await supabase
      .from('user_secrets')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update secret: ${error.message}`);
    }

    // Log the action
    await logSecretAccess(supabase, {
      user_id: userId,
      secret_id: existing.id,
      action: 'update',
      success: true,
    });

    return data;
  } catch (error) {
    console.error('Update secret error:', error);
    throw error;
  }
}

/**
 * Delete a secret from the database
 *
 * @param supabase - Supabase client
 * @param userId - User ID who owns the secret
 * @param secretKey - Identifier for the secret
 */
export async function deleteSecret(
  supabase: SupabaseClient,
  userId: string,
  secretKey: string
): Promise<void> {
  try {
    // Get secret ID before deleting
    const { data: existing, error: fetchError } = await supabase
      .from('user_secrets')
      .select('id')
      .eq('user_id', userId)
      .eq('secret_key', secretKey)
      .single();

    if (fetchError || !existing) {
      throw new Error('Secret not found');
    }

    // Log the action before deletion
    await logSecretAccess(supabase, {
      user_id: userId,
      secret_id: existing.id,
      action: 'delete',
      success: true,
    });

    // Delete the secret
    const { error } = await supabase
      .from('user_secrets')
      .delete()
      .eq('id', existing.id);

    if (error) {
      throw new Error(`Failed to delete secret: ${error.message}`);
    }
  } catch (error) {
    console.error('Delete secret error:', error);
    throw error;
  }
}

/**
 * List all secrets for a user (metadata only, no values)
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @returns Array of secret metadata
 */
export async function listSecrets(
  supabase: SupabaseClient,
  userId: string
): Promise<EncryptedSecret[]> {
  const { data, error } = await supabase
    .from('user_secrets_metadata')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list secrets: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Log secret access for audit trail
 *
 * @param supabase - Supabase client
 * @param log - Access log details
 */
export async function logSecretAccess(
  supabase: SupabaseClient,
  log: SecretAccessLog
): Promise<void> {
  try {
    await supabase.rpc('log_secret_access', {
      p_user_id: log.user_id,
      p_secret_id: log.secret_id,
      p_action: log.action,
      p_ip_address: log.ip_address || null,
      p_user_agent: log.user_agent || null,
      p_success: log.success,
      p_error_message: log.error_message || null,
    });
  } catch (error) {
    // Don't fail the operation if audit logging fails
    console.error('Failed to log secret access:', error);
  }
}

/**
 * Get access logs for a secret
 *
 * @param supabase - Supabase client
 * @param userId - User ID
 * @param secretId - Secret ID (optional, if not provided returns all user's logs)
 * @param limit - Maximum number of logs to return
 * @returns Array of access logs
 */
export async function getAccessLogs(
  supabase: SupabaseClient,
  userId: string,
  secretId?: string,
  limit = 100
): Promise<any[]> {
  let query = supabase
    .from('secret_access_logs')
    .select('*')
    .eq('user_id', userId)
    .order('accessed_at', { ascending: false })
    .limit(limit);

  if (secretId) {
    query = query.eq('secret_id', secretId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to get access logs: ${error.message}`);
  }

  return data || [];
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate secret key format
 *
 * Secret keys should be lowercase, alphanumeric with underscores
 */
export function validateSecretKey(secretKey: string): boolean {
  const pattern = /^[a-z0-9_]+$/;
  return pattern.test(secretKey) && secretKey.length >= 3 && secretKey.length <= 64;
}

/**
 * Sanitize secret key to prevent injection
 */
export function sanitizeSecretKey(secretKey: string): string {
  return secretKey.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}
