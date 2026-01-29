/**
 * Secrets Delete Edge Function
 *
 * Deletes an encrypted secret
 *
 * @method DELETE or POST
 * @auth Required
 * @body { secret_key: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, createSuccessResponse, createErrorResponse } from '../_shared/auth.ts';
import { deleteSecret, validateSecretKey } from '../_shared/encryption.ts';

serve(requireAuth(async (req, user, supabase) => {
  try {
    // Allow both DELETE and POST methods
    if (req.method !== 'DELETE' && req.method !== 'POST') {
      return createErrorResponse(
        'method_not_allowed',
        'Only DELETE or POST requests are allowed',
        405
      );
    }

    // Parse request body
    const body = await req.json();
    const { secret_key } = body;

    // Validate input
    if (!secret_key || typeof secret_key !== 'string') {
      return createErrorResponse(
        'invalid_input',
        'secret_key is required and must be a string',
        400
      );
    }

    // Validate secret key format
    if (!validateSecretKey(secret_key)) {
      return createErrorResponse(
        'invalid_secret_key',
        'Secret key must be lowercase alphanumeric with underscores (3-64 chars)',
        400
      );
    }

    // Delete the secret
    await deleteSecret(supabase, user.id, secret_key);

    return createSuccessResponse({
      secret_key,
      deleted: true,
      deleted_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error deleting secret:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      return createErrorResponse(
        'secret_not_found',
        'Secret not found',
        404
      );
    }

    return createErrorResponse(
      'deletion_failed',
      error instanceof Error ? error.message : 'Failed to delete secret',
      500
    );
  }
}));
