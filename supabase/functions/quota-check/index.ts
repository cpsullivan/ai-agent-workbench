/**
 * Quota Check Endpoint
 *
 * Pre-execution quota validation to prevent over-usage
 * Checks if user/organization has remaining quota before AI API call
 *
 * @endpoint POST /quota-check
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import * as cache from '../_shared/cache.ts';

// ============================================================================
// Types
// ============================================================================

interface QuotaCheckRequest {
  user_id?: string;
  organization_id?: string;
  provider: string;
  model: string;
  estimated_tokens?: number;
  estimated_cost?: number;
}

interface QuotaCheckResponse {
  allowed: boolean;
  quota_limit: number | null;
  current_usage: number | null;
  remaining: number | null;
  quota_type: string | null;
  message?: string;
  quotas: Array<{
    type: string;
    allowed: boolean;
    limit: number;
    current: number;
    remaining: number;
    provider: string | null;
    model: string | null;
  }>;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate cost from tokens if not provided
 */
async function estimateCost(
  supabase: any,
  provider: string,
  model: string,
  estimatedTokens: number
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('cost_estimates')
      .select('input_cost_per_1k_tokens, output_cost_per_1k_tokens')
      .eq('provider', provider)
      .eq('model', model)
      .order('effective_date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      console.error('Cost estimate not found, using default');
      return 0.01; // Default estimate: $0.01
    }

    // Use average of input and output costs
    const avgCostPer1k =
      (parseFloat(data.input_cost_per_1k_tokens) +
        parseFloat(data.output_cost_per_1k_tokens)) /
      2;

    return (estimatedTokens / 1000) * avgCostPer1k;
  } catch (error) {
    console.error('Error estimating cost:', error);
    return 0.01;
  }
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

    // Only POST requests allowed
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Parse request body
    const body: QuotaCheckRequest = await req.json();

    // Validate required fields
    if (!body.provider || !body.model) {
      return new Response(
        JSON.stringify({ error: 'Provider and model are required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Get user_id and organization_id
    const userId = body.user_id || user.id;
    const organizationId = body.organization_id || user.organization_id;

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'Organization ID required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Estimate cost if not provided
    let estimatedCost = body.estimated_cost || 0;

    if (!estimatedCost && body.estimated_tokens) {
      estimatedCost = await estimateCost(
        supabase,
        body.provider,
        body.model,
        body.estimated_tokens
      );
    }

    // Default to small estimate if nothing provided
    if (estimatedCost === 0) {
      estimatedCost = 0.01; // $0.01 default
    }

    // Try to get from cache first (5-minute TTL)
    const cacheKey = cache.quotaCheckKey(organizationId, body.provider, body.model);
    let quotaData = await cache.get(cacheKey);

    if (!quotaData) {
      // Cache miss - check quota using database function
      const { data, error: quotaError } = await supabase.rpc(
        'check_quota',
        {
          p_organization_id: organizationId,
          p_provider: body.provider,
          p_model: body.model,
          p_estimated_cost: estimatedCost,
        }
      );

      if (quotaError) {
        throw new Error(`Failed to check quota: ${quotaError.message}`);
      }

      quotaData = data;

      // Cache the result for 5 minutes
      if (quotaData) {
        await cache.set(cacheKey, quotaData, cache.TTL.QUOTA_CHECK);
      }
    }

    // If no quotas defined, allow by default
    if (!quotaData || quotaData.length === 0) {
      return new Response(
        JSON.stringify({
          allowed: true,
          quota_limit: null,
          current_usage: null,
          remaining: null,
          quota_type: null,
          message: 'No quotas defined, access allowed',
          quotas: [],
        } as QuotaCheckResponse),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Process quota results
    const quotas = quotaData.map((quota: any) => ({
      type: quota.quota_type,
      allowed: quota.allowed,
      limit: parseFloat(quota.quota_limit),
      current: parseFloat(quota.current_usage),
      remaining: parseFloat(quota.remaining),
      provider: body.provider,
      model: body.model,
    }));

    // Find most restrictive quota (first one that denies)
    const deniedQuota = quotas.find((q: any) => !q.allowed);

    // Build response
    const response: QuotaCheckResponse = {
      allowed: !deniedQuota,
      quota_limit: deniedQuota
        ? deniedQuota.limit
        : quotas[0]?.limit || null,
      current_usage: deniedQuota
        ? deniedQuota.current
        : quotas[0]?.current || null,
      remaining: deniedQuota
        ? deniedQuota.remaining
        : quotas[0]?.remaining || null,
      quota_type: deniedQuota
        ? deniedQuota.type
        : quotas[0]?.type || null,
      quotas,
    };

    // Add message if denied
    if (deniedQuota) {
      response.message = `Quota exceeded for ${deniedQuota.type} limit. Current usage: $${deniedQuota.current.toFixed(
        2
      )} / $${deniedQuota.limit.toFixed(2)}`;
    }

    // Log quota violation if denied
    if (deniedQuota) {
      console.warn('Quota exceeded:', {
        user_id: userId,
        organization_id: organizationId,
        provider: body.provider,
        model: body.model,
        quota_type: deniedQuota.type,
        current_usage: deniedQuota.current,
        limit: deniedQuota.limit,
      });

      // Optional: Insert into a quota_violations table for auditing
      try {
        await supabase.from('quota_violations').insert({
          user_id: userId,
          organization_id: organizationId,
          provider: body.provider,
          model: body.model,
          quota_type: deniedQuota.type,
          attempted_cost: estimatedCost,
          current_usage: deniedQuota.current,
          quota_limit: deniedQuota.limit,
        });
      } catch (err) {
        // Don't fail request if logging fails
        console.error('Failed to log quota violation:', err);
      }
    }

    // Return response
    const statusCode = deniedQuota ? 429 : 200; // 429 Too Many Requests if quota exceeded

    return new Response(JSON.stringify(response), {
      status: statusCode,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': response.quota_limit?.toString() || 'unlimited',
        'X-RateLimit-Remaining': response.remaining?.toString() || 'unlimited',
      },
    });
  } catch (error) {
    console.error('Error in quota-check:', error);

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
