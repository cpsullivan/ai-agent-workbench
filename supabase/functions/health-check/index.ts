/**
 * Health Check Edge Function
 *
 * Provides a simple health check endpoint to verify edge functions are deployed
 * and responding correctly. Used by CI/CD deployment workflows.
 *
 * GET /health-check
 * Response: { status: "healthy", timestamp: ISO8601, version: string }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  checks: {
    database?: 'ok' | 'error';
    redis?: 'ok' | 'error';
    supabase?: 'ok' | 'error';
  };
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const checks: HealthCheckResponse['checks'] = {};
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check Supabase connection (if SUPABASE_URL is available)
    if (Deno.env.get('SUPABASE_URL')) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const response = await fetch(`${supabaseUrl}/rest/v1/`, {
          method: 'HEAD',
          headers: {
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
        });

        checks.supabase = response.ok ? 'ok' : 'error';
        if (!response.ok) {
          overallStatus = 'degraded';
        }
      } catch (_error) {
        checks.supabase = 'error';
        overallStatus = 'degraded';
      }
    }

    // Check Redis connection (if UPSTASH_REDIS_REST_URL is available)
    if (Deno.env.get('UPSTASH_REDIS_REST_URL')) {
      try {
        const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
        const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');

        const response = await fetch(`${redisUrl}/ping`, {
          headers: {
            'Authorization': `Bearer ${redisToken}`,
          },
        });

        const data = await response.json();
        checks.redis = data.result === 'PONG' ? 'ok' : 'error';
        if (data.result !== 'PONG') {
          overallStatus = 'degraded';
        }
      } catch (_error) {
        checks.redis = 'error';
        overallStatus = 'degraded';
      }
    }

    // Build response
    const healthResponse: HealthCheckResponse = {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      version: Deno.env.get('APP_VERSION') || '1.0.0',
      checks,
    };

    return new Response(
      JSON.stringify(healthResponse),
      {
        status: overallStatus === 'healthy' ? 200 : 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      }
    );
  } catch (error) {
    console.error('Health check error:', error);

    const errorResponse: HealthCheckResponse = {
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: Deno.env.get('APP_VERSION') || '1.0.0',
      checks: {},
    };

    return new Response(
      JSON.stringify(errorResponse),
      {
        status: 503,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
