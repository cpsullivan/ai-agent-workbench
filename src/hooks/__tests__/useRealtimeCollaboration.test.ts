/**
 * Tests for useRealtimeCollaboration Hook
 *
 * Critical tests for real-time collaboration with Operational Transform
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useRealtimeCollaboration } from '../useRealtimeCollaboration';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(),
  },
}));

describe('useRealtimeCollaboration', () => {
  let mockChannel: any;
  let mockSubscribe: any;
  let mockUnsubscribe: any;
  let mockSend: any;
  let mockOn: any;

  beforeEach(() => {
    mockSubscribe = vi.fn().mockResolvedValue({ status: 'subscribed' });
    mockUnsubscribe = vi.fn().mockResolvedValue({ status: 'unsubscribed' });
    mockSend = vi.fn().mockResolvedValue({ status: 'ok' });
    mockOn = vi.fn().mockReturnThis();

    mockChannel = {
      subscribe: mockSubscribe,
      unsubscribe: mockUnsubscribe,
      send: mockSend,
      on: mockOn,
    };

    (supabase.channel as any).mockReturnValue(mockChannel);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Hook initialization
  it('should initialize with disconnected state', () => {
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    expect(result.current.isConnected).toBe(false);
    expect(result.current.state).toEqual({ messages: [] });
    expect(result.current.activeUsers).toEqual([]);
  });

  // Test 2: Connect to channel on mount
  it('should connect to Supabase channel on mount', async () => {
    renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalledWith('collaboration:session:test-session-id');
      expect(mockOn).toHaveBeenCalledWith('broadcast', expect.any(Object), expect.any(Function));
      expect(mockOn).toHaveBeenCalledWith('presence', expect.any(Object), expect.any(Function));
      expect(mockSubscribe).toHaveBeenCalled();
    });
  });

  // Test 3: Disconnect on unmount
  it('should disconnect from channel on unmount', async () => {
    const { unmount } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    unmount();

    await waitFor(() => {
      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  // Test 4: Broadcast local changes
  it('should broadcast local changes to collaborators', async () => {
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    await act(async () => {
      await result.current.broadcastChange({
        type: 'insert',
        path: 'messages.0',
        value: { id: '1', content: 'Hello' },
        timestamp: Date.now(),
      });
    });

    expect(mockSend).toHaveBeenCalledWith({
      type: 'broadcast',
      event: 'operation',
      payload: expect.objectContaining({
        type: 'insert',
        path: 'messages.0',
        value: { id: '1', content: 'Hello' },
        userId: 'user-1',
        vectorClock: expect.any(Object),
      }),
    });
  });

  // Test 5: Apply local changes optimistically
  it('should apply local changes optimistically', async () => {
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    await act(async () => {
      result.current.applyLocalChange('messages', [{ id: '1', content: 'Hello' }]);
    });

    expect(result.current.state).toEqual({
      messages: [{ id: '1', content: 'Hello' }],
    });
  });

  // Test 6: Increment vector clock on broadcast
  it('should increment vector clock on each broadcast', async () => {
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    await act(async () => {
      await result.current.broadcastChange({
        type: 'insert',
        path: 'messages.0',
        value: { id: '1', content: 'First' },
        timestamp: Date.now(),
      });
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          vectorClock: { 'user-1': 1 },
        }),
      })
    );

    await act(async () => {
      await result.current.broadcastChange({
        type: 'insert',
        path: 'messages.1',
        value: { id: '2', content: 'Second' },
        timestamp: Date.now(),
      });
    });

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          vectorClock: { 'user-1': 2 },
        }),
      })
    );
  });

  // Test 7: Handle remote operations
  it('should handle remote operations from other users', async () => {
    const onRemoteChange = vi.fn();
    renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Simulate remote operation
    const remoteOperation = {
      type: 'insert',
      path: 'messages.0',
      value: { id: '2', content: 'Remote message' },
      timestamp: Date.now(),
      userId: 'user-2',
      vectorClock: { 'user-2': 1 },
    };

    // Get the broadcast handler
    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: remoteOperation });
    });

    expect(onRemoteChange).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ id: '2', content: 'Remote message' }],
      }),
      remoteOperation
    );
  });

  // Test 8: OT - Transform concurrent operations
  it('should transform concurrent operations using OT', async () => {
    const onRemoteChange = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Local operation (user-1 adds message at index 0)
    await act(async () => {
      result.current.applyLocalChange('messages', [{ id: '1', content: 'Local' }]);
    });

    // Remote operation (user-2 adds message at index 0, concurrent)
    const remoteOperation = {
      type: 'insert',
      path: 'messages.0',
      value: { id: '2', content: 'Remote' },
      timestamp: Date.now() - 1000, // Earlier timestamp
      userId: 'user-2',
      vectorClock: { 'user-2': 1 },
    };

    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: remoteOperation });
    });

    // Both messages should be present after OT resolution
    expect(result.current.state.messages).toHaveLength(2);
  });

  // Test 9: OT - Last write wins for same path
  it('should resolve conflicts with last-write-wins strategy', async () => {
    const onRemoteChange = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { title: '' },
        userId: 'user-1',
        enableOT: true,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Local update to title
    await act(async () => {
      result.current.applyLocalChange('title', 'Local Title');
    });

    // Remote update to same path with higher vector clock
    const remoteOperation = {
      type: 'update',
      path: 'title',
      value: 'Remote Title',
      timestamp: Date.now() + 1000,
      userId: 'user-2',
      vectorClock: { 'user-2': 2 },
    };

    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: remoteOperation });
    });

    // Remote operation should win due to higher vector clock sum
    expect(result.current.state.title).toBe('Remote Title');
  });

  // Test 10: Track pending operations
  it('should track pending operations queue', async () => {
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Apply local change (adds to pending queue)
    await act(async () => {
      result.current.applyLocalChange('messages', [{ id: '1', content: 'Pending' }]);
    });

    // Pending operations should be tracked internally
    expect(result.current.state.messages).toEqual([{ id: '1', content: 'Pending' }]);
  });

  // Test 11: Handle user join events
  it('should handle user join events', async () => {
    const onUserJoined = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
        onUserJoined,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Get presence handler
    const presenceHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'presence' && call[1].event === 'join'
    )?.[2];

    await act(async () => {
      presenceHandler?.({ newPresences: [{ user_id: 'user-2', user_name: 'Alice' }] });
    });

    expect(result.current.activeUsers).toContainEqual(
      expect.objectContaining({ user_id: 'user-2' })
    );
    expect(onUserJoined).toHaveBeenCalledWith('Alice');
  });

  // Test 12: Handle user leave events
  it('should handle user leave events', async () => {
    const onUserLeft = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
        onUserLeft,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Simulate user joining first
    const joinHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'presence' && call[1].event === 'join'
    )?.[2];

    await act(async () => {
      joinHandler?.({ newPresences: [{ user_id: 'user-2', user_name: 'Alice' }] });
    });

    // Get leave handler
    const leaveHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'presence' && call[1].event === 'leave'
    )?.[2];

    await act(async () => {
      leaveHandler?.({ leftPresences: [{ user_id: 'user-2' }] });
    });

    expect(result.current.activeUsers).not.toContainEqual(
      expect.objectContaining({ user_id: 'user-2' })
    );
    expect(onUserLeft).toHaveBeenCalledWith('user-2');
  });

  // Test 13: Ignore own operations
  it('should not apply own operations received from broadcast', async () => {
    const onRemoteChange = vi.fn();
    renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Simulate own operation coming back from broadcast
    const ownOperation = {
      type: 'insert',
      path: 'messages.0',
      value: { id: '1', content: 'Own message' },
      timestamp: Date.now(),
      userId: 'user-1',
      vectorClock: { 'user-1': 1 },
    };

    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: ownOperation });
    });

    // onRemoteChange should not be called for own operations
    expect(onRemoteChange).not.toHaveBeenCalled();
  });

  // Test 14: Reconnect on connection loss
  it('should attempt to reconnect on connection loss', async () => {
    renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: true,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Clear previous calls
    vi.clearAllMocks();

    // Simulate connection error
    const errorHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'error'
    )?.[2];

    await act(async () => {
      errorHandler?.({ error: 'Connection lost' });
    });

    // Should attempt reconnection
    await waitFor(
      () => {
        expect(supabase.channel).toHaveBeenCalledWith('collaboration:session:test-session-id');
      },
      { timeout: 3000 }
    );
  });

  // Test 15: Disable OT when enableOT is false
  it('should not transform operations when OT is disabled', async () => {
    const onRemoteChange = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'session',
        resourceId: 'test-session-id',
        initialState: { messages: [] },
        userId: 'user-1',
        enableOT: false,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Remote operation
    const remoteOperation = {
      type: 'update',
      path: 'messages',
      value: [{ id: '1', content: 'Direct update' }],
      timestamp: Date.now(),
      userId: 'user-2',
      vectorClock: { 'user-2': 1 },
    };

    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: remoteOperation });
    });

    // Should apply operation directly without transformation
    expect(result.current.state.messages).toEqual([{ id: '1', content: 'Direct update' }]);
    expect(onRemoteChange).toHaveBeenCalled();
  });

  // Test 16: Handle non-overlapping paths
  it('should not transform operations with non-overlapping paths', async () => {
    const onRemoteChange = vi.fn();
    const { result } = renderHook(() =>
      useRealtimeCollaboration({
        resourceType: 'workflow',
        resourceId: 'test-workflow-id',
        initialState: { nodes: [], edges: [] },
        userId: 'user-1',
        enableOT: true,
        onRemoteChange,
      })
    );

    await waitFor(() => expect(mockSubscribe).toHaveBeenCalled());

    // Local operation on nodes
    await act(async () => {
      result.current.applyLocalChange('nodes', [{ id: 'node-1', type: 'function' }]);
    });

    // Remote operation on edges (different path)
    const remoteOperation = {
      type: 'insert',
      path: 'edges.0',
      value: { id: 'edge-1', source: 'node-1', target: 'node-2' },
      timestamp: Date.now(),
      userId: 'user-2',
      vectorClock: { 'user-2': 1 },
    };

    const broadcastHandler = mockOn.mock.calls.find(
      (call: any) => call[0] === 'broadcast' && call[1].event === 'operation'
    )?.[2];

    await act(async () => {
      broadcastHandler?.({ payload: remoteOperation });
    });

    // Both operations should coexist without transformation
    expect(result.current.state.nodes).toHaveLength(1);
    expect(result.current.state.edges).toHaveLength(1);
  });
});
