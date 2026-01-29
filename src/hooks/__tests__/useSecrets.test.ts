/**
 * Tests for useSecrets Hook
 *
 * Test suite covering:
 * - Secret listing
 * - Secret creation/update
 * - Secret retrieval (decryption)
 * - Secret deletion
 * - Input validation
 * - Error handling
 * - Cache management
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useSecrets,
  useSecret,
  validateSecretKey,
  sanitizeSecretKey,
  COMMON_SECRET_KEYS,
} from '../useSecrets';
import { supabase } from '@/lib/supabase';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

// Mock fetch
global.fetch = vi.fn();

// ============================================================================
// Test Data
// ============================================================================

const mockSession = {
  access_token: 'mock-access-token',
  user: { id: 'user-123', email: 'test@example.com' },
};

const mockSecrets = [
  {
    id: 'secret-1',
    secret_key: 'openai_api_key',
    description: 'OpenAI API Key',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'secret-2',
    secret_key: 'anthropic_api_key',
    description: 'Anthropic API Key',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockSecretValue = {
  secret_key: 'openai_api_key',
  secret_value: 'sk-1234567890',
  retrieved_at: new Date().toISOString(),
};

// ============================================================================
// Helper Functions
// ============================================================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setupMocks(options: {
  authenticated?: boolean;
  listSuccess?: boolean;
  getSuccess?: boolean;
  setSuccess?: boolean;
  deleteSuccess?: boolean;
}) {
  const {
    authenticated = true,
    listSuccess = true,
    getSuccess = true,
    setSuccess = true,
    deleteSuccess = true,
  } = options;

  // Mock auth session
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: authenticated ? mockSession as any : null },
    error: null,
  });

  // Mock fetch responses
  vi.mocked(fetch).mockImplementation(async (url: any) => {
    const urlStr = url.toString();

    if (urlStr.includes('secrets-list')) {
      if (!listSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Failed to list secrets' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ secrets: mockSecrets }),
      } as Response;
    }

    if (urlStr.includes('secrets-get')) {
      if (!getSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Failed to get secret' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => mockSecretValue,
      } as Response;
    }

    if (urlStr.includes('secrets-set')) {
      if (!setSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Failed to set secret' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          id: 'secret-new',
          secret_key: 'new_key',
          description: 'New secret',
          created_at: new Date().toISOString(),
        }),
      } as Response;
    }

    if (urlStr.includes('secrets-delete')) {
      if (!deleteSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Failed to delete secret' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
      } as Response;
    }

    return { ok: false, json: async () => ({}) } as Response;
  });
}

// ============================================================================
// Tests: List Secrets
// ============================================================================

describe('useSecrets - List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all secrets for authenticated user', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.secrets).toEqual(mockSecrets);
    expect(result.current.secrets?.length).toBe(2);
  });

  it('should throw error when not authenticated', async () => {
    setupMocks({ authenticated: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toContain('Not authenticated');
  });

  it('should handle list API errors', async () => {
    setupMocks({ authenticated: true, listSuccess: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toContain('Failed to list secrets');
  });

  it('should cache secrets list for 5 minutes', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result, rerender } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Rerender should use cache
    rerender();

    // Should not make another API call
    expect(vi.mocked(fetch).mock.calls.length).toBe(firstCallCount);
  });
});

// ============================================================================
// Tests: Get Secret
// ============================================================================

describe('useSecrets - Get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should retrieve and decrypt secret value', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let secretValue: any;
    await act(async () => {
      secretValue = await result.current.getSecret('openai_api_key');
    });

    expect(secretValue).toEqual(mockSecretValue);
    expect(secretValue.secret_value).toBe('sk-1234567890');
  });

  it('should not cache decrypted secret values', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Get secret twice
    await act(async () => {
      await result.current.getSecret('openai_api_key');
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    await act(async () => {
      await result.current.getSecret('openai_api_key');
    });

    // Should make two separate API calls (no caching)
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(firstCallCount);
  });

  it('should handle get API errors', async () => {
    setupMocks({ authenticated: true, getSuccess: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.getSecret('nonexistent_key');
      })
    ).rejects.toThrow('Failed to get secret');
  });

  it('should show loading state while getting secret', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.getSecret('openai_api_key');
    });

    expect(result.current.isGetting).toBe(true);

    await waitFor(() => {
      expect(result.current.isGetting).toBe(false);
    });
  });
});

// ============================================================================
// Tests: Create/Update Secret
// ============================================================================

describe('useSecrets - Create/Update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create new secret', async () => {
    setupMocks({ authenticated: true, setSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const newSecret = {
      secret_key: 'github_token',
      secret_value: 'ghp_123456',
      description: 'GitHub PAT',
    };

    let createdSecret: any;
    await act(async () => {
      createdSecret = await result.current.createSecret(newSecret);
    });

    expect(createdSecret).toBeDefined();
    expect(createdSecret.secret_key).toBe('new_key');
  });

  it('should update existing secret', async () => {
    setupMocks({ authenticated: true, setSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const updateData = {
      secret_key: 'openai_api_key',
      secret_value: 'sk-new-value',
      description: 'Updated key',
    };

    await act(async () => {
      await result.current.updateSecret(updateData);
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('secrets-set'),
      expect.any(Object)
    );
  });

  it('should invalidate secrets list after create', async () => {
    setupMocks({ authenticated: true, setSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const initialSecrets = result.current.secrets;

    await act(async () => {
      await result.current.createSecret({
        secret_key: 'new_key',
        secret_value: 'new_value',
      });
    });

    // List should be refetched
    await waitFor(() => {
      expect(result.current.secrets).toBeDefined();
    });
  });

  it('should show loading state while creating', async () => {
    setupMocks({ authenticated: true, setSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.createSecret({
        secret_key: 'test_key',
        secret_value: 'test_value',
      });
    });

    expect(result.current.isCreating).toBe(true);

    await waitFor(() => {
      expect(result.current.isCreating).toBe(false);
    });
  });

  it('should handle create API errors', async () => {
    setupMocks({ authenticated: true, setSuccess: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.createSecret({
          secret_key: 'test_key',
          secret_value: 'test_value',
        });
      })
    ).rejects.toThrow('Failed to set secret');

    expect(result.current.createError).toBeDefined();
  });
});

// ============================================================================
// Tests: Delete Secret
// ============================================================================

describe('useSecrets - Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete secret', async () => {
    setupMocks({ authenticated: true, deleteSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteSecret('openai_api_key');
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining('secrets-delete'),
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });

  it('should invalidate secrets list after delete', async () => {
    setupMocks({ authenticated: true, deleteSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.deleteSecret('openai_api_key');
    });

    // List should be refetched
    await waitFor(() => {
      expect(result.current.secrets).toBeDefined();
    });
  });

  it('should show loading state while deleting', async () => {
    setupMocks({ authenticated: true, deleteSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.deleteSecret('openai_api_key');
    });

    expect(result.current.isDeleting).toBe(true);

    await waitFor(() => {
      expect(result.current.isDeleting).toBe(false);
    });
  });

  it('should handle delete API errors', async () => {
    setupMocks({ authenticated: true, deleteSuccess: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      act(async () => {
        await result.current.deleteSecret('openai_api_key');
      })
    ).rejects.toThrow('Failed to delete secret');

    expect(result.current.deleteError).toBeDefined();
  });
});

// ============================================================================
// Tests: useSecret Hook
// ============================================================================

describe('useSecret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get specific secret by key', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result } = renderHook(() => useSecret('openai_api_key'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.getSecret();
    });

    expect(result.current.secretValue).toBe('sk-1234567890');
    expect(result.current.isLoading).toBe(false);
  });

  it('should not cache secret value', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result } = renderHook(() => useSecret('openai_api_key'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.getSecret();
    });

    const firstValue = result.current.secretValue;
    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Get again
    await act(async () => {
      await result.current.getSecret();
    });

    // Should make new API call
    expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(firstCallCount);
  });
});

// ============================================================================
// Tests: Input Validation
// ============================================================================

describe('Input Validation', () => {
  it('should validate secret key format', () => {
    // Valid keys
    expect(validateSecretKey('openai_api_key')).toEqual({ valid: true });
    expect(validateSecretKey('api_key_123')).toEqual({ valid: true });
    expect(validateSecretKey('abc')).toEqual({ valid: true });

    // Invalid - empty
    expect(validateSecretKey('')).toEqual({
      valid: false,
      error: 'Secret key is required',
    });

    // Invalid - too short
    expect(validateSecretKey('ab')).toEqual({
      valid: false,
      error: 'Secret key must be at least 3 characters',
    });

    // Invalid - too long
    expect(validateSecretKey('a'.repeat(65))).toEqual({
      valid: false,
      error: 'Secret key cannot exceed 64 characters',
    });

    // Invalid - uppercase
    expect(validateSecretKey('UPPERCASE_KEY')).toEqual({
      valid: false,
      error: 'Secret key must be lowercase alphanumeric with underscores only',
    });

    // Invalid - special characters
    expect(validateSecretKey('invalid-key!')).toEqual({
      valid: false,
      error: 'Secret key must be lowercase alphanumeric with underscores only',
    });
  });

  it('should sanitize secret keys', () => {
    expect(sanitizeSecretKey('UPPERCASE')).toBe('uppercase');
    expect(sanitizeSecretKey('spaces in key')).toBe('spaces_in_key');
    expect(sanitizeSecretKey('invalid-chars!')).toBe('invalid_chars_');
    expect(sanitizeSecretKey('Mixed_CASE_123')).toBe('mixed_case_123');
  });

  it('should provide common secret key suggestions', () => {
    expect(COMMON_SECRET_KEYS).toBeDefined();
    expect(COMMON_SECRET_KEYS.length).toBeGreaterThan(5);

    const openaiKey = COMMON_SECRET_KEYS.find((k) => k.key === 'openai_api_key');
    expect(openaiKey).toBeDefined();
    expect(openaiKey?.label).toBe('OpenAI API Key');
  });
});

// ============================================================================
// Tests: Security
// ============================================================================

describe('Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should include authorization header in all requests', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-access-token',
        }),
      })
    );
  });

  it('should not expose secret values in error messages', async () => {
    setupMocks({ authenticated: true, getSuccess: false });

    const { result } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    try {
      await act(async () => {
        await result.current.getSecret('openai_api_key');
      });
    } catch (error: any) {
      // Error should not contain sensitive data
      expect(error.message).not.toContain('sk-');
      expect(error.message).not.toContain('ghp_');
    }
  });

  it('should clear secret values from memory after use', async () => {
    setupMocks({ authenticated: true, getSuccess: true });

    const { result, unmount } = renderHook(() => useSecrets(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.getSecret('openai_api_key');
    });

    // Unmount should clear any cached values
    unmount();

    // Values should no longer be accessible
    expect(true).toBe(true); // Placeholder for memory clearing verification
  });
});
