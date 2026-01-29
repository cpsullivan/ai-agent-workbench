/**
 * Session Snapshot Restore Edge Function
 *
 * Retrieves the latest snapshot for a session to restore state
 *
 * @method POST
 * @auth Required
 * @body { session_id: string, snapshot_number?: number }
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
    const { session_id, snapshot_number } = body;

    // Validate input
    if (!session_id || typeof session_id !== 'string') {
      return createErrorResponse(
        'invalid_input',
        'session_id is required and must be a string',
        400
      );
    }

    // Verify session belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('free_agent_sessions')
      .select('id, user_id, name, status, model, snapshot_count')
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
        'You do not have permission to restore this session',
        403
      );
    }

    // Get snapshot (specific number or latest)
    let snapshotQuery = supabase
      .from('session_snapshots')
      .select('id, snapshot_number, snapshot_data, snapshot_size, created_at')
      .eq('session_id', session_id);

    if (snapshot_number !== undefined) {
      snapshotQuery = snapshotQuery.eq('snapshot_number', snapshot_number);
    } else {
      snapshotQuery = snapshotQuery.order('snapshot_number', { ascending: false }).limit(1);
    }

    const { data: snapshot, error: snapshotError } = await snapshotQuery.single();

    if (snapshotError || !snapshot) {
      return createErrorResponse(
        'snapshot_not_found',
        'No snapshot found for this session',
        404
      );
    }

    return createSuccessResponse({
      session_id,
      session_name: session.name,
      session_status: session.status,
      session_model: session.model,
      snapshot_id: snapshot.id,
      snapshot_number: snapshot.snapshot_number,
      snapshot_data: snapshot.snapshot_data,
      snapshot_size: snapshot.snapshot_size,
      snapshot_created_at: snapshot.created_at,
      total_snapshots: session.snapshot_count,
    });
  } catch (error) {
    console.error('Error in session-snapshot-restore:', error);
    return createErrorResponse(
      'internal_error',
      error instanceof Error ? error.message : 'An error occurred while restoring snapshot',
      500
    );
  }
}));
