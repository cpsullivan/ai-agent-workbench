/**
 * Usage Tracker Client
 *
 * Client-side wrapper for usage tracking functionality
 * Calls server-side endpoints and provides the same interface
 *
 * @module usageTracker
 */

import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

export interface UsageTrackingOptions {
  userId: string;
  organizationId: string;
  sessionId?: string;
  workflowId?: string;
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
  requestData?: Record<string, unknown>;
}

export interface UsageResult {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  logId: string;
}

export interface QuotaCheckResult {
  allowed: boolean;
  quotaLimit: number;
  currentUsage: number;
  remaining: number;
  quotaType: string;
}

// ============================================================================
// Token Counting (Estimation)
// ============================================================================

/**
 * Estimate token count for text (client-side)
 * Rough estimation: ~4 characters per token on average
 */
function estimateTokens(text: string): number {
  const avgCharsPerToken = 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Count tokens in messages array
 */
function countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const message of messages) {
    total += 4; // Message formatting overhead
    total += estimateTokens(message.role);
    total += estimateTokens(message.content);
  }

  total += 3; // Chat format overhead
  return total;
}

// ============================================================================
// Quota Management
// ============================================================================

/**
 * Check if organization has sufficient quota
 *
 * Calls the quota-check endpoint
 */
export async function checkQuota(
  _supabaseUrl: string,
  _supabaseKey: string,
  organizationId: string,
  provider: string,
  model: string,
  estimatedCost: number = 0.0
): Promise<QuotaCheckResult | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      console.error('No session found');
      return null;
    }

    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/quota-check`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organization_id: organizationId,
          provider,
          model,
          estimated_cost: estimatedCost,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        // Quota exceeded
        const data = await response.json();
        return {
          allowed: false,
          quotaLimit: data.quota_limit || 0,
          currentUsage: data.current_usage || 0,
          remaining: data.remaining || 0,
          quotaType: data.quota_type || 'unknown',
        };
      }
      throw new Error(`Quota check failed: ${response.statusText}`);
    }

    const data = await response.json();

    return {
      allowed: data.allowed,
      quotaLimit: data.quota_limit || Infinity,
      currentUsage: data.current_usage || 0,
      remaining: data.remaining || Infinity,
      quotaType: data.quota_type || 'none',
    };
  } catch (error) {
    console.error('Error checking quota:', error);
    return null;
  }
}

// ============================================================================
// Usage Logging
// ============================================================================

/**
 * Log API usage to database
 *
 * Uses the database RPC function directly via Supabase client
 */
export async function logUsage(
  _supabaseUrl: string,
  _supabaseKey: string,
  options: UsageTrackingOptions,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  responseData?: Record<string, unknown>
): Promise<string | null> {
  try {
    const { data: logId, error } = await supabase.rpc('log_api_usage', {
      p_user_id: options.userId,
      p_organization_id: options.organizationId,
      p_session_id: options.sessionId || null,
      p_workflow_id: options.workflowId || null,
      p_provider: options.provider,
      p_model: options.model,
      p_input_tokens: inputTokens,
      p_output_tokens: outputTokens,
      p_cost_usd: costUsd,
      p_request_data: options.requestData || {},
      p_response_data: responseData || {},
    });

    if (error) {
      console.error('Error logging usage:', error);
      return null;
    }

    return logId;
  } catch (error) {
    console.error('Error in logUsage:', error);
    return null;
  }
}

/**
 * Extract token counts from API response
 */
function extractTokensFromResponse(
  provider: string,
  response: any
): { inputTokens: number; outputTokens: number } {
  try {
    switch (provider) {
      case 'openai':
        return {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        };

      case 'anthropic':
        return {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        };

      case 'google':
        return {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        };

      case 'xai':
        return {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        };

      default:
        return { inputTokens: 0, outputTokens: 0 };
    }
  } catch (error) {
    console.error('Error extracting tokens from response:', error);
    return { inputTokens: 0, outputTokens: 0 };
  }
}

/**
 * Get cost estimate from database
 */
async function getCostEstimate(
  provider: string,
  model: string
): Promise<{ inputCost: number; outputCost: number } | null> {
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
      console.error(`Cost estimate not found for ${provider}/${model}:`, error);
      return null;
    }

    return {
      inputCost: parseFloat(data.input_cost_per_1k_tokens),
      outputCost: parseFloat(data.output_cost_per_1k_tokens),
    };
  } catch (error) {
    console.error('Error fetching cost estimate:', error);
    return null;
  }
}

/**
 * Calculate cost based on tokens and pricing
 */
function calculateCost(
  inputTokens: number,
  outputTokens: number,
  inputCostPer1k: number,
  outputCostPer1k: number
): number {
  const inputCost = (inputTokens / 1000) * inputCostPer1k;
  const outputCost = (outputTokens / 1000) * outputCostPer1k;
  return inputCost + outputCost;
}

// ============================================================================
// Main Tracking Function
// ============================================================================

/**
 * Track AI API usage
 *
 * Call this AFTER the AI API call completes to log usage and update quotas
 */
export async function trackUsage(
  _supabaseUrl: string,
  _supabaseKey: string,
  options: UsageTrackingOptions,
  apiResponse: any
): Promise<UsageResult | null> {
  try {
    // Extract token counts from response
    const { inputTokens, outputTokens } = extractTokensFromResponse(
      options.provider,
      apiResponse
    );

    // Get cost estimate
    const costEstimate = await getCostEstimate(options.provider, options.model);

    if (!costEstimate) {
      console.error('Cost estimate not found, skipping usage tracking');
      return null;
    }

    // Calculate cost
    const costUsd = calculateCost(
      inputTokens,
      outputTokens,
      costEstimate.inputCost,
      costEstimate.outputCost
    );

    // Log usage
    const logId = await logUsage(
      _supabaseUrl,
      _supabaseKey,
      options,
      inputTokens,
      outputTokens,
      costUsd,
      {
        model: options.model,
        provider: options.provider,
        timestamp: new Date().toISOString(),
      }
    );

    if (!logId) {
      console.error('Failed to log usage');
      return null;
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd,
      logId,
    };
  } catch (error) {
    // Don't throw - we don't want tracking failures to break API calls
    console.error('Error tracking usage:', error);
    return null;
  }
}

/**
 * Estimate cost before execution
 */
export async function estimateCost(
  _supabaseUrl: string,
  _supabaseKey: string,
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxOutputTokens: number = 1000
): Promise<number> {
  try {
    // Estimate input tokens
    const inputTokens = countMessagesTokens(messages);

    // Get cost estimate
    const costEstimate = await getCostEstimate(provider, model);

    if (!costEstimate) {
      console.error('Cost estimate not found');
      return 0;
    }

    // Calculate estimated cost
    return calculateCost(
      inputTokens,
      maxOutputTokens,
      costEstimate.inputCost,
      costEstimate.outputCost
    );
  } catch (error) {
    console.error('Error estimating cost:', error);
    return 0;
  }
}

// ============================================================================
// Wrapper Function
// ============================================================================

/**
 * Wrap an AI API call with quota checking and usage tracking
 */
export async function wrapWithTracking<T>(
  supabaseUrl: string,
  supabaseKey: string,
  options: UsageTrackingOptions,
  apiCall: () => Promise<T>,
  estimatedCost?: number
): Promise<{ response: T; usage: UsageResult | null; quotaExceeded: boolean }> {
  try {
    // Check quota before execution
    const quotaCheck = await checkQuota(
      supabaseUrl,
      supabaseKey,
      options.organizationId,
      options.provider,
      options.model,
      estimatedCost || 0
    );

    if (quotaCheck && !quotaCheck.allowed) {
      console.warn('Quota exceeded, blocking API call');
      return {
        response: null as T,
        usage: null,
        quotaExceeded: true,
      };
    }

    // Execute API call
    const response = await apiCall();

    // Track usage
    const usage = await trackUsage(supabaseUrl, supabaseKey, options, response);

    return {
      response,
      usage,
      quotaExceeded: false,
    };
  } catch (error) {
    console.error('Error in wrapWithTracking:', error);
    throw error;
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  trackUsage,
  checkQuota,
  logUsage,
  estimateCost,
  wrapWithTracking,
};
