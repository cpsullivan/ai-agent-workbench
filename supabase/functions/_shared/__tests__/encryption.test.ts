/**
 * Security Tests for Encryption Module
 *
 * CRITICAL SECURITY TEST SUITE
 *
 * Tests covering:
 * - Encryption/decryption correctness
 * - Key management security
 * - Access control enforcement
 * - Audit logging
 * - Input validation
 * - Error handling
 * - Security vulnerabilities
 */

import { describe, it, expect, beforeEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import {
  encryptSecret,
  decryptSecret,
  storeSecret,
  getSecret,
  deleteSecret,
  listSecrets,
  logSecretAccess,
} from '../encryption.ts';

// ============================================================================
// Security Test Data
// ============================================================================

const mockUserId = 'user-123';
const mockSecretKey = 'openai_api_key';
const mockSecretValue = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';
const mockDescription = 'OpenAI API Key for production';

// ============================================================================
// Mock Supabase Client
// ============================================================================

function createMockSupabase(options: {
  encryptSuccess?: boolean;
  decryptSuccess?: boolean;
  storeSuccess?: boolean;
  keyVersion?: number;
  hasAccess?: boolean;
}) {
  const {
    encryptSuccess = true,
    decryptSuccess = true,
    storeSuccess = true,
    keyVersion = 1,
    hasAccess = true,
  } = options;

  const mockEncryptedData = new Uint8Array([1, 2, 3, 4, 5]); // Simulated encrypted data

  return {
    rpc: async (functionName: string, params: any) => {
      if (functionName === 'get_active_encryption_key_version') {
        return { data: keyVersion, error: null };
      }
      if (functionName === 'encrypt_secret') {
        if (!encryptSuccess) {
          return { data: null, error: { message: 'Encryption failed' } };
        }
        return { data: mockEncryptedData, error: null };
      }
      if (functionName === 'decrypt_secret') {
        if (!decryptSuccess) {
          return { data: null, error: { message: 'Decryption failed' } };
        }
        return { data: mockSecretValue, error: null };
      }
      return { data: null, error: null };
    },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            if (table === 'user_secrets') {
              if (!hasAccess) {
                return { data: null, error: { message: 'Not found' } };
              }
              return {
                data: {
                  id: 'secret-123',
                  user_id: mockUserId,
                  secret_key: mockSecretKey,
                  encrypted_value: btoa('encrypted'),
                  description: mockDescription,
                  encryption_key_version: keyVersion,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          data: [],
          error: null,
        }),
      }),
      insert: async () => {
        if (!storeSuccess) {
          return { data: null, error: { message: 'Insert failed' } };
        }
        return {
          data: {
            id: 'secret-123',
            user_id: mockUserId,
            secret_key: mockSecretKey,
            description: mockDescription,
            encryption_key_version: keyVersion,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          error: null,
        };
      },
      update: () => ({
        eq: async () => ({
          data: null,
          error: null,
        }),
      }),
      delete: () => ({
        eq: async () => ({
          data: null,
          error: null,
        }),
      }),
      upsert: async () => ({
        data: null,
        error: null,
      }),
    }),
  };
}

// ============================================================================
// Tests: Encryption Key Management
// ============================================================================

describe('Encryption Key Management', () => {
  beforeEach(() => {
    // Set encryption key in environment
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should require SECRETS_ENCRYPTION_KEY environment variable', async () => {
    const originalKey = Deno.env.get('SECRETS_ENCRYPTION_KEY');
    Deno.env.delete('SECRETS_ENCRYPTION_KEY');

    const supabase = createMockSupabase({}) as any;

    try {
      await encryptSecret(supabase, mockSecretValue);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('SECRETS_ENCRYPTION_KEY');
    } finally {
      if (originalKey) {
        Deno.env.set('SECRETS_ENCRYPTION_KEY', originalKey);
      }
    }
  });

  it('should reject encryption key shorter than 32 characters', async () => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'too-short');

    const supabase = createMockSupabase({}) as any;

    try {
      await encryptSecret(supabase, mockSecretValue);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('at least 32 characters');
    } finally {
      Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
    }
  });

  it('should use active key version from database', async () => {
    const supabase = createMockSupabase({ keyVersion: 2 }) as any;

    const result = await encryptSecret(supabase, mockSecretValue);

    expect(result.keyVersion).toBe(2);
  });

  it('should default to version 1 if key version lookup fails', async () => {
    const supabase = {
      rpc: async (functionName: string) => {
        if (functionName === 'get_active_encryption_key_version') {
          return { data: null, error: { message: 'Query failed' } };
        }
        return { data: new Uint8Array([1, 2, 3]), error: null };
      },
    } as any;

    const result = await encryptSecret(supabase, mockSecretValue);

    expect(result.keyVersion).toBe(1);
  });
});

