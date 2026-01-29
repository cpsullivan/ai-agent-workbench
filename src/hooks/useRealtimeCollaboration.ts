/**
 * Realtime Collaboration Hook
 *
 * CRITICAL: Core hook for multi-user real-time collaboration
 * Manages WebSocket connections, state synchronization, and Operational Transform
 *
 * Features:
 * - Real-time state synchronization via Supabase Realtime
 * - Operational Transform (OT) for conflict resolution
 * - Broadcast updates to all collaborators
 * - Handle connection/disconnection gracefully
 * - Track local and remote changes
 *
 * @module useRealtimeCollaboration
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ============================================================================
// Types
// ============================================================================

export type ResourceType = 'session' | 'workflow';

export interface CollaborationState<T = unknown> {
  data: T;
  version: number;
  lastModifiedBy: string | null;
  lastModifiedAt: string;
}

export interface Operation {
  type: 'insert' | 'update' | 'delete' | 'move';
  path: string; // JSON path (e.g., 'messages.0', 'nodes.3.position')
  value?: unknown;
  oldValue?: unknown;
  timestamp: number;
  userId: string;
  vectorClock: Record<string, number>; // Lamport timestamps
}

export interface CollaborationOptions<T> {
  resourceType: ResourceType;
  resourceId: string;
  initialState: T;
  userId: string;
  onRemoteChange?: (state: T, operation: Operation) => void;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onConnectionChange?: (connected: boolean) => void;
  enableOT?: boolean; // Enable Operational Transform (default: true)
}

export interface CollaborationResult<T> {
  state: T;
  isConnected: boolean;
  activeUsers: string[];
  broadcastChange: (operation: Partial<Operation>) => Promise<void>;
  applyLocalChange: (path: string, value: unknown) => void;
  disconnect: () => void;
  reconnect: () => void;
}

// ============================================================================
// Operational Transform Utilities
// ============================================================================

/**
 * Transform operation against another operation (OT)
 * This is a simplified OT algorithm for demonstration
 * Full production implementation would use a library like ShareDB or Yjs
 */
function transformOperation(op1: Operation, op2: Operation): Operation {
  // If operations affect different paths, no transformation needed
  if (!pathsOverlap(op1.path, op2.path)) {
    return op1;
  }

  // If op2 was created after op1, op1 takes precedence
  if (op2.timestamp > op1.timestamp) {
    return op1;
  }

  // If both operations are updates to the same path
  if (op1.type === 'update' && op2.type === 'update' && op1.path === op2.path) {
    // Last write wins (based on vector clock)
    const op1Clock = Object.values(op1.vectorClock).reduce((a, b) => a + b, 0);
    const op2Clock = Object.values(op2.vectorClock).reduce((a, b) => a + b, 0);

    if (op2Clock > op1Clock) {
      // op2 wins, discard op1
      return { ...op1, type: 'delete' as const, value: undefined };
    }
  }

  return op1;
}

/**
 * Check if two JSON paths overlap
 */
function pathsOverlap(path1: string, path2: string): boolean {
  return path1.startsWith(path2) || path2.startsWith(path1);
}

/**
 * Apply operation to state
 */
function applyOperation<T>(state: T, operation: Operation): T {
  const pathParts = operation.path.split('.');
  const newState = JSON.parse(JSON.stringify(state)); // Deep clone

  let current: any = newState;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!(part in current)) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = pathParts[pathParts.length - 1];

  switch (operation.type) {
    case 'update':
    case 'insert':
      current[lastPart] = operation.value;
      break;
    case 'delete':
      delete current[lastPart];
      break;
    case 'move':
      // Move operations would need additional logic
      break;
  }

  return newState;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use Realtime Collaboration
 *
 * Enables real-time multi-user collaboration on sessions or workflows
 *
 * @example
 * ```tsx
 * const { state, broadcastChange, isConnected } = useRealtimeCollaboration({
 *   resourceType: 'session',
 *   resourceId: 'session-123',
 *   initialState: sessionState,
 *   userId: user.id,
 *   onRemoteChange: (newState, operation) => {
 *     console.log('Remote change:', operation);
 *   },
 * });
 *
 * // Broadcast a change
 * await broadcastChange({
 *   type: 'update',
 *   path: 'messages',
 *   value: [...messages, newMessage],
 * });
 * ```
 */
