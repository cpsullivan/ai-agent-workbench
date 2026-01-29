/**
 * Workflow Version Create API
 *
 * Creates a new immutable version of a workflow (Git-style versioning)
 * POST /workflow-version-create
 *
 * Body:
 * {
 *   workflow_id: string;
 *   workflow_data: object; // Complete workflow definition
 *   version_name?: string; // e.g., "v1.2" or "Production Release"
 *   changelog?: string; // Description of changes
 * }
 *
 * @module workflow-version-create
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CreateVersionRequest {
  workflow_id: string;
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

async function handleCreateVersion(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: CreateVersionRequest = await req.json();

    // Validate required fields
    if (!body.workflow_id || !body.workflow_data) {
      return createErrorResponse('Missing required fields: workflow_id, workflow_data');
    }

    // Validate workflow_data is an object
    if (typeof body.workflow_data !== 'object' || body.workflow_data === null) {
      return createErrorResponse('workflow_data must be a valid object');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check workflow exists and user has permission
    const { data: existingWorkflow, error: fetchError } = await supabase
      .from('workflows')
      .select('id, user_id, organization_id, name, version_count')
      .eq('id', body.workflow_id)
      .single();

    if (fetchError || !existingWorkflow) {
      return createErrorResponse('Workflow not found', 404);
    }

    // Verify user owns the workflow
    if (existingWorkflow.user_id !== user.id) {
      return createErrorResponse('Unauthorized: You do not own this workflow', 403);
    }

    // Create new version using helper function
    const { data: versionId, error: versionError } = await supabase.rpc(
      'create_workflow_version',
      {
        p_workflow_id: body.workflow_id,
        p_workflow_data: body.workflow_data,
        p_user_id: user.id,
        p_version_name: body.version_name,
        p_changelog: body.changelog,
      }
    );

    if (versionError) {
      console.error('Error creating version:', versionError);
      return createErrorResponse('Failed to create version: ' + versionError.message);
    }

    // Fetch the created version details
    const { data: versionDetails, error: versionFetchError } = await supabase
      .from('workflow_versions')
      .select('*')
      .eq('id', versionId)
      .single();

    if (versionFetchError) {
      console.error('Error fetching version details:', versionFetchError);
      return createErrorResponse('Version created but failed to fetch details');
    }

    // Fetch updated workflow
    const { data: updatedWorkflow, error: workflowFetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', body.workflow_id)
      .single();

    if (workflowFetchError) {
      console.error('Error fetching workflow:', workflowFetchError);
    }

    return createSuccessResponse({
      version: versionDetails,
      workflow: updatedWorkflow,
      message: `Version ${versionDetails.version_number} created successfully`,
    });
  } catch (error) {
    console.error('Error in handleCreateVersion:', error);
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
  return requireAuth(req, handleCreateVersion);
});
