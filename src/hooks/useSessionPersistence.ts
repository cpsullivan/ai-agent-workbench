/**
 * Session Persistence Hook
 *
 * Provides auto-save functionality for agent sessions
 * Saves snapshots every 30 seconds when session state changes
 *
 * @module useSessionPersistence
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessionState } from '@/types';

// ============================================================================
// Constants
// ============================================================================

const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const DEBOUNCE_DELAY = 5000; // 5 seconds

// ============================================================================
// Types
// ============================================================================

export interface PersistenceStatus {
  isSaving: boolean;
  lastSaved: Date | null;
  saveCount: number;
  error: string | null;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Save a session snapshot
 */
async function saveSnapshot(
  sessionId: string,
  snapshotData: SessionState
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-snapshot-save`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          snapshot_data: snapshotData,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to save snapshot' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error saving snapshot:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use session persistence
 *
 * Automatically saves session state every 30 seconds
 * Includes debouncing to prevent excessive saves
 *
 * @param sessionId - The session ID to persist
 * @param sessionState - Current state of the session
 * @param enabled - Whether auto-save is enabled
 *
 * @example
 * ```tsx
 * const { status, saveNow } = useSessionPersistence(
 *   sessionId,
 *   sessionState,
 *   true
 * );
 *
 * // Manual save
 * await saveNow();
 *
 * // Check status
 * if (status.isSaving) {
 *   return <div>Saving...</div>;
 * }
 *
 * if (status.lastSaved) {
 *   return <div>Last saved: {status.lastSaved.toLocaleTimeString()}</div>;
 * }
 * ```
 */
export function useSessionPersistence(
  sessionId: string | null,
  sessionState: SessionState | null,
  enabled: boolean = true
) {
  const [status, setStatus] = useState<PersistenceStatus>({
    isSaving: false,
    lastSaved: null,
    saveCount: 0,
    error: null,
  });

  const saveTimeoutRef = useRef<number | null>(null);
  const debounceTimeoutRef = useRef<number | null>(null);
  const lastStateRef = useRef<string | null>(null);
  const saveCountRef = useRef(0);

  /**
   * Save the current state immediately
   */
  const saveNow = useCallback(async () => {
    if (!sessionId || !sessionState) {
      return;
    }

    // Check if state actually changed
    const currentStateStr = JSON.stringify(sessionState);
    if (currentStateStr === lastStateRef.current) {
      return; // No changes, skip save
    }

    setStatus(prev => ({ ...prev, isSaving: true, error: null }));

    const result = await saveSnapshot(sessionId, sessionState);

    if (result.success) {
      lastStateRef.current = currentStateStr;
      saveCountRef.current += 1;

      setStatus({
        isSaving: false,
        lastSaved: new Date(),
        saveCount: saveCountRef.current,
        error: null,
      });
    } else {
      setStatus(prev => ({
        ...prev,
        isSaving: false,
        error: result.error || 'Failed to save',
      }));
    }
  }, [sessionId, sessionState]);

  /**
   * Debounced save - waits for state to stabilize before saving
   */
  const debouncedSave = useCallback(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      saveNow();
    }, DEBOUNCE_DELAY);
  }, [saveNow]);

  /**
   * Set up auto-save interval
   */
  useEffect(() => {
    if (!enabled || !sessionId || !sessionState) {
      return;
    }

    // Initial save after a short delay
    const initialTimeout = setTimeout(() => {
      saveNow();
    }, 2000);

    // Set up periodic auto-save
    saveTimeoutRef.current = setInterval(() => {
      saveNow();
    }, AUTO_SAVE_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      if (saveTimeoutRef.current) {
        clearInterval(saveTimeoutRef.current);
      }
    };
  }, [enabled, sessionId, sessionState, saveNow]);

  /**
   * Trigger debounced save when state changes
   */
  useEffect(() => {
    if (!enabled || !sessionId || !sessionState) {
      return;
    }

    debouncedSave();

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [enabled, sessionId, sessionState, debouncedSave]);

  /**
   * Save on unmount (page close/refresh)
   */
  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (sessionId && sessionState) {
        // Use navigator.sendBeacon for guaranteed delivery
        const { data } = await supabase.auth.getSession();
        if (data?.session) {
          navigator.sendBeacon(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-snapshot-save`,
            JSON.stringify({
              session_id: sessionId,
              snapshot_data: sessionState,
            })
          );
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Final save on component unmount
      if (sessionId && sessionState) {
        saveNow();
      }
    };
  }, [sessionId, sessionState, saveNow]);

  return {
    status,
    saveNow,
    isSaving: status.isSaving,
    lastSaved: status.lastSaved,
    saveCount: status.saveCount,
    error: status.error,
  };
}

/**
 * Helper hook to format last saved time
 */
export function useLastSavedTime(lastSaved: Date | null): string {
  const [timeAgo, setTimeAgo] = useState('');

  useEffect(() => {
    if (!lastSaved) {
      setTimeAgo('');
      return;
    }

    const updateTime = () => {
      const now = new Date();
      const diff = now.getTime() - lastSaved.getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);

      if (seconds < 10) {
        setTimeAgo('just now');
      } else if (seconds < 60) {
        setTimeAgo(`${seconds}s ago`);
      } else if (minutes < 60) {
        setTimeAgo(`${minutes}m ago`);
      } else {
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTime();
    const interval = setInterval(updateTime, 10000); // Update every 10s

    return () => clearInterval(interval);
  }, [lastSaved]);

  return timeAgo;
}
