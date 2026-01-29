/**
 * Presence Hook
 *
 * Tracks active users in real-time for collaborative sessions/workflows
 * Implements heartbeat mechanism to detect stale connections
 *
 * Features:
 * - Track who's currently viewing a resource
 * - Broadcast user presence (cursor position, status)
 * - Handle user join/leave events
 * - Automatic heartbeat every 30 seconds
 * - Timeout inactive users after 2 minutes
 *
 * @module usePresence
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';

// ============================================================================
// Types
// ============================================================================

export type ResourceType = 'session' | 'workflow';

export interface PresenceData {
  cursorX?: number;
  cursorY?: number;
  status?: 'active' | 'idle' | 'away';
  currentElement?: string; // ID of element being edited
  color?: string; // User's assigned color for cursor/highlight
  [key: string]: unknown; // Allow custom data
}

export interface UserPresence {
  userId: string;
  userName: string | null;
  userEmail: string;
  role: string;
  presenceData: PresenceData;
  lastSeen: string;
  isActive: boolean;
}

export interface PresenceOptions {
  resourceType: ResourceType;
  resourceId: string;
  enabled?: boolean; // Default: true
  heartbeatInterval?: number; // Default: 30000ms (30s)
  timeoutThreshold?: number; // Default: 120000ms (2min)
  onUserJoined?: (user: UserPresence) => void;
  onUserLeft?: (userId: string) => void;
  onPresenceChange?: (users: UserPresence[]) => void;
}

export interface PresenceResult {
  activeUsers: UserPresence[];
  myPresence: PresenceData | null;
  updatePresence: (data: Partial<PresenceData>) => void;
  isConnected: boolean;
}

// ============================================================================
// Color Assignment
// ============================================================================

const PRESENCE_COLORS = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Yellow
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

function assignColor(userId: string): string {
  // Deterministic color assignment based on user ID
  const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length];
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use Presence
 *
 * Track and broadcast user presence in real-time
 *
 * @example
 * ```tsx
 * const { activeUsers, updatePresence } = usePresence({
 *   resourceType: 'session',
 *   resourceId: 'session-123',
 *   onUserJoined: (user) => {
 *     console.log(`${user.userName} joined`);
 *   },
 * });
 *
 * // Update cursor position
 * updatePresence({ cursorX: 100, cursorY: 200 });
 * ```
 */
export function usePresence(options: PresenceOptions): PresenceResult {
  const {
    resourceType,
    resourceId,
    enabled = true,
    heartbeatInterval = 30000, // 30 seconds
    timeoutThreshold = 120000, // 2 minutes
    onUserJoined,
    onUserLeft,
    onPresenceChange,
  } = options;

  const { user } = useAuth();

  // State
  const [activeUsers, setActiveUsers] = useState<UserPresence[]>([]);
  const [myPresence, setMyPresence] = useState<PresenceData | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs
  const heartbeatIntervalRef = useRef<number | null>(null);
  const presenceDataRef = useRef<PresenceData>({
    status: 'active',
    color: user ? assignColor(user.id) : '#3B82F6',
  });

  /**
   * Fetch active collaborators from database
   */
  const fetchActiveCollaborators = useCallback(async () => {
    if (!enabled || !user) return;

    try {
      const { data, error } = await supabase.rpc('get_active_collaborators', {
        p_resource_type: resourceType,
        p_resource_id: resourceId,
      });

      if (error) {
        console.error('Error fetching active collaborators:', error);
        return;
      }

      const users: UserPresence[] = (data || []).map((row: any) => ({
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        role: row.role,
        presenceData: row.presence_data || {},
        lastSeen: row.last_seen,
        isActive: row.last_seen && new Date(row.last_seen) > new Date(Date.now() - timeoutThreshold),
      }));

      setActiveUsers(users);
      onPresenceChange?.(users);

      // Check for new users and left users
      const currentUserIds = new Set(activeUsers.map(u => u.userId));
      const newUserIds = new Set(users.map(u => u.userId));

      users.forEach(activeUser => {
        if (!currentUserIds.has(activeUser.userId) && activeUser.userId !== user?.id) {
          onUserJoined?.(activeUser);
        }
      });

      activeUsers.forEach(activeUser => {
        if (!newUserIds.has(activeUser.userId)) {
          onUserLeft?.(activeUser.userId);
        }
      });
    } catch (error) {
      console.error('Error in fetchActiveCollaborators:', error);
    }
  }, [enabled, user, resourceType, resourceId, timeoutThreshold, activeUsers, onPresenceChange, onUserJoined, onUserLeft]);

  /**
   * Send heartbeat to update presence
   */
  const sendHeartbeat = useCallback(async () => {
    if (!enabled || !user) return;

    try {
      const { error } = await supabase.rpc('update_presence_heartbeat', {
        p_user_id: user.id,
        p_resource_type: resourceType,
        p_resource_id: resourceId,
        p_presence_data: presenceDataRef.current,
      });

      if (error) {
        console.error('Error sending heartbeat:', error);
        setIsConnected(false);
      } else {
        setIsConnected(true);
      }
    } catch (error) {
      console.error('Error in sendHeartbeat:', error);
      setIsConnected(false);
    }
  }, [enabled, user, resourceType, resourceId]);

  /**
   * Update presence data (cursor, status, etc.)
   */
  const updatePresence = useCallback((data: Partial<PresenceData>) => {
    presenceDataRef.current = {
      ...presenceDataRef.current,
      ...data,
    };
    setMyPresence(presenceDataRef.current);

    // Send heartbeat immediately with new data
    sendHeartbeat();
  }, [sendHeartbeat]);

  /**
   * Initialize presence tracking
   */
  useEffect(() => {
    if (!enabled || !user) return;

    // Initial presence setup
    presenceDataRef.current = {
      status: 'active',
      color: assignColor(user.id),
    };
    setMyPresence(presenceDataRef.current);

    // Send initial heartbeat
    sendHeartbeat();

    // Fetch active collaborators initially
    fetchActiveCollaborators();

    // Set up heartbeat interval
    heartbeatIntervalRef.current = window.setInterval(() => {
      sendHeartbeat();
      fetchActiveCollaborators();
    }, heartbeatInterval);

    // Set up real-time subscription to presence changes
    const channel = supabase
      .channel(`presence:${resourceType}:${resourceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `resource_id=eq.${resourceId}`,
        },
        () => {
          // Refetch when presence changes
          fetchActiveCollaborators();
        }
      )
      .subscribe();

    // Handle visibility change (tab switched)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updatePresence({ status: 'away' });
      } else {
        updatePresence({ status: 'active' });
        sendHeartbeat();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup
    return () => {
      // Clear heartbeat interval
      if (heartbeatIntervalRef.current !== null) {
        clearInterval(heartbeatIntervalRef.current);
      }

      // Remove presence record
      supabase.from('user_presence').delete().match({
        user_id: user.id,
        resource_type: resourceType,
        resource_id: resourceId,
      });

      // Unsubscribe from channel
      channel.unsubscribe();

      // Remove event listener
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, user, resourceType, resourceId, heartbeatInterval, sendHeartbeat, fetchActiveCollaborators, updatePresence]);

  return {
    activeUsers: activeUsers.filter(u => u.userId !== user?.id), // Exclude self
    myPresence,
    updatePresence,
    isConnected,
  };
}