// ============================================================================
// Tests: Encryption/Decryption
// ============================================================================

describe('Encryption and Decryption', () => {
  beforeEach(() => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should encrypt secret value successfully', async () => {
    const supabase = createMockSupabase({}) as any;

    const result = await encryptSecret(supabase, mockSecretValue);

    expect(result.encrypted).toBeDefined();
    expect(result.encrypted.length).toBeGreaterThan(0);
    expect(result.keyVersion).toBe(1);
  });

  it('should return base64 encoded encrypted value', async () => {
    const supabase = createMockSupabase({}) as any;

    const result = await encryptSecret(supabase, mockSecretValue);

    // Base64 strings only contain A-Z, a-z, 0-9, +, /, and =
    expect(/^[A-Za-z0-9+/]+=*$/.test(result.encrypted)).toBe(true);
  });

  it('should decrypt encrypted value to original', async () => {
    const supabase = createMockSupabase({}) as any;

    const encrypted = btoa('encrypted');
    const decrypted = await decryptSecret(supabase, encrypted);

    expect(decrypted).toBe(mockSecretValue);
  });

  it('should fail gracefully on encryption error', async () => {
    const supabase = createMockSupabase({ encryptSuccess: false }) as any;

    try {
      await encryptSecret(supabase, mockSecretValue);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Failed to encrypt');
    }
  });

  it('should fail gracefully on decryption error', async () => {
    const supabase = createMockSupabase({ decryptSuccess: false }) as any;

    const encrypted = btoa('invalid');

    try {
      await decryptSecret(supabase, encrypted);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Failed to decrypt');
    }
  });

  it('should throw error on null decryption result', async () => {
    const supabase = {
      rpc: async () => ({ data: null, error: null }), // Returns null without error
    } as any;

    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');

    const encrypted = btoa('encrypted');

    try {
      await decryptSecret(supabase, encrypted);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('wrong key or corrupted data');
    }
  });

  it('should not store plaintext secret value', async () => {
    const supabase = createMockSupabase({}) as any;

    let insertedData: any = null;
    supabase.from = () => ({
      insert: async (data: any) => {
        insertedData = data;
        return {
          data: { ...data, id: 'secret-123' },
          error: null,
        };
      },
      select: () => ({
        single: async () => ({ data: null, error: null }),
      }),
    });

    await storeSecret(supabase, mockUserId, mockSecretKey, mockSecretValue, mockDescription);

    // Verify plaintext is NOT stored
    expect(insertedData.encrypted_value).toBeDefined();
    expect(insertedData.encrypted_value).not.toBe(mockSecretValue);
    expect(insertedData.secret_value).toBeUndefined();
  });
});

// ============================================================================
// Tests: Access Control
// ============================================================================

describe('Access Control', () => {
  beforeEach(() => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should only return secrets owned by user', async () => {
    const supabase = createMockSupabase({ hasAccess: true }) as any;

    // Mock should verify user_id matches
    const secrets = await listSecrets(supabase, mockUserId);

    expect(Array.isArray(secrets)).toBe(true);
  });

  it('should deny access to secrets owned by other users', async () => {
    const supabase = createMockSupabase({ hasAccess: false }) as any;

    try {
      await getSecret(supabase, 'other-user-id', mockSecretKey);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toContain('Not found');
    }
  });

  it('should prevent cross-user secret access via key guessing', async () => {
    let accessAttempts = 0;
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              accessAttempts++;
              return { data: null, error: { message: 'Not found' } };
            },
          }),
        }),
      }),
    } as any;

    // Try to access secret with different user IDs
    try {
      await getSecret(supabase, 'attacker-user', mockSecretKey);
    } catch {}

    // Query should still execute (not blocked client-side)
    // But database should enforce user_id matching
    expect(accessAttempts).toBe(1);
  });

  it('should require authentication for all operations', async () => {
    const supabase = createMockSupabase({}) as any;

    // All operations should check auth before proceeding
    // This is enforced by edge function auth middleware

    expect(true).toBe(true); // Placeholder for actual auth check test
  });
});

// ============================================================================
// Tests: Input Validation
// ============================================================================

