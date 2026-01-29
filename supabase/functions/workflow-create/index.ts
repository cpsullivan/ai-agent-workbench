/**
 * Workflow Create API
 *
 * Creates a new workflow with initial version
 * POST /workflow-create
 *
 * Body:
 * {
 *   name: string;
 *   description?: string;
 *   category?: string;
 *   tags?: string[];
 *   visibility?: 'private' | 'organization' | 'public';
 *   workflow_data: object; // Initial workflow definition
 *   version_name?: string;
 *   changelog?: string;
 * }
 *
 * @module workflow-create
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateWorkflowRequest {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility?: 'private' | 'organization' | 'public';
  workflow_data: object;
  version_name?: string;
  changelog?: string;
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

async function handleCreateWorkflow(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: CreateWorkflowRequest = await req.json();

    // Validate required fields
    if (!body.name || !body.workflow_data) {
      return createErrorResponse('Missing required fields: name, workflow_data');
    }

    // Validate name length
    if (body.name.length < 3 || body.name.length > 100) {
      return createErrorResponse('Workflow name must be between 3 and 100 characters');
    }

    // Validate visibility
    const visibility = body.visibility || 'private';
    if (!['private', 'organization', 'public'].includes(visibility)) {
      return createErrorResponse('Invalid visibility value');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create workflow record
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .insert({
        user_id: user.id,
        organization_id: user.organization_id,
        name: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags,
        status: 'draft',
        visibility,
      })
      .select()
      .single();

    if (workflowError) {
      console.error('Error creating workflow:', workflowError);
      return createErrorResponse('Failed to create workflow: ' + workflowError.message);
    }

    // Create initial version using helper function
    const { data: versionData, error: versionError } = await supabase.rpc(
      'create_workflow_version',
      {
        p_workflow_id: workflow.id,
        p_workflow_data: body.workflow_data,
        p_user_id: user.id,
        p_version_name: body.version_name || 'Initial Version',
        p_changelog: body.changelog || 'Initial workflow creation',
      }
    );

    if (versionError) {
      console.error('Error creating initial version:', versionError);
      // Rollback: Delete the workflow
      await supabase.from('workflows').delete().eq('id', workflow.id);
      return createErrorResponse('Failed to create initial version: ' + versionError.message);
    }

    // Fetch complete workflow with version info
    const { data: completeWorkflow, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', workflow.id)
      .single();

    if (fetchError) {
      console.error('Error fetching workflow:', fetchError);
      return createErrorResponse('Workflow created but failed to fetch details');
    }

    return createSuccessResponse({
      workflow: completeWorkflow,
      version_id: versionData,
      message: 'Workflow created successfully',
    });
  } catch (error) {
    console.error('Error in handleCreateWorkflow:', error);
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

  // Only allow POST
  if (req.method !== 'POST') {
    return createErrorResponse('Method not allowed', 405);
  }

  // Require authentication
  return requireAuth(req, handleCreateWorkflow);
});
