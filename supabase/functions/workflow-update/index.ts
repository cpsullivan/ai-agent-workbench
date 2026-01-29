/**
 * Workflow Update API
 *
 * Updates workflow metadata (NOT the workflow data - use version-create for that)
 * PATCH /workflow-update
 *
 * Body:
 * {
 *   workflow_id: string;
 *   name?: string;
 *   description?: string;
 *   category?: string;
 *   tags?: string[];
 *   status?: 'draft' | 'active' | 'archived';
 *   visibility?: 'private' | 'organization' | 'public';
 * }
 *
 * @module workflow-update
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UpdateWorkflowRequest {
  workflow_id: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'private' | 'organization' | 'public';
}

function createSuccessResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  });
}

function createErrorResponse(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}

async function handleUpdateWorkflow(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: UpdateWorkflowRequest = await req.json();

    // Validate required fields
    if (!body.workflow_id) {
      return createErrorResponse('Missing required field: workflow_id');
    }

    // Validate at least one field to update
    const hasUpdates =
      body.name !== undefined ||
      body.description !== undefined ||
      body.category !== undefined ||
      body.tags !== undefined ||
      body.status !== undefined ||
      body.visibility !== undefined;

    if (!hasUpdates) {
      return createErrorResponse('No fields to update');
    }

    // Validate name if provided
    if (body.name !== undefined && (body.name.length < 3 || body.name.length > 100)) {
      return createErrorResponse('Workflow name must be between 3 and 100 characters');
    }

    // Validate status if provided
    if (body.status && !['draft', 'active', 'archived'].includes(body.status)) {
      return createErrorResponse('Invalid status value');
    }

    // Validate visibility if provided
    if (body.visibility && !['private', 'organization', 'public'].includes(body.visibility)) {
      return createErrorResponse('Invalid visibility value');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check workflow exists and user has permission
    const { data: existingWorkflow, error: fetchError } = await supabase
      .from('workflows')
      .select('user_id, organization_id')
      .eq('id', body.workflow_id)
      .single();

    if (fetchError || !existingWorkflow) {
      return createErrorResponse('Workflow not found', 404);
    }

    // Verify user owns the workflow
    if (existingWorkflow.user_id !== user.id) {
      return createErrorResponse('Unauthorized: You do not own this workflow', 403);
    }

    // Build update object
    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.category !== undefined) updates.category = body.category;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.status !== undefined) updates.status = body.status;
    if (body.visibility !== undefined) updates.visibility = body.visibility;

    // Update workflow
    const { data: updatedWorkflow, error: updateError } = await supabase
      .from('workflows')
      .update(updates)
      .eq('id', body.workflow_id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating workflow:', updateError);
      return createErrorResponse('Failed to update workflow: ' + updateError.message);
    }

    return createSuccessResponse({
      workflow: updatedWorkflow,
      message: 'Workflow updated successfully',
    });
  } catch (error) {
    console.error('Error in handleUpdateWorkflow:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unknown error occurred',
      500
    );
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Only allow PATCH
  if (req.method !== 'PATCH') {
    return createErrorResponse('Method not allowed', 405);
  }

  // Require authentication
  return requireAuth(req, handleUpdateWorkflow);
});