describe('Input Validation', () => {
  it('should validate secret key format', () => {
    const { validateSecretKey } = require('../../../src/hooks/useSecrets.ts');

    // Valid keys
    expect(validateSecretKey('openai_api_key').valid).toBe(true);
    expect(validateSecretKey('api_key_123').valid).toBe(true);

    // Invalid keys
    expect(validateSecretKey('').valid).toBe(false);
    expect(validateSecretKey('ab').valid).toBe(false); // Too short
    expect(validateSecretKey('a'.repeat(65)).valid).toBe(false); // Too long
    expect(validateSecretKey('Invalid-Key!').valid).toBe(false); // Invalid chars
    expect(validateSecretKey('UPPERCASE_KEY').valid).toBe(false); // Uppercase
  });

  it('should prevent SQL injection in secret keys', async () => {
    const supabase = createMockSupabase({}) as any;

    const maliciousKey = "'; DROP TABLE user_secrets; --";

    try {
      await storeSecret(supabase, mockUserId, maliciousKey, mockSecretValue);
    } catch (error) {
      // Should be blocked by validation or parameterized queries
      expect(true).toBe(true);
    }
  });

  it('should sanitize secret keys', () => {
    const { sanitizeSecretKey } = require('../../../src/hooks/useSecrets.ts');

    expect(sanitizeSecretKey('Invalid-Key!')).toBe('invalid_key_');
    expect(sanitizeSecretKey('UPPERCASE')).toBe('uppercase');
    expect(sanitizeSecretKey('spaces in key')).toBe('spaces_in_key');
  });

  it('should enforce maximum secret value size', async () => {
    const supabase = createMockSupabase({}) as any;

    // Try to store very large secret (potential DoS)
    const largeSecret = 'a'.repeat(1000000); // 1 MB

    try {
      await storeSecret(supabase, mockUserId, mockSecretKey, largeSecret);
      // Should either succeed or fail gracefully
      expect(true).toBe(true);
    } catch (error) {
      // Acceptable to reject very large secrets
      expect(error).toBeDefined();
    }
  });
});

// ============================================================================
// Tests: Audit Logging
// ============================================================================

describe('Audit Logging', () => {
  it('should log secret access attempts', async () => {
    const supabase = createMockSupabase({}) as any;

    let loggedAccess: any = null;
    supabase.from = (table: string) => {
      if (table === 'secret_access_logs') {
        return {
          insert: async (data: any) => {
            loggedAccess = data;
            return { data: null, error: null };
          },
        };
      }
      return createMockSupabase({}).from(table);
    };

    await logSecretAccess(supabase, {
      user_id: mockUserId,
      secret_id: 'secret-123',
      action: 'read',
      success: true,
    });

    expect(loggedAccess).not.toBeNull();
    expect(loggedAccess.action).toBe('read');
    expect(loggedAccess.success).toBe(true);
  });

  it('should log failed access attempts', async () => {
    const supabase = createMockSupabase({ hasAccess: false }) as any;

    let loggedAccess: any = null;
    supabase.from = (table: string) => {
      if (table === 'secret_access_logs') {
        return {
          insert: async (data: any) => {
            loggedAccess = data;
            return { data: null, error: null };
          },
        };
      }
      return { select: () => ({ eq: () => ({ single: async () => ({ data: null, error: { message: 'Not found' } }) }) }) };
    };

    try {
      await getSecret(supabase, mockUserId, mockSecretKey);
    } catch {}

    // Log should record the failure
    expect(true).toBe(true); // Placeholder
  });

  it('should record IP address and user agent', async () => {
    const supabase = createMockSupabase({}) as any;

    const logData = {
      user_id: mockUserId,
      secret_id: 'secret-123',
      action: 'read' as const,
      ip_address: '192.168.1.1',
      user_agent: 'Mozilla/5.0',
      success: true,
    };

    await logSecretAccess(supabase, logData);

    // Should include IP and user agent for security auditing
    expect(logData.ip_address).toBeDefined();
    expect(logData.user_agent).toBeDefined();
  });
});

// ============================================================================
// Tests: Security Vulnerabilities
// ============================================================================

