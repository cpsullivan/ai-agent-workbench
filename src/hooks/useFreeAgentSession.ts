/**
 * Free Agent Session Hook
 *
 * CRITICAL: Core hook for managing AI agent sessions
 * This is a foundational implementation that integrates with persistence.
 * Full agent execution logic will be added in future phases.
 *
 * @module useFreeAgentSession
 */

import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from './useAuth';
import { useSessionPersistence } from './useSessionPersistence';
import { useSessionRestore } from './useSessionRestore';
import { useRealtimeCollaboration } from './useRealtimeCollaboration';
import { usePresence } from './usePresence';
import type { FreeAgentSession, SessionState, SessionMessage } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface AgentSessionConfig {
  name: string;
  model: string;
  description?: string;
  initialPrompt?: string;
}

export interface AgentExecutionOptions {
  maxSteps?: number;
  temperature?: number;
  streaming?: boolean;
}

export interface SessionCollaborationOptions {
  enableCollaboration?: boolean; // Default: true if session exists
  enablePresence?: boolean; // Default: true
  onUserJoined?: (userName: string) => void;
  onUserLeft?: (userName: string) => void;
}

// ============================================================================
// Default State
// ============================================================================

function createInitialState(initialPrompt?: string): SessionState {
  const messages: SessionMessage[] = [];

  if (initialPrompt) {
    messages.push({
      id: crypto.randomUUID(),
      session_id: '',
      role: 'user',
      content: initialPrompt,
      message_order: 0,
      created_at: new Date().toISOString(),
    });
  }

  return {
    messages,
    memory: {
      blackboard: {},
      scratchpad: [],
      attributes: {},
    },
    currentStep: undefined,
    isRunning: false,
    lastError: null,
  };
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use Free Agent Session
 *
 * Main hook for managing autonomous AI agent sessions
 * Integrates with persistence system for auto-save and restore
 *
 * @example
 * ```tsx
 * const {
 *   session,
 *   sessionState,
 *   createSession,
 *   executeAgent,
 *   addMessage,
 *   isLoading,
 * } = useFreeAgentSession();
 *
 * // Create a new session
 * await createSession({
 *   name: 'My Agent Session',
 *   model: 'gpt-4',
 *   initialPrompt: 'Help me build a web app',
 * });
 *
 * // Execute agent (placeholder for now)
 * await executeAgent();
 * ```
 */
export function useFreeAgentSession(
  existingSessionId?: string,
  collaborationOptions?: SessionCollaborationOptions
) {
  const { user } = useAuth();
  const [session, setSession] = useState<FreeAgentSession | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collaboration options with defaults
  const enableCollaboration = collaborationOptions?.enableCollaboration ?? !!existingSessionId;
  const enablePresence = collaborationOptions?.enablePresence ?? true;

  // Session persistence (auto-save every 30s)
  const { status: persistenceStatus, saveNow } = useSessionPersistence(
    session?.id || null,
    sessionState,
    !!session && session.status === 'active'
  );

  // Session restore
  const { restore, isRestoring } = useSessionRestore();

  // Real-time collaboration (enabled for existing sessions)
  const collaboration = useRealtimeCollaboration<SessionState>({
    resourceType: 'session',
    resourceId: session?.id || '',
    initialState: sessionState || createInitialState(),
    userId: user?.id || '',
    enableOT: true,
    onRemoteChange: (newState, operation) => {
      // Update local state when remote changes arrive
      setSessionState(newState);
      console.log('Remote change applied:', operation);
    },
    onUserJoined: userName => {
      collaborationOptions?.onUserJoined?.(userName);
    },
    onUserLeft: userName => {
      collaborationOptions?.onUserLeft?.(userName);
    },
  });

  // Presence tracking
  const presence = usePresence({
    resourceType: 'session',
    resourceId: session?.id || '',
    enabled: enablePresence && !!session?.id,
    onUserJoined: user => {
      console.log(`${user.userName || user.userEmail} joined the session`);
    },
    onUserLeft: userId => {
      console.log(`User ${userId} left the session`);
    },
  });

  /**
   * Create a new session
   */
  const createSession = useCallback(
    async (config: AgentSessionConfig): Promise<FreeAgentSession | null> => {
      if (!user) {
        setError('User not authenticated');
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Create session in database
        const { data, error: dbError } = await supabase
          .from('free_agent_sessions')
          .insert({
            user_id: user.id,
            organization_id: user.organization_id,
            name: config.name,
            description: config.description,
            model: config.model,
            status: 'active',
            visibility: 'private',
          })
          .select()
          .single();

        if (dbError) {
          throw new Error(dbError.message);
        }

        const newSession = data as FreeAgentSession;
        setSession(newSession);

        // Initialize state
        const initialState = createInitialState(config.initialPrompt);
        setSessionState(initialState);

        // Add creator as owner collaborator
        if (enableCollaboration) {
          await supabase.rpc('add_collaborator', {
            p_resource_type: 'session',
            p_resource_id: newSession.id,
            p_user_id: user.id,
            p_role: 'owner',
            p_invited_by: user.id,
          });
        }

        // Save initial snapshot
        await saveNow();

        return newSession;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to create session';
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [user, saveNow, enableCollaboration]
  );

  /**
   * Load an existing session
   */
  const loadSession = useCallback(
    async (sessionId: string): Promise<boolean> => {
      setIsLoading(true);
      setError(null);

      try {
        // Load session from database
        const { data: sessionData, error: sessionError } = await supabase
          .from('free_agent_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (sessionError) {
          throw new Error(sessionError.message);
        }

        setSession(sessionData as FreeAgentSession);

        // Restore latest snapshot
        const restoreResult = await restore(sessionId);

        if (restoreResult.success && restoreResult.sessionState) {
          setSessionState(restoreResult.sessionState);
          return true;
        } else {
          // No snapshot found, create initial state
          setSessionState(createInitialState());
          return true;
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to load session';
        setError(errorMsg);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [restore]
  );

  /**
   * Add a message to the session
   */
  const addMessage = useCallback(
    async (role: 'user' | 'assistant' | 'system', content: string) => {
      if (!session || !sessionState) {
        return;
      }

      const newMessage: SessionMessage = {
        id: crypto.randomUUID(),
        session_id: session.id,
        role,
        content,
        message_order: sessionState.messages.length,
        created_at: new Date().toISOString(),
      };

      // Update local state
      setSessionState(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          messages: [...prev.messages, newMessage],
        };
      });

      // Broadcast to collaborators if enabled
      if (enableCollaboration && collaboration.isConnected) {
        await collaboration.broadcastChange({
          type: 'update',
          path: 'messages',
          value: [...sessionState.messages, newMessage],
        });
      }

      // Save message to database (asynchronously)
      supabase.from('session_messages').insert({
        session_id: session.id,
        role,
        content,
        message_order: newMessage.message_order,
      });
    },
    [session, sessionState, enableCollaboration, collaboration]
  );

  /**
   * Execute the agent (placeholder)
   * Full implementation will be added in later phases
   */
  const executeAgent = useCallback(
    async (_options?: AgentExecutionOptions): Promise<void> => {
      if (!session || !sessionState) {
        setError('No active session');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Update state to show agent is running
        setSessionState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            isRunning: true,
            currentStep: 'Initializing agent...',
          };
        });

        // TODO: Implement full agent execution in future phases
        // This will include:
        // - AI model API calls
        // - Tool execution
        // - Memory management
        // - Child agent spawning
        // - Autonomous decision making

        // Placeholder: Simulate agent thinking
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Add a placeholder response
        addMessage(
          'assistant',
          'Agent execution is not yet fully implemented. This is a placeholder response. Full autonomous agent capabilities will be added in Phase 2.'
        );

        // Update state
        setSessionState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            isRunning: false,
            currentStep: undefined,
          };
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Agent execution failed';
        setError(errorMsg);

        setSessionState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            isRunning: false,
            lastError: errorMsg,
          };
        });
      } finally {
        setIsLoading(false);
      }
    },
    [session, sessionState, addMessage]
  );

  /**
   * Update session status
   */
  const updateStatus = useCallback(
    async (status: 'active' | 'paused' | 'completed' | 'error') => {
      if (!session) return;

      const { error: updateError } = await supabase
        .from('free_agent_sessions')
        .update({ status })
        .eq('id', session.id);

      if (!updateError) {
        setSession(prev => (prev ? { ...prev, status } : null));
      }
    },
    [session]
  );

  /**
   * Auto-load session on mount if ID provided
   */
  useEffect(() => {
    if (existingSessionId && !session) {
      loadSession(existingSessionId);
    }
  }, [existingSessionId, session, loadSession]);

  /**
   * Sync collaboration state with local session state
   */
  useEffect(() => {
    if (enableCollaboration && session && sessionState && collaboration.isConnected) {
      // Use collaboration state if available
      if (collaboration.state && collaboration.state !== sessionState) {
        setSessionState(collaboration.state);
      }
    }
  }, [enableCollaboration, session, sessionState, collaboration.isConnected, collaboration.state]);

  return {
    // Session data
    session,
    sessionState,

    // Actions
    createSession,
    loadSession,
    executeAgent,
    addMessage,
    updateStatus,
    saveNow,

    // State
    isLoading: isLoading || isRestoring,
    error,
    isSaving: persistenceStatus.isSaving,
    lastSaved: persistenceStatus.lastSaved,
    saveCount: persistenceStatus.saveCount,

    // Collaboration
    collaboration: {
      isConnected: collaboration.isConnected,
      activeUsers: collaboration.activeUsers,
      broadcastChange: collaboration.broadcastChange,
    },

    // Presence
    presence: {
      activeUsers: presence.activeUsers,
      myPresence: presence.myPresence,
      updatePresence: presence.updatePresence,
      isConnected: presence.isConnected,
    },
  };
}
