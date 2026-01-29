/**
 * Session Snapshot Save Edge Function
 *
 * Creates a snapshot of the current session state for persistence
 *
 * @method POST
 * @auth Required
 * @body { session_id: string, snapshot_data: object }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, createSuccessResponse, createErrorResponse } from '../_shared/auth.ts';

serve(requireAuth(async (req, user, supabase) => {
  try {
    // Only allow POST requests
    if (req.method !== 'POST') {
      return createErrorResponse(
        'method_not_allowed',
        'Only POST requests are allowed',
        405
      );
    }

    // Parse request body
    const body = await req.json();
    const { session_id, snapshot_data } = body;

    // Validate input
    if (!session_id || typeof session_id !== 'string') {
      return createErrorResponse(
        'invalid_input',
        'session_id is required and must be a string',
        400
      );
    }

    if (!snapshot_data || typeof snapshot_data !== 'object') {
      return createErrorResponse(
        'invalid_input',
        'snapshot_data is required and must be an object',
        400
      );
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('free_agent_sessions')
      .select('id, user_id')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return createErrorResponse(
        'session_not_found',
        'Session not found',
        404
      );
    }

    if (session.user_id !== user.id) {
      return createErrorResponse(
        'forbidden',
        'You do not have permission to save snapshots for this session',
        403
      );
    }

    // Create snapshot using database function
    const { data: snapshotId, error: snapshotError } = await supabase
      .rpc('create_session_snapshot', {
        p_session_id: session_id,
        p_snapshot_data: snapshot_data,
      });

    if (snapshotError) {
      console.error('Error creating snapshot:', snapshotError);
      return createErrorResponse(
        'snapshot_failed',
        'Failed to create snapshot',
        500
      );
    }

    // Get updated session info
    const { data: updatedSession } = await supabase
      .from('free_agent_sessions')
      .select('snapshot_count, last_snapshot_at')
      .eq('id', session_id)
      .single();

    return createSuccessResponse({
      snapshot_id: snapshotId,
      session_id,
      snapshot_number: updatedSession?.snapshot_count || 0,
      saved_at: updatedSession?.last_snapshot_at || new Date().toISOString(),
    }, 201);
  } catch (error) {
    console.error('Error in session-snapshot-save:', error);
    return createErrorResponse(
      'internal_error',
      error instanceof Error ? error.message : 'An error occurred while saving snapshot',
      500
    );
  }
}));