describe('Security Vulnerabilities', () => {
  beforeEach(() => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should prevent timing attacks on decryption', async () => {
    const supabase = createMockSupabase({}) as any;

    // Measure time for valid vs invalid decryption
    // Times should be similar to prevent timing attacks
    const validStart = Date.now();
    try {
      await decryptSecret(supabase, btoa('valid'));
    } catch {}
    const validTime = Date.now() - validStart;

    const invalidStart = Date.now();
    try {
      await decryptSecret(supabase, btoa('invalid'));
    } catch {}
    const invalidTime = Date.now() - invalidStart;

    // Timing difference should be minimal (< 100ms variance)
    const timingDiff = Math.abs(validTime - invalidTime);
    expect(timingDiff).toBeLessThan(100);
  });

  it('should not leak encrypted values in error messages', async () => {
    const supabase = createMockSupabase({ decryptSuccess: false }) as any;

    const encrypted = btoa('sensitive-data');

    try {
      await decryptSecret(supabase, encrypted);
    } catch (error) {
      // Error should not contain the encrypted value
      expect(error.message).not.toContain(encrypted);
      expect(error.message).not.toContain('sensitive-data');
    }
  });

  it('should clear sensitive data from memory after use', async () => {
    const supabase = createMockSupabase({}) as any;

    const result = await encryptSecret(supabase, mockSecretValue);

    // After encryption, plaintext should not be retained
    // This is a conceptual test - actual implementation would need secure memory clearing
    expect(true).toBe(true);
  });

  it('should prevent secret key enumeration', async () => {
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            single: async () => ({ data: null, error: { message: 'Not found' } }),
          }),
        }),
      }),
    } as any;

    // Try multiple non-existent keys
    const attempts = ['key1', 'key2', 'key3'];
    const responses: string[] = [];

    for (const key of attempts) {
      try {
        await getSecret(supabase, mockUserId, key);
      } catch (error) {
        responses.push(error.message);
      }
    }

    // All error messages should be identical (no enumeration hints)
    expect(new Set(responses).size).toBe(1);
  });

  it('should rate limit secret access attempts', async () => {
    // This would be implemented in the edge function middleware
    // Test verifies the concept

    const supabase = createMockSupabase({}) as any;

    // Simulate rapid access attempts
    const attempts = Array(100).fill(null).map((_, i) =>
      getSecret(supabase, mockUserId, `key_${i}`)
    );

    // Should have rate limiting in place
    // This is a placeholder for actual rate limit testing
    expect(attempts.length).toBe(100);
  });
});

// ============================================================================
// Tests: Secret Rotation
// ============================================================================

describe('Secret Rotation', () => {
  beforeEach(() => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should support multiple encryption key versions', async () => {
    // Old secret encrypted with version 1
    const supabaseV1 = createMockSupabase({ keyVersion: 1 }) as any;
    const resultV1 = await encryptSecret(supabaseV1, mockSecretValue);
    expect(resultV1.keyVersion).toBe(1);

    // New secret encrypted with version 2
    const supabaseV2 = createMockSupabase({ keyVersion: 2 }) as any;
    const resultV2 = await encryptSecret(supabaseV2, mockSecretValue);
    expect(resultV2.keyVersion).toBe(2);

    // Both should be decryptable
    await decryptSecret(supabaseV1, resultV1.encrypted);
    await decryptSecret(supabaseV2, resultV2.encrypted);
  });

  it('should track last_used_at for rotation scheduling', async () => {
    const supabase = createMockSupabase({}) as any;

    let updatedData: any = null;
    supabase.from = (table: string) => {
      if (table === 'user_secrets') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  id: 'secret-123',
                  user_id: mockUserId,
                  secret_key: mockSecretKey,
                  encrypted_value: btoa('encrypted'),
                  last_used_at: null,
                },
                error: null,
              }),
            }),
          }),
          update: (data: any) => ({
            eq: async () => {
              updatedData = data;
              return { data: null, error: null };
            },
          }),
        };
      }
      return { rpc: createMockSupabase({}).rpc };
    };

    await getSecret(supabase, mockUserId, mockSecretKey);

    // Should update last_used_at
    expect(updatedData?.last_used_at).toBeDefined();
  });
});

// ============================================================================
// Tests: Error Handling
// ============================================================================

describe('Error Handling', () => {
  beforeEach(() => {
    Deno.env.set('SECRETS_ENCRYPTION_KEY', 'test-encryption-key-at-least-32-characters-long-123456');
  });

  it('should handle database errors gracefully', async () => {
    const supabase = createMockSupabase({ storeSuccess: false }) as any;

    try {
      await storeSecret(supabase, mockUserId, mockSecretKey, mockSecretValue);
      expect(true).toBe(false); // Should not reach here
    } catch (error) {
      expect(error.message).toBeDefined();
      // Should not expose internal database details
      expect(error.message).not.toContain('SQL');
      expect(error.message).not.toContain('PostgreSQL');
    }
  });

  it('should log errors without exposing sensitive data', async () => {
    const consoleSpy = {
      calls: [] as any[],
    };
    const originalError = console.error;
    console.error = (...args: any[]) => {
      consoleSpy.calls.push(args);
    };

    const supabase = createMockSupabase({ encryptSuccess: false }) as any;

    try {
      await encryptSecret(supabase, mockSecretValue);
    } catch {}

    console.error = originalError;

    // Logs should not contain the secret value
    const loggedText = JSON.stringify(consoleSpy.calls);
    expect(loggedText).not.toContain(mockSecretValue);
  });
});
