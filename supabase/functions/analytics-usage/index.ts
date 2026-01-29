/**
 * Analytics Usage Endpoint
 *
 * Fetch aggregated usage data with filtering and pagination
 * Supports date range, user, organization, provider, and model filters
 *
 * @endpoint GET /analytics-usage
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { checkPermission } from '../_shared/rbac.ts';

// ============================================================================
// Types
// ============================================================================

interface UsageQueryParams {
  start_date?: string;
  end_date?: string;
  user_id?: string;
  organization_id?: string;
  provider?: string;
  model?: string;
  session_id?: string;
  workflow_id?: string;
  page?: string;
  limit?: string;
}

interface UsageResponse {
  summary: {
    total_cost: number;
    total_tokens: number;
    total_calls: number;
    by_provider: Record<string, any>;
    by_model: Record<string, any>;
    by_day: Record<string, any>;
  };
  logs?: Array<any>;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse query parameters
 */
function parseQueryParams(url: URL): UsageQueryParams {
  const params: UsageQueryParams = {};

  if (url.searchParams.has('start_date')) {
    params.start_date = url.searchParams.get('start_date')!;
  }
  if (url.searchParams.has('end_date')) {
    params.end_date = url.searchParams.get('end_date')!;
  }
  if (url.searchParams.has('user_id')) {
    params.user_id = url.searchParams.get('user_id')!;
  }
  if (url.searchParams.has('organization_id')) {
    params.organization_id = url.searchParams.get('organization_id')!;
  }
  if (url.searchParams.has('provider')) {
    params.provider = url.searchParams.get('provider')!;
  }
  if (url.searchParams.has('model')) {
    params.model = url.searchParams.get('model')!;
  }
  if (url.searchParams.has('session_id')) {
    params.session_id = url.searchParams.get('session_id')!;
  }
  if (url.searchParams.has('workflow_id')) {
    params.workflow_id = url.searchParams.get('workflow_id')!;
  }
  if (url.searchParams.has('page')) {
    params.page = url.searchParams.get('page')!;
  }
  if (url.searchParams.has('limit')) {
    params.limit = url.searchParams.get('limit')!;
  }

  return params;
}

/**
 * Get default date range (last 30 days)
 */
function getDefaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

// ============================================================================
// Main Handler
// ============================================================================

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authResult = await authenticate(req);
    if (!authResult.success) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { user } = authResult;

    // Only GET requests allowed
    if (req.method !== 'GET') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse query parameters
    const url = new URL(req.url);
    const params = parseQueryParams(url);

    // Get organization ID (from params or user)
    const organizationId = params.organization_id || user.organization_id;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'Organization ID required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Check permissions (user must be in the organization or be an admin)
    const hasPermission = await checkPermission(
      user.id,
      organizationId,
      'analytics',
      'read'
    );

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get date range
    const defaultRange = getDefaultDateRange();
    const startDate = params.start_date || defaultRange.start;
    const endDate = params.end_date || defaultRange.end;

    // Fetch usage summary using database function
    const { data: summaryData, error: summaryError } = await supabase.rpc(
      'get_usage_summary',
      {
        p_organization_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate,
      }
    );

    if (summaryError) {
      throw new Error(`Failed to fetch summary: ${summaryError.message}`);
    }

    // Build response
    const response: UsageResponse = {
      summary: summaryData && summaryData.length > 0
        ? {
            total_cost: parseFloat(summaryData[0].total_cost || 0),
            total_tokens: parseInt(summaryData[0].total_tokens || 0),
            total_calls: parseInt(summaryData[0].total_calls || 0),
            by_provider: summaryData[0].by_provider || {},
            by_model: summaryData[0].by_model || {},
            by_day: summaryData[0].by_day || {},
          }
        : {
            total_cost: 0,
            total_tokens: 0,
            total_calls: 0,
            by_provider: {},
            by_model: {},
            by_day: {},
          },
    };

    // If pagination requested, fetch individual logs
    if (params.page || params.limit) {
      const page = parseInt(params.page || '1');
      const limit = Math.min(parseInt(params.limit || '50'), 100); // Max 100 per page
      const offset = (page - 1) * limit;

      // Build query
      let query = supabase
        .from('api_usage_logs')
        .select('*', { count: 'exact' })
        .eq('organization_id', organizationId)
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // Apply additional filters
      if (params.user_id) {
        query = query.eq('user_id', params.user_id);
      }
      if (params.provider) {
        query = query.eq('provider', params.provider);
      }
      if (params.model) {
        query = query.eq('model', params.model);
      }
      if (params.session_id) {
        query = query.eq('session_id', params.session_id);
      }
      if (params.workflow_id) {
        query = query.eq('workflow_id', params.workflow_id);
      }

      const { data: logs, error: logsError, count } = await query;

      if (logsError) {
        throw new Error(`Failed to fetch logs: ${logsError.message}`);
      }

      response.logs = logs || [];
      response.pagination = {
        page,
        limit,
        total: count || 0,
        has_more: (count || 0) > offset + limit,
      };
    }

    // Return response
    return new Response(JSON.stringify(response), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });
  } catch (error) {
    console.error('Error in analytics-usage:', error);

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
