/**
 * Secrets List Edge Function
 *
 * Lists all secrets for the authenticated user (metadata only, no values)
 *
 * @method GET
 * @auth Required
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, createSuccessResponse, createErrorResponse } from '../_shared/auth.ts';
import { listSecrets } from '../_shared/encryption.ts';

serve(requireAuth(async (req, user, supabase) => {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return createErrorResponse(
        'method_not_allowed',
        'Only GET requests are allowed',
        405
      );
    }

    // List all secrets for the user
    const secrets = await listSecrets(supabase, user.id);

    return createSuccessResponse({
      secrets,
      count: secrets.length,
    });
  } catch (error) {
    console.error('Error listing secrets:', error);
    return createErrorResponse(
      'list_failed',
      error instanceof Error ? error.message : 'Failed to list secrets',
      500
    );
  }
}));
