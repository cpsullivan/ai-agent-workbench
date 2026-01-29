/**
 * Collaboration Sync API
 *
 * Handles Operational Transform (OT) conflict resolution
 * Used when multiple users edit the same resource simultaneously
 *
 * POST /collaboration-sync
 *
 * Body:
 * {
 *   resource_type: 'session' | 'workflow';
 *   resource_id: string;
 *   operations: Operation[]; // Pending local operations
 *   base_version: number; // Last known server version
 * }
 *
 * Returns:
 * {
 *   transformed_operations: Operation[]; // Operations to apply locally
 *   server_operations: Operation[]; // New server operations since base_version
 *   current_version: number; // Current server version
 * }
 *
 * @module collaboration-sync
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Operation {
  type: 'insert' | 'update' | 'delete' | 'move';
  path: string;
  value?: unknown;
  oldValue?: unknown;
  timestamp: number;
  userId: string;
  vectorClock: Record<string, number>;
}

interface SyncRequest {
  resource_type: 'session' | 'workflow';
  resource_id: string;
  operations: Operation[];
  base_version: number;
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

/**
 * Transform operation against another operation (simplified OT)
 * In production, use a full OT library like ShareDB or Yjs
 */
function transformOperation(op1: Operation, op2: Operation): Operation {
  // If operations affect different paths, no transformation needed
  if (!pathsOverlap(op1.path, op2.path)) {
    return op1;
  }

  // If op2 was created after op1, op1 takes precedence
  if (op2.timestamp > op1.timestamp) {
    return op1;
  }

  // If both operations are updates to the same path
  if (op1.type === 'update' && op2.type === 'update' && op1.path === op2.path) {
    // Last write wins (based on vector clock)
    const op1Clock = Object.values(op1.vectorClock).reduce((a, b) => a + b, 0);
    const op2Clock = Object.values(op2.vectorClock).reduce((a, b) => a + b, 0);

    if (op2Clock > op1Clock) {
      // op2 wins, discard op1
      return { ...op1, type: 'update', value: op2.value };
    }
  }

  return op1;
}

/**
 * Check if two JSON paths overlap
 */
function pathsOverlap(path1: string, path2: string): boolean {
  return path1.startsWith(path2) || path2.startsWith(path1) || path1 === path2;
}

async function handleSync(req: Request, user: AppUser): Promise<Response> {
  try {
    const body: SyncRequest = await req.json();

    // Validate required fields
    if (!body.resource_type || !body.resource_id || !Array.isArray(body.operations)) {
      return createErrorResponse('Missing required fields: resource_type, resource_id, operations');
    }

    // Validate resource type
    if (!['session', 'workflow'].includes(body.resource_type)) {
      return createErrorResponse('Invalid resource_type. Must be session or workflow');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check user has access to resource
    const hasAccess = await checkResourceAccess(
      supabase,
      body.resource_type,
      body.resource_id,
      user.id
    );

    if (!hasAccess) {
      return createErrorResponse('Unauthorized: You do not have access to this resource', 403);
    }

    // Fetch server operations since base_version
    const { data: serverOps, error: opsError } = await supabase
      .from('collaboration_operations')
      .select('*')
      .eq('resource_type', body.resource_type)
      .eq('resource_id', body.resource_id)
      .gt('created_at', new Date(body.base_version).toISOString())
      .order('created_at', { ascending: true });

    if (opsError) {
      console.error('Error fetching operations:', opsError);
      return createErrorResponse('Failed to fetch server operations');
    }

    const serverOperations: Operation[] = (serverOps || []).map((op: any) => ({
      type: op.operation_type,
      path: op.operation_data.path,
      value: op.operation_data.value,
      oldValue: op.operation_data.oldValue,
      timestamp: new Date(op.created_at).getTime(),
      userId: op.user_id,
      vectorClock: op.vector_clock,
    }));

    // Transform local operations against server operations
    const transformedOperations: Operation[] = [];

    for (const localOp of body.operations) {
      let transformedOp = localOp;

      // Transform against each server operation
      for (const serverOp of serverOperations) {
        if (serverOp.userId !== user.id) {
          transformedOp = transformOperation(transformedOp, serverOp);
        }
      }

      transformedOperations.push(transformedOp);

      // Store transformed operation in database
      await supabase.from('collaboration_operations').insert({
        resource_type: body.resource_type,
        resource_id: body.resource_id,
        user_id: user.id,
        operation_type: transformedOp.type,
        operation_data: {
          path: transformedOp.path,
          value: transformedOp.value,
          oldValue: transformedOp.oldValue,
        },
        vector_clock: transformedOp.vectorClock,
      });
    }

    // Get current server version (latest operation timestamp)
    const currentVersion = serverOperations.length > 0
      ? Math.max(...serverOperations.map(op => op.timestamp))
      : body.base_version;

    return createSuccessResponse({
      transformed_operations: transformedOperations,
      server_operations: serverOperations,
      current_version: currentVersion,
      message: `Synced ${body.operations.length} operations`,
    });
  } catch (error) {
    console.error('Error in handleSync:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'An unknown error occurred',
      500
    );
  }
}

/**
 * Check if user has access to resource
 */
async function checkResourceAccess(
  supabase: any,
  resourceType: string,
  resourceId: string,
  userId: string
): Promise<boolean> {
  if (resourceType === 'session') {
    // Check if user owns session or is a collaborator
    const { data: session } = await supabase
      .from('free_agent_sessions')
      .select('user_id')
      .eq('id', resourceId)
      .single();

    if (session && session.user_id === userId) {
      return true;
    }

    const { data: collaborator } = await supabase
      .from('session_collaborators')
      .select('id')
      .eq('session_id', resourceId)
      .eq('user_id', userId)
      .single();

    return !!collaborator;
  } else if (resourceType === 'workflow') {
    // Check if user owns workflow or is a collaborator
    const { data: workflow } = await supabase
      .from('workflows')
      .select('user_id')
      .eq('id', resourceId)
      .single();

    if (workflow && workflow.user_id === userId) {
      return true;
    }

    const { data: collaborator } = await supabase
      .from('workflow_collaborators')
      .select('id')
      .eq('workflow_id', resourceId)
      .eq('user_id', userId)
      .single();

    return !!collaborator;
  }

  return false;
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
  return requireAuth(req, handleSync);
});
