/**
 * Workflow Execute API
 *
 * Executes a workflow and tracks execution history
 * POST /workflow-execute
 *
 * Body:
 * {
 *   workflow_id: string;
 *   version_id?: string; // Optional - uses current version if not provided
 *   input_data?: object; // Input parameters for workflow
 * }
 *
 * Response:
 * {
 *   execution_id: string;
 *   status: 'pending' | 'running' | 'completed' | 'failed';
 *   output_data?: object;
 *   error_message?: string;
 * }
 *
 * @module workflow-execute
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExecuteWorkflowRequest {
  workflow_id: string;
  version_id?: string;
  input_data?: object;
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

async function handleExecuteWorkflow(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: ExecuteWorkflowRequest = await req.json();

    // Validate required fields
    if (!body.workflow_id) {
      return createErrorResponse('Missing required field: workflow_id');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id, organization_id, name, status, current_version_id, visibility')
      .eq('id', body.workflow_id)
      .single();

    if (workflowError || !workflow) {
      return createErrorResponse('Workflow not found', 404);
    }

    // Check visibility permissions
    const canAccess =
      workflow.user_id === user.id ||
      workflow.visibility === 'public' ||
      (workflow.visibility === 'organization' &&
        workflow.organization_id === user.organization_id);

    if (!canAccess) {
      return createErrorResponse('Unauthorized: You do not have access to this workflow', 403);
    }

    // Check workflow is active
    if (workflow.status !== 'active') {
      return createErrorResponse(
        `Workflow is ${workflow.status}. Only active workflows can be executed.`,
        400
      );
    }

    // Determine version to execute
    const versionId = body.version_id || workflow.current_version_id;

    if (!versionId) {
      return createErrorResponse('No version specified and workflow has no current version', 400);
    }

    // Fetch version data
    const { data: version, error: versionError } = await supabase
      .from('workflow_versions')
      .select('id, workflow_data, version_number')
      .eq('id', versionId)
      .eq('workflow_id', body.workflow_id)
      .single();

    if (versionError || !version) {
      return createErrorResponse('Version not found', 404);
    }

    // Create execution record
    const startedAt = new Date().toISOString();
    const { data: execution, error: executionError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: body.workflow_id,
        version_id: versionId,
        user_id: user.id,
        status: 'pending',
        input_data: body.input_data,
        started_at: startedAt,
      })
      .select()
      .single();

    if (executionError) {
      console.error('Error creating execution:', executionError);
      return createErrorResponse('Failed to create execution: ' + executionError.message);
    }

    // TODO: Implement actual workflow execution logic in Phase 2
    // For now, we just create the execution record and return a placeholder

    // Update execution to running
    await supabase
      .from('workflow_executions')
      .update({ status: 'running' })
      .eq('id', execution.id);

    // Simulate execution (placeholder)
    // In production, this would:
    // 1. Parse workflow_data nodes and edges
    // 2. Execute nodes in order (topological sort)
    // 3. Handle control flow (conditionals, loops)
    // 4. Execute tools/functions
    // 5. Track progress and metrics
    // 6. Update execution status

    // For now, return the execution record
    return createSuccessResponse({
      execution_id: execution.id,
      status: 'running',
      workflow_name: workflow.name,
      version_number: version.version_number,
      message:
        'Workflow execution started. Full execution engine will be implemented in Phase 2.',
      // In production, this endpoint would either:
      // - Return immediately with execution_id for async execution
      // - Execute synchronously and return results (for simple workflows)
      // - Stream results via WebSocket (for long-running workflows)
    });
  } catch (error) {
    console.error('Error in handleExecuteWorkflow:', error);
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
  return requireAuth(req, handleExecuteWorkflow);
});
