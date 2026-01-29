/**
 * Session Restore Hook
 *
 * Restores session state from the latest snapshot
 * Handles session recovery on page load/refresh
 *
 * @module useSessionRestore
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { SessionState, SessionSnapshot } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface RestoreResult {
  success: boolean;
  sessionState: SessionState | null;
  snapshot: SessionSnapshot | null;
  error?: string;
}

export interface RestoreStatus {
  isRestoring: boolean;
  isRestored: boolean;
  error: string | null;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Restore a session snapshot
 */
async function restoreSnapshot(
  sessionId: string,
  snapshotNumber?: number
): Promise<RestoreResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return {
        success: false,
        sessionState: null,
        snapshot: null,
        error: 'Not authenticated',
      };
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-snapshot-restore`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          snapshot_number: snapshotNumber,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      return {
        success: false,
        sessionState: null,
        snapshot: null,
        error: error.message || 'Failed to restore snapshot',
      };
    }

    const data = await response.json();

    return {
      success: true,
      sessionState: data.snapshot_data as SessionState,
      snapshot: {
        id: data.snapshot_id,
        session_id: data.session_id,
        snapshot_number: data.snapshot_number,
        snapshot_data: data.snapshot_data,
        snapshot_size: data.snapshot_size,
        created_at: data.snapshot_created_at,
      },
    };
  } catch (error) {
    console.error('Error restoring snapshot:', error);
    return {
      success: false,
      sessionState: null,
      snapshot: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use session restore
 *
 * Provides functionality to restore a session from its latest snapshot
 *
 * @example
 * ```tsx
 * const { restore, status, result } = useSessionRestore();
 *
 * useEffect(() => {
 *   if (sessionId) {
 *     restore(sessionId);
 *   }
 * }, [sessionId]);
 *
 * if (status.isRestoring) {
 *   return <div>Restoring session...</div>;
 * }
 *
 * if (status.error) {
 *   return <div>Error: {status.error}</div>;
 * }
 *
 * if (result?.sessionState) {
 *   // Use restored state
 * }
 * ```
 */
export function useSessionRestore() {
  const [status, setStatus] = useState<RestoreStatus>({
    isRestoring: false,
    isRestored: false,
    error: null,
  });

  const [result, setResult] = useState<RestoreResult | null>(null);

  /**
   * Restore a session from its latest snapshot
   */
  const restore = useCallback(async (
    sessionId: string,
    snapshotNumber?: number
  ): Promise<RestoreResult> => {
    setStatus({
      isRestoring: true,
      isRestored: false,
      error: null,
    });

    setResult(null);

    const restoreResult = await restoreSnapshot(sessionId, snapshotNumber);

    if (restoreResult.success) {
      setStatus({
        isRestoring: false,
        isRestored: true,
        error: null,
      });
      setResult(restoreResult);
    } else {
      setStatus({
        isRestoring: false,
        isRestored: false,
        error: restoreResult.error || 'Failed to restore session',
      });
      setResult(restoreResult);
    }

    return restoreResult;
  }, []);

  /**
   * Reset the restore state
   */
  const reset = useCallback(() => {
    setStatus({
      isRestoring: false,
      isRestored: false,
      error: null,
    });
    setResult(null);
  }, []);

  return {
    restore,
    reset,
    status,
    result,
    isRestoring: status.isRestoring,
    isRestored: status.isRestored,
    error: status.error,
    sessionState: result?.sessionState || null,
    snapshot: result?.snapshot || null,
  };
}

/**
 * Helper hook to automatically restore a session on mount
 */
export function useAutoRestore(sessionId: string | null) {
  const { restore, status, sessionState } = useSessionRestore();
  const [hasAttempted, setHasAttempted] = useState(false);

  // Auto-restore on mount if sessionId provided
  useEffect(() => {
    if (sessionId && !hasAttempted) {
      setHasAttempted(true);
      restore(sessionId);
    }
  }, [sessionId, hasAttempted, restore]);

  return {
    ...status,
    sessionState,
    isReady: hasAttempted && !status.isRestoring,
  };
}
