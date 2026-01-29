/**
 * Tests for Session Restore Hook
 *
 * Test suite covering:
 * - Session restoration from snapshots
 * - Latest snapshot retrieval
 * - Specific snapshot number restoration
 * - Auto-restore on mount
 * - Error handling
 * - Status tracking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSessionRestore, useAutoRestore } from '../useSessionRestore';
import { supabase } from '@/lib/supabase';
import type { SessionState } from '@/types';

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
  access_token: 'mock-token',
  user: { id: 'user-123' },
};

const mockSessionId = 'session-123';

const mockRestoredState: SessionState = {
  sessionId: mockSessionId,
  messages: [
    { role: 'user', content: 'Previous message' },
    { role: 'assistant', content: 'Previous response' },
  ],
  status: 'active',
  metadata: {
    startedAt: '2026-01-28T10:00:00Z',
    lastMessageAt: '2026-01-28T10:05:00Z',
  },
} as any;

const mockSnapshotData = {
  snapshot_id: 'snapshot-123',
  session_id: mockSessionId,
  snapshot_number: 5,
  snapshot_data: mockRestoredState,
  snapshot_size: 1024,
  snapshot_created_at: '2026-01-28T10:05:00Z',
};

// ============================================================================
// Helper Functions
// ============================================================================

function setupMocks(options: {
  authenticated?: boolean;
  restoreSuccess?: boolean;
  snapshotExists?: boolean;
}) {
  const {
    authenticated = true,
    restoreSuccess = true,
    snapshotExists = true,
  } = options;

  // Mock auth session
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: authenticated ? (mockSession as any) : null },
    error: null,
  });

  // Mock fetch for snapshot restore
  vi.mocked(fetch).mockImplementation(async (url: any) => {
    if (url.toString().includes('session-snapshot-restore')) {
      if (!restoreSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Restore failed' }),
        } as Response;
      }

      if (!snapshotExists) {
        return {
          ok: false,
          json: async () => ({ message: 'No snapshot found' }),
        } as Response;
      }

      return {
        ok: true,
        json: async () => mockSnapshotData,
      } as Response;
    }

    return { ok: false, json: async () => ({}) } as Response;
  });
}

// ============================================================================
// Tests: Basic Restoration
// ============================================================================

describe('useSessionRestore - Basic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should restore session from latest snapshot', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.success).toBe(true);
    expect(restoreResult.sessionState).toEqual(mockRestoredState);
    expect(result.current.sessionState).toEqual(mockRestoredState);
  });

  it('should restore specific snapshot by number', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId, 3);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('session-snapshot-restore'),
      expect.objectContaining({
        body: expect.stringContaining('"snapshot_number":3'),
      })
    );
  });

  it('should include snapshot metadata in result', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.snapshot).toBeDefined();
    expect(restoreResult.snapshot.id).toBe('snapshot-123');
    expect(restoreResult.snapshot.snapshot_number).toBe(5);
    expect(restoreResult.snapshot.snapshot_size).toBe(1024);
  });

  it('should pass authorization token in request', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    );
  });
});

// ============================================================================
// Tests: Status Tracking
// ============================================================================

describe('useSessionRestore - Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should set isRestoring to true during restoration', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    // Delay the fetch response
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => mockSnapshotData,
              } as Response),
            100
          )
        )
    );

    const { result } = renderHook(() => useSessionRestore());

    act(() => {
      result.current.restore(mockSessionId);
    });

    expect(result.current.isRestoring).toBe(true);
    expect(result.current.isRestored).toBe(false);

    await waitFor(() => {
      expect(result.current.isRestoring).toBe(false);
    });
  });

  it('should set isRestored to true after successful restoration', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.isRestored).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('should update status object correctly', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.status).toEqual({
      isRestoring: false,
      isRestored: true,
      error: null,
    });
  });

  it('should clear previous result when restoring again', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    // First restore
    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    const firstResult = result.current.result;

    // Second restore
    await act(async () => {
      await result.current.restore('different-session');
    });

    expect(result.current.result).not.toBe(firstResult);
  });
});

// ============================================================================
// Tests: Error Handling
// ============================================================================

describe('useSessionRestore - Errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle authentication errors', async () => {
    setupMocks({ authenticated: false, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Not authenticated');
    expect(result.current.error).toContain('Not authenticated');
  });

  it('should handle API errors', async () => {
    setupMocks({ authenticated: true, restoreSuccess: false });

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('Restore failed');
    expect(result.current.isRestored).toBe(false);
  });

  it('should handle missing snapshot', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true, snapshotExists: false });

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toContain('No snapshot found');
  });

  it('should handle network errors', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() => useSessionRestore());

    let restoreResult: any;
    await act(async () => {
      restoreResult = await result.current.restore(mockSessionId);
    });

    expect(restoreResult.success).toBe(false);
    expect(restoreResult.error).toBeDefined();
  });

  it('should set error in status when restore fails', async () => {
    setupMocks({ authenticated: true, restoreSuccess: false });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.status.error).toBeDefined();
    expect(result.current.status.isRestored).toBe(false);
  });
});

// ============================================================================
// Tests: Reset Functionality
// ============================================================================

describe('useSessionRestore - Reset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should reset status and result', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    // Restore session
    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.isRestored).toBe(true);
    expect(result.current.result).not.toBeNull();

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.status).toEqual({
      isRestoring: false,
      isRestored: false,
      error: null,
    });
    expect(result.current.result).toBeNull();
  });

  it('should clear error on reset', async () => {
    setupMocks({ authenticated: true, restoreSuccess: false });

    const { result } = renderHook(() => useSessionRestore());

    // Failed restore
    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.error).toBeDefined();

    // Reset
    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBeNull();
  });

  it('should clear session state on reset', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(result.current.sessionState).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.sessionState).toBeNull();
  });
});

// ============================================================================
// Tests: useAutoRestore Hook
// ============================================================================

describe('useAutoRestore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should automatically restore on mount', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    renderHook(() => useAutoRestore(mockSessionId));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('session-snapshot-restore'),
        expect.any(Object)
      );
    });
  });

  it('should not restore when sessionId is null', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    renderHook(() => useAutoRestore(null));

    await waitFor(() => {
      expect(fetch).not.toHaveBeenCalled();
    }, { timeout: 1000 });
  });

  it('should only attempt restore once', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { rerender } = renderHook(
      ({ sessionId }) => useAutoRestore(sessionId),
      { initialProps: { sessionId: mockSessionId } }
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Rerender with same sessionId
    rerender({ sessionId: mockSessionId });

    // Should not restore again
    expect(vi.mocked(fetch).mock.calls.length).toBe(firstCallCount);
  });

  it('should restore again when sessionId changes', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { rerender } = renderHook(
      ({ sessionId }) => useAutoRestore(sessionId),
      { initialProps: { sessionId: 'session-1' } }
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Rerender with different sessionId
    rerender({ sessionId: 'session-2' });

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(firstCallCount);
    });
  });

  it('should provide isReady flag', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useAutoRestore(mockSessionId));

    expect(result.current.isReady).toBe(false);

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it('should include restored session state', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useAutoRestore(mockSessionId));

    await waitFor(() => {
      expect(result.current.sessionState).toEqual(mockRestoredState);
    });
  });

  it('should handle restore errors gracefully', async () => {
    setupMocks({ authenticated: true, restoreSuccess: false });

    const { result } = renderHook(() => useAutoRestore(mockSessionId));

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.isReady).toBe(true);
    expect(result.current.sessionState).toBeNull();
  });
});

// ============================================================================
// Tests: Data Integrity
// ============================================================================

describe('useSessionRestore - Data Integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve all session state fields', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    const state = result.current.sessionState;
    expect(state?.sessionId).toBe(mockSessionId);
    expect(state?.messages).toHaveLength(2);
    expect(state?.status).toBe('active');
    expect(state?.metadata).toBeDefined();
  });

  it('should handle complex nested state objects', async () => {
    const complexState = {
      ...mockRestoredState,
      nested: {
        deeply: {
          nested: {
            value: 'test',
            array: [1, 2, 3],
          },
        },
      },
    };

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ...mockSnapshotData,
        snapshot_data: complexState,
      }),
    } as Response);

    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    const state = result.current.sessionState as any;
    expect(state.nested.deeply.nested.value).toBe('test');
    expect(state.nested.deeply.nested.array).toEqual([1, 2, 3]);
  });

  it('should not mutate original snapshot data', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    // Modify restored state
    const state = result.current.sessionState as any;
    if (state) {
      state.modified = true;
    }

    // Restore again
    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    // Should get fresh copy without modification
    const newState = result.current.sessionState as any;
    expect(newState.modified).toBeUndefined();
  });
});

// ============================================================================
// Tests: Request Format
// ============================================================================

describe('useSessionRestore - Request Format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should send correct request format for latest snapshot', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('session-snapshot-restore'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        body: expect.stringContaining(`"session_id":"${mockSessionId}"`),
      })
    );
  });

  it('should include snapshot number when specified', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId, 7);
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"snapshot_number":7'),
      })
    );
  });

  it('should omit snapshot number for latest restore', async () => {
    setupMocks({ authenticated: true, restoreSuccess: true });

    const { result } = renderHook(() => useSessionRestore());

    await act(async () => {
      await result.current.restore(mockSessionId);
    });

    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(body.snapshot_number).toBeUndefined();
  });
});
