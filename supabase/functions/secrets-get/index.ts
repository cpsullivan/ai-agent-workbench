/**
 * Secrets Get Edge Function
 *
 * Retrieves and decrypts a specific secret value
 *
 * @method POST
 * @auth Required
 * @body { secret_key: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, createSuccessResponse, createErrorResponse } from '../_shared/auth.ts';
import { retrieveSecret, validateSecretKey } from '../_shared/encryption.ts';

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

    // Retrieve and decrypt the secret
    const secretValue = await retrieveSecret(supabase, user.id, secret_key);

    // SECURITY: Never log the decrypted value
    return createSuccessResponse({
      secret_key,
      secret_value: secretValue,
      retrieved_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error retrieving secret:', error);

    // Don't expose detailed error messages to client
    if (error instanceof Error && error.message.includes('not found')) {
      return createErrorResponse(
        'secret_not_found',
        'Secret not found',
        404
      );
    }

    return createErrorResponse(
      'retrieval_failed',
      'Failed to retrieve secret',
      500
    );
  }
}));
