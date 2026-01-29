/**
 * Tests for usePresence Hook
 *
 * Tests for real-time user presence tracking with heartbeat mechanism
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePresence } from '../usePresence';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

// Mock useAuth
vi.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'user1@example.com' },
  }),
}));

describe('usePresence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Test 1: Initialize with empty active users
  it('should initialize with empty active users list', () => {
    (supabase.rpc as any).mockResolvedValue({ data: [], error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    expect(result.current.activeUsers).toEqual([]);
    expect(result.current.isConnected).toBe(false);
  });

  // Test 2: Send initial heartbeat on mount
  it('should send initial heartbeat on mount', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_presence_heartbeat', {
        p_user_id: 'user-1',
        p_resource_type: 'session',
        p_resource_id: 'test-session-id',
        p_presence_data: expect.objectContaining({
          status: 'active',
        }),
      });
    });
  });

  // Test 3: Send heartbeat every 30 seconds
  it('should send heartbeat every 30 seconds', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalledTimes(1));

    // Clear calls and advance time by 30 seconds
    mockRpc.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_presence_heartbeat', expect.any(Object));
    });
  });

  // Test 4: Stop heartbeat on unmount
  it('should stop heartbeat interval on unmount', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { unmount } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    mockRpc.mockClear();
    unmount();

    // Advance time - no more heartbeats should be sent
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  // Test 5: Update presence data
  it('should update presence data when updatePresence is called', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    mockRpc.mockClear();

    await act(async () => {
      result.current.updatePresence({
        cursorX: 100,
        cursorY: 200,
        status: 'active',
      });
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_presence_heartbeat', {
        p_user_id: 'user-1',
        p_resource_type: 'session',
        p_resource_id: 'test-session-id',
        p_presence_data: expect.objectContaining({
          cursorX: 100,
          cursorY: 200,
          status: 'active',
        }),
      });
    });
  });

  // Test 6: Fetch active collaborators
  it('should fetch and update active users list', async () => {
    const mockActiveUsers = [
      {
        user_id: 'user-2',
        user_email: 'user2@example.com',
        user_name: 'Alice',
        presence_data: { status: 'active', color: '#4CAF50' },
        last_heartbeat_at: new Date().toISOString(),
      },
      {
        user_id: 'user-3',
        user_email: 'user3@example.com',
        user_name: 'Bob',
        presence_data: { status: 'active', color: '#2196F3' },
        last_heartbeat_at: new Date().toISOString(),
      },
    ];

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockActiveUsers, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.activeUsers).toHaveLength(2);
      expect(result.current.activeUsers[0]).toMatchObject({
        userId: 'user-2',
        userEmail: 'user2@example.com',
        userName: 'Alice',
      });
    });
  });

  // Test 7: Assign deterministic colors to users
  it('should assign deterministic colors based on user ID', async () => {
    const mockActiveUsers = [
      {
        user_id: 'user-abc',
        user_email: 'user@example.com',
        user_name: 'Test User',
        presence_data: {},
        last_heartbeat_at: new Date().toISOString(),
      },
    ];

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockActiveUsers, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.activeUsers[0].presenceData.color).toBeDefined();
      // Color should be one of the predefined colors
      const validColors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
      expect(validColors).toContain(result.current.activeUsers[0].presenceData.color);
    });
  });

  // Test 8: Handle visibility change (tab blur/focus)
  it('should update status to idle on tab blur', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => expect(mockRpc).toHaveBeenCalled());

    mockRpc.mockClear();

    // Simulate tab blur
    await act(async () => {
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(mockRpc).toHaveBeenCalledWith('update_presence_heartbeat', {
        p_user_id: 'user-1',
        p_resource_type: 'session',
        p_resource_id: 'test-session-id',
        p_presence_data: expect.objectContaining({
          status: 'idle',
        }),
      });
    });
  });

  // Test 9: Call onUserJoined callback when new user appears
  it('should call onUserJoined when a new user appears', async () => {
    const onUserJoined = vi.fn();

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

    // Initially no users
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });
    (supabase.from as any).mockImplementation(mockFrom);

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
        onUserJoined,
      })
    );

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());

    // Update to have a new user
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                user_id: 'user-2',
                user_email: 'user2@example.com',
                user_name: 'Alice',
                presence_data: { status: 'active' },
                last_heartbeat_at: new Date().toISOString(),
              },
            ],
            error: null,
          }),
        }),
      }),
    });

    // Trigger fetch by advancing timer
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(onUserJoined).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          userName: 'Alice',
        })
      );
    });
  });

  // Test 10: Call onUserLeft callback when user disappears
  it('should call onUserLeft when a user disappears', async () => {
    const onUserLeft = vi.fn();

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });

    // Initially one user
    let mockData = [
      {
        user_id: 'user-2',
        user_email: 'user2@example.com',
        user_name: 'Alice',
        presence_data: { status: 'active' },
        last_heartbeat_at: new Date().toISOString(),
      },
    ];

    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockData, error: null }),
        }),
      }),
    });
    (supabase.from as any).mockImplementation(mockFrom);

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
        onUserLeft,
      })
    );

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalled());

    // Update to have no users
    mockData = [];

    // Trigger fetch by advancing timer
    await act(async () => {
      vi.advanceTimersByTime(10000);
    });

    await waitFor(() => {
      expect(onUserLeft).toHaveBeenCalledWith('user-2');
    });
  });

  // Test 11: Not send heartbeat when disabled
  it('should not send heartbeat when enabled is false', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null });
    (supabase.rpc as any).mockImplementation(mockRpc);
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    });

    renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: false,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    expect(mockRpc).not.toHaveBeenCalled();
  });

  // Test 12: Mark user as inactive after timeout
  it('should mark users as inactive if heartbeat timestamp is old', async () => {
    const oldTimestamp = new Date(Date.now() - 3 * 60 * 1000).toISOString(); // 3 minutes ago
    const mockActiveUsers = [
      {
        user_id: 'user-2',
        user_email: 'user2@example.com',
        user_name: 'Alice',
        presence_data: { status: 'active', color: '#4CAF50' },
        last_heartbeat_at: oldTimestamp,
      },
    ];

    (supabase.rpc as any).mockResolvedValue({ data: null, error: null });
    (supabase.from as any).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: mockActiveUsers, error: null }),
        }),
      }),
    });

    const { result } = renderHook(() =>
      usePresence({
        resourceType: 'session',
        resourceId: 'test-session-id',
        enabled: true,
      })
    );

    await waitFor(() => {
      expect(result.current.activeUsers).toHaveLength(1);
      expect(result.current.activeUsers[0].isActive).toBe(false);
    });
  });
});