export function useRealtimeCollaboration<T = unknown>(
  options: CollaborationOptions<T>
): CollaborationResult<T> {
  const {
    resourceType,
    resourceId,
    initialState,
    userId,
    onRemoteChange,
    onUserJoined,
    onUserLeft,
    onConnectionChange,
    enableOT = true,
  } = options;

  // State
  const [state, setState] = useState<T>(initialState);
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);

  // Refs for stable references
  const channelRef = useRef<RealtimeChannel | null>(null);
  const vectorClockRef = useRef<Record<string, number>>({ [userId]: 0 });
  const pendingOperationsRef = useRef<Operation[]>([]);

  /**
   * Broadcast a change to all collaborators
   */
  const broadcastChange = useCallback(
    async (partialOperation: Partial<Operation>) => {
      if (!channelRef.current || !isConnected) {
        console.warn('Cannot broadcast: not connected');
        return;
      }

      // Increment vector clock
      vectorClockRef.current[userId] = (vectorClockRef.current[userId] || 0) + 1;

      const operation: Operation = {
        type: partialOperation.type || 'update',
        path: partialOperation.path || '',
        value: partialOperation.value,
        oldValue: partialOperation.oldValue,
        timestamp: Date.now(),
        userId,
        vectorClock: { ...vectorClockRef.current },
      };

      // Apply locally first (optimistic update)
      if (enableOT) {
        const newState = applyOperation(state, operation);
        setState(newState);
      }

      // Broadcast to other users
      await channelRef.current.send({
        type: 'broadcast',
        event: 'operation',
        payload: operation,
      });

      // Store in database for persistence
      await supabase.from('collaboration_operations').insert({
        resource_type: resourceType,
        resource_id: resourceId,
        user_id: userId,
        operation_type: operation.type,
        operation_data: {
          path: operation.path,
          value: operation.value,
          oldValue: operation.oldValue,
        },
        vector_clock: operation.vectorClock,
      });
    },
    [isConnected, resourceType, resourceId, userId, state, enableOT]
  );

  /**
   * Apply a local change (without broadcasting)
   * Useful for initialization or non-collaborative updates
   */
  const applyLocalChange = useCallback((path: string, value: unknown) => {
    setState(prevState => {
      const operation: Operation = {
        type: 'update',
        path,
        value,
        timestamp: Date.now(),
        userId,
        vectorClock: vectorClockRef.current,
      };
      return applyOperation(prevState, operation);
    });
  }, [userId]);

  /**
   * Handle incoming operations from other users
   */
  const handleRemoteOperation = useCallback(
    (operation: Operation) => {
      // Update vector clock
      Object.keys(operation.vectorClock).forEach(key => {
        vectorClockRef.current[key] = Math.max(
          vectorClockRef.current[key] || 0,
          operation.vectorClock[key]
        );
      });

      if (enableOT) {
        // Transform against pending operations
        let transformedOp = operation;
        pendingOperationsRef.current.forEach(pendingOp => {
          transformedOp = transformOperation(transformedOp, pendingOp);
        });

        // Apply transformed operation
        setState(prevState => applyOperation(prevState, transformedOp));
      } else {
        // Simple last-write-wins
        setState(prevState => applyOperation(prevState, operation));
      }

      // Notify callback
      onRemoteChange?.(state, operation);
    },
    [enableOT, onRemoteChange, state]
  );

  /**
   * Connect to Supabase Realtime channel
   */
  const connect = useCallback(() => {
    if (channelRef.current) {
      return; // Already connected
    }

    const channelName = `${resourceType}:${resourceId}`;
    const channel = supabase.channel(channelName);

    // Subscribe to broadcast events (operations)
    channel.on('broadcast', { event: 'operation' }, (payload: { payload: Operation }) => {
      if (payload.payload.userId !== userId) {
        handleRemoteOperation(payload.payload);
      }
    });

    // Subscribe to presence events (user join/leave)
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const users = Object.keys(state);
      setActiveUsers(users.filter(u => u !== userId));
    });

    channel.on('presence', { event: 'join' }, ({ key }: { key: string }) => {
      if (key !== userId) {
        onUserJoined?.(key);
      }
    });

    channel.on('presence', { event: 'leave' }, ({ key }: { key: string }) => {
      if (key !== userId) {
        onUserLeft?.(key);
      }
    });

    // Subscribe to database changes (for persistence)
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'collaboration_operations',
          filter: `resource_id=eq.${resourceId}`,
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (payload.eventType === 'INSERT' && payload.new.user_id !== userId) {
            const operation: Operation = {
              type: payload.new.operation_type,
              path: payload.new.operation_data.path,
              value: payload.new.operation_data.value,
              oldValue: payload.new.operation_data.oldValue,
              timestamp: new Date(payload.new.created_at).getTime(),
              userId: payload.new.user_id,
              vectorClock: payload.new.vector_clock,
            };
            handleRemoteOperation(operation);
          }
        }
      )
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          setIsConnected(true);
          onConnectionChange?.(true);

          // Track presence
          channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
          });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setIsConnected(false);
          onConnectionChange?.(false);
        }
      });

    channelRef.current = channel;
  }, [resourceType, resourceId, userId, handleRemoteOperation, onUserJoined, onUserLeft, onConnectionChange]);

  /**
   * Disconnect from Realtime channel
   */
  const disconnect = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
      setIsConnected(false);
      onConnectionChange?.(false);
    }
  }, [onConnectionChange]);

  /**
   * Reconnect (useful after network issues)
   */
  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [connect, disconnect]);

  // Auto-connect on mount
  useEffect(() => {
    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Update state when initialState changes
  useEffect(() => {
    setState(initialState);
  }, [initialState]);

  return {
    state,
    isConnected,
    activeUsers,
    broadcastChange,
    applyLocalChange,
    disconnect,
    reconnect,
  };
}
