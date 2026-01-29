/**
 * Secrets Set Edge Function
 *
 * Creates or updates an encrypted secret
 *
 * @method POST
 * @auth Required
 * @body { secret_key: string, secret_value: string, description?: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { requireAuth, createSuccessResponse, createErrorResponse } from '../_shared/auth.ts';
import { storeSecret, updateSecret, validateSecretKey, sanitizeSecretKey } from '../_shared/encryption.ts';

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
    const { secret_key, secret_value, description } = body;

    // Validate input
    if (!secret_key || typeof secret_key !== 'string') {
      return createErrorResponse(
        'invalid_input',
        'secret_key is required and must be a string',
        400
      );
    }

    if (!secret_value || typeof secret_value !== 'string') {
      return createErrorResponse(
        'invalid_input',
        'secret_value is required and must be a string',
        400
      );
    }

    // Validate and sanitize secret key
    const sanitizedKey = sanitizeSecretKey(secret_key);
    if (!validateSecretKey(sanitizedKey)) {
      return createErrorResponse(
        'invalid_secret_key',
        'Secret key must be lowercase alphanumeric with underscores (3-64 chars)',
        400
      );
    }

    // Check if value is too long (reasonable limit)
    if (secret_value.length > 10000) {
      return createErrorResponse(
        'value_too_long',
        'Secret value cannot exceed 10,000 characters',
        400
      );
    }

    // Check if secret already exists
    const { data: existing } = await supabase
      .from('user_secrets')
      .select('id')
      .eq('user_id', user.id)
      .eq('secret_key', sanitizedKey)
      .single();

    let result;

    if (existing) {
      // Update existing secret
      result = await updateSecret(
        supabase,
        user.id,
        sanitizedKey,
        secret_value,
        description
      );
    } else {
      // Create new secret
      result = await storeSecret(
        supabase,
        user.id,
        sanitizedKey,
        secret_value,
        description
      );
    }

    // Return success without the secret value
    return createSuccessResponse({
      id: result.id,
      secret_key: result.secret_key,
      description: result.description,
      created: !existing,
      updated: !!existing,
      created_at: result.created_at,
      updated_at: result.updated_at,
    }, existing ? 200 : 201);
  } catch (error) {
    console.error('Error setting secret:', error);

    // SECURITY: Never log the secret value
    return createErrorResponse(
      'set_failed',
      error instanceof Error ? error.message : 'Failed to set secret',
      500
    );
  }
}));
