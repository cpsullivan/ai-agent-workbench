/**
 * Usage Tracker Middleware
 *
 * ⭐ CRITICAL: This middleware wraps ALL AI API calls to track usage and costs
 *
 * Features:
 * - Automatic token counting for all providers
 * - Cost calculation based on model pricing
 * - Real-time quota checking and enforcement
 * - Error handling without failing execution
 * - Support for OpenAI, Anthropic, Google, xAI
 *
 * @module usage-tracker
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
 * Estimate token count for text
 *
 * This is a rough estimation. For production, use provider-specific tokenizers:
 * - OpenAI: tiktoken
 * - Anthropic: @anthropic-ai/tokenizer
 * - Google: @google/generative-ai tokenizer
 * - xAI: Estimate or use API response
 */
function estimateTokens(text: string): number {
  // Rough estimation: ~4 characters per token on average
  // This varies by language and content type
  const avgCharsPerToken = 4;
  return Math.ceil(text.length / avgCharsPerToken);
}

/**
 * Count tokens in messages array (for chat completions)
 */
function countMessagesTokens(messages: Array<{ role: string; content: string }>): number {
  let total = 0;

  for (const message of messages) {
    // Account for message formatting overhead (~4 tokens per message)
    total += 4;
    total += estimateTokens(message.role);
    total += estimateTokens(message.content);
  }

  // Add overhead for chat format
  total += 3;

  return total;
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
        // OpenAI returns usage object
        return {
          inputTokens: response.usage?.prompt_tokens || 0,
          outputTokens: response.usage?.completion_tokens || 0,
        };

      case 'anthropic':
        // Anthropic Claude returns usage object
        return {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        };

      case 'google':
        // Google Gemini returns usageMetadata
        return {
          inputTokens: response.usageMetadata?.promptTokenCount || 0,
          outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
        };

      case 'xai':
        // xAI Grok (similar to OpenAI format)
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

// ============================================================================
// Cost Calculation
// ============================================================================

/**
 * Get cost estimates for a model from the database
 */
async function getCostEstimate(
  supabaseClient: any,
  provider: string,
  model: string
): Promise<{ inputCost: number; outputCost: number } | null> {
  try {
    const { data, error } = await supabaseClient
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
// Quota Management
// ============================================================================

/**
 * Check if organization has sufficient quota
 */
export async function checkQuota(
  supabaseUrl: string,
  supabaseKey: string,
  organizationId: string,
  provider: string,
  model: string,
  estimatedCost: number = 0.0
): Promise<QuotaCheckResult | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data, error } = await supabase.rpc('check_quota', {
      p_organization_id: organizationId,
      p_provider: provider,
      p_model: model,
      p_estimated_cost: estimatedCost,
    });

    if (error) {
      console.error('Error checking quota:', error);
      return null;
    }

    if (!data || data.length === 0) {
      // No quota defined, allow by default
      return {
        allowed: true,
        quotaLimit: Infinity,
        currentUsage: 0,
        remaining: Infinity,
        quotaType: 'none',
      };
    }

    // Return first (most restrictive) quota
    return data[0];
  } catch (error) {
    console.error('Error in checkQuota:', error);
    return null;
  }
}

// ============================================================================
// Usage Logging
// ============================================================================

/**
 * Log API usage to database
 */
export async function logUsage(
  supabaseUrl: string,
  supabaseKey: string,
  options: UsageTrackingOptions,
  inputTokens: number,
  outputTokens: number,
  costUsd: number,
  responseData?: Record<string, unknown>
): Promise<string | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

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

// ============================================================================
// Main Tracking Function
// ============================================================================

/**
 * Track AI API usage
 *
 * This function should be called AFTER the AI API call completes
 * to log usage and update quotas.
 *
 * @example
 * ```typescript
 * const response = await openai.chat.completions.create({ ... });
 *
 * await trackUsage(
 *   supabaseUrl,
 *   supabaseKey,
 *   {
 *     userId: 'user-123',
 *     organizationId: 'org-456',
 *     sessionId: 'session-789',
 *     provider: 'openai',
 *     model: 'gpt-4',
 *   },
 *   response
 * );
 * ```
 */
export async function trackUsage(
  supabaseUrl: string,
  supabaseKey: string,
  options: UsageTrackingOptions,
  apiResponse: any
): Promise<UsageResult | null> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract token counts from response
    const { inputTokens, outputTokens } = extractTokensFromResponse(
      options.provider,
      apiResponse
    );

    // Get cost estimate
    const costEstimate = await getCostEstimate(
      supabase,
      options.provider,
      options.model
    );

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
      supabaseUrl,
      supabaseKey,
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
    // IMPORTANT: Don't throw error, just log it
    // We don't want usage tracking failures to break API calls
    console.error('Error tracking usage:', error);
    return null;
  }
}

/**
 * Estimate cost for a request before execution
 *
 * Useful for quota checking before making the API call
 */
export async function estimateCost(
  supabaseUrl: string,
  supabaseKey: string,
  provider: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  maxOutputTokens: number = 1000
): Promise<number> {
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Estimate input tokens
    const inputTokens = countMessagesTokens(messages);

    // Get cost estimate
    const costEstimate = await getCostEstimate(supabase, provider, model);

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
// Wrapper Functions for Common Use Cases
// ============================================================================

/**
 * Wrap an AI API call with quota checking and usage tracking
 *
 * @example
 * ```typescript
 * const result = await wrapWithTracking(
 *   supabaseUrl,
 *   supabaseKey,
 *   {
 *     userId: 'user-123',
 *     organizationId: 'org-456',
 *     provider: 'openai',
 *     model: 'gpt-4',
 *   },
 *   async () => {
 *     return await openai.chat.completions.create({ ... });
 *   }
 * );
 * ```
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
    const usage = await trackUsage(
      supabaseUrl,
      supabaseKey,
      options,
      response
    );

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
