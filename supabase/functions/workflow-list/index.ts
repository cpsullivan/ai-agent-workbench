/**
 * Workflow List API
 *
 * Lists workflows accessible to the user with filtering and pagination
 * GET /workflow-list?category=automation&status=active&page=1&limit=20
 *
 * Query Parameters:
 * - category?: string - Filter by category
 * - status?: 'draft' | 'active' | 'archived'
 * - visibility?: 'private' | 'organization' | 'public'
 * - page?: number (default: 1)
 * - limit?: number (default: 20, max: 100)
 * - search?: string - Search in name/description
 *
 * @module workflow-list
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireAuth } from '../_shared/auth.ts';
import type { AppUser } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

async function handleListWorkflows(req: Request, user: AppUser): Promise<Response> {
  try {
    const url = new URL(req.url);
    const params = url.searchParams;

    // Parse query parameters
    const category = params.get('category');
    const status = params.get('status');
    const visibility = params.get('visibility');
    const search = params.get('search');
    const page = parseInt(params.get('page') || '1', 10);
    const limit = Math.min(parseInt(params.get('limit') || '20', 10), 100);

    // Validate parameters
    if (status && !['draft', 'active', 'archived'].includes(status)) {
      return createErrorResponse('Invalid status value');
    }

    if (visibility && !['private', 'organization', 'public'].includes(visibility)) {
      return createErrorResponse('Invalid visibility value');
    }

    if (page < 1) {
      return createErrorResponse('Page must be >= 1');
    }

    if (limit < 1) {
      return createErrorResponse('Limit must be >= 1');
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Build query
    let query = supabase
      .from('workflows_list') // Use the view for enriched data
      .select('*', { count: 'exact' });

    // Apply user visibility filter (RLS will handle this, but we add explicit filter for clarity)
    query = query.or(
      `user_id.eq.${user.id},visibility.eq.public,and(visibility.eq.organization,organization_id.eq.${user.organization_id || 'null'})`
    );

    // Apply filters
    if (category) {
      query = query.eq('category', category);
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (visibility) {
      query = query.eq('visibility', visibility);
    }

    if (search) {
      // Search in name and description
      query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
    }

    // Apply pagination
    const from = (page - 1) * limit;
    const to = from + limit - 1;
    query = query.range(from, to);

    // Sort by most recently updated
    query = query.order('updated_at', { ascending: false });

    // Execute query
    const { data: workflows, error, count } = await query;

    if (error) {
      console.error('Error fetching workflows:', error);
      return createErrorResponse('Failed to fetch workflows: ' + error.message);
    }

    // Calculate pagination metadata
    const totalPages = Math.ceil((count || 0) / limit);

    return createSuccessResponse({
      workflows: workflows || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    console.error('Error in handleListWorkflows:', error);
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

  // Only allow GET
  if (req.method !== 'GET') {
    return createErrorResponse('Method not allowed', 405);
  }

  // Require authentication
  return requireAuth(req, handleListWorkflows);
});
