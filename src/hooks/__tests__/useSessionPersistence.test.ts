/**
 * Tests for Session Persistence Hooks
 *
 * Test suite covering:
 * - Auto-save functionality (30-second intervals)
 * - Debounced saves (5-second delay)
 * - Manual save triggering
 * - Save on page unload
 * - State change detection
 * - Error handling
 * - Save status tracking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useSessionPersistence, useLastSavedTime } from '../useSessionPersistence';
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

// Mock navigator.sendBeacon
global.navigator.sendBeacon = vi.fn();

// Mock timers
vi.useFakeTimers();

// ============================================================================
// Test Data
// ============================================================================

const mockSession = {
  access_token: 'mock-token',
  user: { id: 'user-123' },
};

const mockSessionId = 'session-123';

const mockSessionState: SessionState = {
  sessionId: mockSessionId,
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi there!' },
  ],
  status: 'active',
  metadata: { startedAt: new Date().toISOString() },
} as any;

// ============================================================================
// Helper Functions
// ============================================================================

function setupMocks(options: {
  authenticated?: boolean;
  saveSuccess?: boolean;
}) {
  const { authenticated = true, saveSuccess = true } = options;

  // Mock auth session
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: authenticated ? (mockSession as any) : null },
    error: null,
  });

  // Mock fetch for snapshot save
  vi.mocked(fetch).mockImplementation(async (url: any) => {
    if (url.toString().includes('session-snapshot-save')) {
      if (!saveSuccess) {
        return {
          ok: false,
          json: async () => ({ message: 'Save failed' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true }),
      } as Response;
    }
    return { ok: false, json: async () => ({}) } as Response;
  });

  // Mock sendBeacon
  vi.mocked(navigator.sendBeacon).mockReturnValue(true);
}

// ============================================================================
// Tests: Auto-Save Functionality
// ============================================================================

describe('useSessionPersistence - Auto-Save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should save snapshot after initial 2-second delay', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Fast-forward past initial delay
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('session-snapshot-save'),
        expect.any(Object)
      );
    });
  });

  it('should auto-save every 30 seconds', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Clear initial save
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    const initialCallCount = vi.mocked(fetch).mock.calls.length;

    // Fast-forward 30 seconds
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('should save multiple times at 30-second intervals', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Initial save
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    const callsAfterInitial = vi.mocked(fetch).mock.calls.length;

    // First interval (30s)
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    const callsAfterFirst = vi.mocked(fetch).mock.calls.length;

    // Second interval (30s)
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    const callsAfterSecond = vi.mocked(fetch).mock.calls.length;

    expect(callsAfterFirst).toBeGreaterThan(callsAfterInitial);
    expect(callsAfterSecond).toBeGreaterThan(callsAfterFirst);
  });

  it('should not auto-save when disabled', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, false)
    );

    // Fast-forward through initial delay and intervals
    await act(async () => {
      vi.advanceTimersByTime(32100);
    });

    // Should not have called fetch
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should not save when session ID is null', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(null, mockSessionState, true)
    );

    await act(async () => {
      vi.advanceTimersByTime(32100);
    });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('should not save when session state is null', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, null, true)
    );

    await act(async () => {
      vi.advanceTimersByTime(32100);
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Tests: Debounced Saves
// ============================================================================

describe('useSessionPersistence - Debouncing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should debounce saves when state changes rapidly', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { rerender } = renderHook(
      ({ state }) => useSessionPersistence(mockSessionId, state, true),
      {
        initialProps: { state: mockSessionState },
      }
    );

    // Initial save
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    const initialCalls = vi.mocked(fetch).mock.calls.length;

    // Rapidly change state (simulate typing)
    const updatedStates = Array.from({ length: 10 }, (_, i) => ({
      ...mockSessionState,
      messages: [
        ...mockSessionState.messages,
        { role: 'user', content: `Message ${i}` },
      ],
    }));

    updatedStates.forEach(state => {
      rerender({ state: state as any });
    });

    // Fast-forward through debounce delay
    await act(async () => {
      vi.advanceTimersByTime(5100);
    });

    // Should only save once after debounce
    const finalCalls = vi.mocked(fetch).mock.calls.length;
    expect(finalCalls - initialCalls).toBeLessThanOrEqual(2); // At most 1 debounced save
  });

  it('should wait 5 seconds before saving after state change', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { rerender } = renderHook(
      ({ state }) => useSessionPersistence(mockSessionId, state, true),
      {
        initialProps: { state: mockSessionState },
      }
    );

    // Wait for initial save
    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    const callsBefore = vi.mocked(fetch).mock.calls.length;

    // Change state
    rerender({
      state: {
        ...mockSessionState,
        messages: [...mockSessionState.messages, { role: 'user', content: 'New message' }],
      } as any,
    });

    // Fast-forward 4 seconds (not enough)
    await act(async () => {
      vi.advanceTimersByTime(4000);
    });

    expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);

    // Fast-forward additional 2 seconds
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ============================================================================
// Tests: Manual Save
// ============================================================================

describe('useSessionPersistence - Manual Save', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('should save immediately when saveNow is called', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Don't wait for auto-save
    await act(async () => {
      await result.current.saveNow();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('session-snapshot-save'),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(mockSessionId),
      })
    );
  });

  it('should update status when manual save succeeds', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status.isSaving).toBe(false);
    expect(result.current.status.lastSaved).toBeInstanceOf(Date);
    expect(result.current.status.saveCount).toBeGreaterThan(0);
    expect(result.current.status.error).toBeNull();
  });

  it('should update error status when manual save fails', async () => {
    setupMocks({ authenticated: true, saveSuccess: false });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.status.error).toBeDefined();
    expect(result.current.status.error).toContain('Save failed');
  });

  it('should not save if state has not changed', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // First save
    await act(async () => {
      await result.current.saveNow();
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Try to save again without state change
    await act(async () => {
      await result.current.saveNow();
    });

    // Should not make another API call
    expect(vi.mocked(fetch).mock.calls.length).toBe(firstCallCount);
  });
});

// ============================================================================
// Tests: Save on Unload
// ============================================================================

describe('useSessionPersistence - Save on Unload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('should use sendBeacon on beforeunload', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Trigger beforeunload event
    await act(async () => {
      window.dispatchEvent(new Event('beforeunload'));
    });

    expect(navigator.sendBeacon).toHaveBeenCalledWith(
      expect.stringContaining('session-snapshot-save'),
      expect.any(String)
    );
  });

  it('should save on component unmount', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { unmount } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // Clear any auto-saves
    vi.clearAllMocks();

    // Unmount component
    await act(async () => {
      unmount();
    });

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Tests: Status Tracking
// ============================================================================

describe('useSessionPersistence - Status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('should track save count', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    expect(result.current.saveCount).toBe(0);

    // First save
    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.saveCount).toBe(1);

    // Second save
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(result.current.saveCount).toBe(2);
    });
  });

  it('should track last saved timestamp', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    expect(result.current.lastSaved).toBeNull();

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.lastSaved).toBeInstanceOf(Date);
  });

  it('should show isSaving while save in progress', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    // Delay the fetch response
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(resolve =>
          setTimeout(
            () => resolve({ ok: true, json: async () => ({}) } as Response),
            100
          )
        )
    );

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    act(() => {
      result.current.saveNow();
    });

    expect(result.current.isSaving).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    await waitFor(() => {
      expect(result.current.isSaving).toBe(false);
    });
  });
});

// ============================================================================
// Tests: Error Handling
// ============================================================================

describe('useSessionPersistence - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  it('should handle authentication errors', async () => {
    setupMocks({ authenticated: false, saveSuccess: true });

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.error).toContain('Not authenticated');
  });

  it('should handle network errors', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.error).toBeDefined();
  });

  it('should continue auto-save after error', async () => {
    setupMocks({ authenticated: true, saveSuccess: true });

    // First call fails
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Temporary error'));

    const { result } = renderHook(() =>
      useSessionPersistence(mockSessionId, mockSessionState, true)
    );

    // First save fails
    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.error).toBeDefined();

    // Next auto-save should succeed
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
    });
  });
});

// ============================================================================
// Tests: useLastSavedTime Hook
// ============================================================================

describe('useLastSavedTime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.clearAllTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it('should return empty string when lastSaved is null', () => {
    const { result } = renderHook(() => useLastSavedTime(null));

    expect(result.current).toBe('');
  });

  it('should return "just now" for recent saves', () => {
    const now = new Date();
    const { result } = renderHook(() => useLastSavedTime(now));

    expect(result.current).toBe('just now');
  });

  it('should return seconds ago for recent saves', async () => {
    const fifteenSecondsAgo = new Date(Date.now() - 15000);
    const { result } = renderHook(() => useLastSavedTime(fifteenSecondsAgo));

    expect(result.current).toMatch(/\d+s ago/);
  });

  it('should return minutes ago for older saves', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const { result } = renderHook(() => useLastSavedTime(fiveMinutesAgo));

    expect(result.current).toMatch(/\d+m ago/);
  });

  it('should return hours ago for very old saves', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { result } = renderHook(() => useLastSavedTime(twoHoursAgo));

    expect(result.current).toMatch(/\d+h ago/);
  });

  it('should update time display every 10 seconds', async () => {
    const now = new Date();
    const { result } = renderHook(() => useLastSavedTime(now));

    expect(result.current).toBe('just now');

    // Fast-forward 15 seconds
    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    await waitFor(() => {
      expect(result.current).toMatch(/\d+s ago/);
    });
  });
});
