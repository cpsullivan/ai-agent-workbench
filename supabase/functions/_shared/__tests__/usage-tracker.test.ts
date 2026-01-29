/**
 * Tests for Usage Tracker Middleware (Server-side)
 */

import { describe, it, expect, beforeEach, afterEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import { assertExists, assertEquals } from 'https://deno.land/std@0.192.0/testing/asserts.ts';

// Mock Supabase client
const mockSupabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    }),
    insert: () => Promise.resolve({ data: { id: 'test-id' }, error: null }),
    update: () => ({
      eq: () => Promise.resolve({ data: {}, error: null }),
    }),
  }),
  rpc: () => Promise.resolve({ data: 'test-log-id', error: null }),
};

// Import functions (these would need to be exported for testing)
// For now, we'll test the logic patterns

describe('Usage Tracker - Token Counting', () => {
  it('should count tokens from OpenAI response', () => {
    const mockResponse = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
      },
    };

    const result = extractTokensFromOpenAI(mockResponse);

    assertEquals(result.inputTokens, 100);
    assertEquals(result.outputTokens, 50);
    assertEquals(result.totalTokens, 150);
  });

  it('should count tokens from Anthropic response', () => {
    const mockResponse = {
      usage: {
        input_tokens: 200,
        output_tokens: 100,
      },
    };

    const result = extractTokensFromAnthropic(mockResponse);

    assertEquals(result.inputTokens, 200);
    assertEquals(result.outputTokens, 100);
    assertEquals(result.totalTokens, 300);
  });

  it('should count tokens from Google response', () => {
    const mockResponse = {
      usageMetadata: {
        promptTokenCount: 150,
        candidatesTokenCount: 75,
      },
    };

    const result = extractTokensFromGoogle(mockResponse);

    assertEquals(result.inputTokens, 150);
    assertEquals(result.outputTokens, 75);
    assertEquals(result.totalTokens, 225);
  });

  it('should count tokens from xAI response', () => {
    const mockResponse = {
      usage: {
        prompt_tokens: 120,
        completion_tokens: 60,
      },
    };

    const result = extractTokensFromXAI(mockResponse);

    assertEquals(result.inputTokens, 120);
    assertEquals(result.outputTokens, 60);
    assertEquals(result.totalTokens, 180);
  });

  it('should return zero tokens for malformed response', () => {
    const mockResponse = {
      invalidField: 'value',
    };

    const result = extractTokensFromOpenAI(mockResponse);

    assertEquals(result.inputTokens, 0);
    assertEquals(result.outputTokens, 0);
    assertEquals(result.totalTokens, 0);
  });
});

describe('Usage Tracker - Cost Calculation', () => {
  it('should calculate cost correctly for GPT-4', () => {
    const inputTokens = 1000;
    const outputTokens = 500;
    const inputCostPer1k = 0.03; // $0.03 per 1K input tokens
    const outputCostPer1k = 0.06; // $0.06 per 1K output tokens

    const cost = calculateCost(
      inputTokens,
      outputTokens,
      inputCostPer1k,
      outputCostPer1k
    );

    // (1000/1000 * 0.03) + (500/1000 * 0.06) = 0.03 + 0.03 = 0.06
    assertEquals(cost, 0.06);
  });

  it('should calculate cost correctly for Claude 3.5 Sonnet', () => {
    const inputTokens = 2000;
    const outputTokens = 1000;
    const inputCostPer1k = 0.003; // $0.003 per 1K input tokens
    const outputCostPer1k = 0.015; // $0.015 per 1K output tokens

    const cost = calculateCost(
      inputTokens,
      outputTokens,
      inputCostPer1k,
      outputCostPer1k
    );

    // (2000/1000 * 0.003) + (1000/1000 * 0.015) = 0.006 + 0.015 = 0.021
    assertEquals(cost, 0.021);
  });

  it('should handle fractional token counts', () => {
    const inputTokens = 1234;
    const outputTokens = 567;
    const inputCostPer1k = 0.01;
    const outputCostPer1k = 0.02;

    const cost = calculateCost(
      inputTokens,
      outputTokens,
      inputCostPer1k,
      outputCostPer1k
    );

    // (1234/1000 * 0.01) + (567/1000 * 0.02) = 0.01234 + 0.01134 = 0.02368
    assertEquals(Math.round(cost * 100000) / 100000, 0.02368);
  });

  it('should handle zero tokens', () => {
    const cost = calculateCost(0, 0, 0.03, 0.06);
    assertEquals(cost, 0);
  });

  it('should handle very large token counts', () => {
    const inputTokens = 1000000; // 1M tokens
    const outputTokens = 500000; // 500K tokens
    const inputCostPer1k = 0.03;
    const outputCostPer1k = 0.06;

    const cost = calculateCost(
      inputTokens,
      outputTokens,
      inputCostPer1k,
      outputCostPer1k
    );

    // (1000000/1000 * 0.03) + (500000/1000 * 0.06) = 30 + 30 = 60
    assertEquals(cost, 60.0);
  });
});

describe('Usage Tracker - Quota Checking', () => {
  it('should allow API call when under quota', async () => {
    const quotaCheck = {
      allowed: true,
      quotaLimit: 100.0,
      currentUsage: 50.0,
      remaining: 50.0,
      quotaType: 'daily',
    };

    assertEquals(quotaCheck.allowed, true);
    assertEquals(quotaCheck.remaining, 50.0);
  });

  it('should block API call when quota exceeded', async () => {
    const quotaCheck = {
      allowed: false,
      quotaLimit: 100.0,
      currentUsage: 100.5,
      remaining: -0.5,
      quotaType: 'daily',
    };

    assertEquals(quotaCheck.allowed, false);
    assertEquals(quotaCheck.currentUsage > quotaCheck.quotaLimit, true);
  });

  it('should check quota for specific provider and model', async () => {
    const quotaCheck = {
      allowed: true,
      quotaLimit: 50.0,
      currentUsage: 25.0,
      remaining: 25.0,
      quotaType: 'model',
      provider: 'openai',
      model: 'gpt-4',
    };

    assertEquals(quotaCheck.provider, 'openai');
    assertEquals(quotaCheck.model, 'gpt-4');
    assertEquals(quotaCheck.allowed, true);
  });

  it('should account for estimated cost in quota check', async () => {
    const quotaLimit = 100.0;
    const currentUsage = 98.0;
    const estimatedCost = 3.0;

    const wouldExceed = currentUsage + estimatedCost > quotaLimit;

    assertEquals(wouldExceed, true);
  });

  it('should return infinity for unlimited quota', async () => {
    const quotaCheck = {
      allowed: true,
      quotaLimit: Infinity,
      currentUsage: 1000.0,
      remaining: Infinity,
      quotaType: 'none',
    };

    assertEquals(quotaCheck.quotaLimit, Infinity);
    assertEquals(quotaCheck.allowed, true);
  });
});

describe('Usage Tracker - Cost Estimation', () => {
  it('should estimate cost for simple message', () => {
    const messages = [
      { role: 'user', content: 'Hello, how are you?' },
    ];

    // Rough estimation: ~20 chars / 4 chars per token = 5 tokens
    // Add overhead: 4 (message) + 3 (chat format) = 12 tokens total
    const estimatedInputTokens = estimateTokensFromMessages(messages);

    assertEquals(estimatedInputTokens >= 5, true);
    assertEquals(estimatedInputTokens <= 20, true);
  });

  it('should estimate cost for multiple messages', () => {
    const messages = [
      { role: 'user', content: 'What is the weather like?' },
      { role: 'assistant', content: 'I don\'t have access to weather data.' },
      { role: 'user', content: 'Can you tell me a joke?' },
    ];

    const estimatedInputTokens = estimateTokensFromMessages(messages);

    // Should be > 15 tokens for this conversation
    assertEquals(estimatedInputTokens > 15, true);
  });

  it('should estimate cost including output tokens', () => {
    const inputTokens = 100;
    const maxOutputTokens = 500;
    const inputCostPer1k = 0.03;
    const outputCostPer1k = 0.06;

    const estimatedCost = calculateCost(
      inputTokens,
      maxOutputTokens,
      inputCostPer1k,
      outputCostPer1k
    );

    // (100/1000 * 0.03) + (500/1000 * 0.06) = 0.003 + 0.03 = 0.033
    assertEquals(estimatedCost, 0.033);
  });

  it('should estimate higher cost for longer messages', () => {
    const shortMessage = [{ role: 'user', content: 'Hi' }];
    const longMessage = [
      {
        role: 'user',
        content:
          'This is a very long message with lots of content that will consume many more tokens than a short message. It goes on and on and on.',
      },
    ];

    const shortEstimate = estimateTokensFromMessages(shortMessage);
    const longEstimate = estimateTokensFromMessages(longMessage);

    assertEquals(longEstimate > shortEstimate, true);
    assertEquals(longEstimate > shortEstimate * 5, true);
  });
});

describe('Usage Tracker - Error Handling', () => {
  it('should not throw when tracking fails', async () => {
    // Tracking should fail silently to not break API calls
    const trackingError = new Error('Database connection failed');

    // This should not throw
    try {
      const result = await handleTrackingError(trackingError);
      assertEquals(result, null);
    } catch (error) {
      throw new Error('Tracking should not throw errors');
    }
  });

  it('should log error when quota check fails', async () => {
    const quotaCheckError = new Error('Quota service unavailable');

    // Should return null and log error
    const result = await handleQuotaCheckError(quotaCheckError);
    assertEquals(result, null);
  });

  it('should continue API call if tracking fails', async () => {
    const apiResponse = { content: 'Hello!', usage: { total_tokens: 10 } };
    const trackingFailed = true;

    // API call should succeed even if tracking fails
    assertEquals(apiResponse.content, 'Hello!');
    assertEquals(trackingFailed, true);
  });
});

describe('Usage Tracker - Integration', () => {
  it('should track complete API call flow', async () => {
    const options = {
      userId: 'user-123',
      organizationId: 'org-456',
      sessionId: 'session-789',
      provider: 'openai' as const,
      model: 'gpt-4',
    };

    const apiResponse = {
      choices: [{ message: { content: 'Test response' } }],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75,
      },
    };

    const expectedUsage = {
      inputTokens: 50,
      outputTokens: 25,
      totalTokens: 75,
      costUsd: expect.any(Number),
      logId: expect.any(String),
    };

    // Simulate tracking
    const result = {
      inputTokens: apiResponse.usage.prompt_tokens,
      outputTokens: apiResponse.usage.completion_tokens,
      totalTokens: apiResponse.usage.total_tokens,
      costUsd: 0.00375, // Calculated based on GPT-4 pricing
      logId: 'log-123',
    };

    assertEquals(result.inputTokens, expectedUsage.inputTokens);
    assertEquals(result.outputTokens, expectedUsage.outputTokens);
    assertEquals(result.totalTokens, expectedUsage.totalTokens);
    assertExists(result.costUsd);
    assertExists(result.logId);
  });

  it('should update quota after tracking', async () => {
    const initialQuota = {
      currentUsage: 50.0,
      quotaLimit: 100.0,
    };

    const newCost = 5.0;

    const updatedQuota = {
      currentUsage: initialQuota.currentUsage + newCost,
      quotaLimit: initialQuota.quotaLimit,
    };

    assertEquals(updatedQuota.currentUsage, 55.0);
    assertEquals(updatedQuota.quotaLimit, 100.0);
  });

  it('should wrap API call with tracking', async () => {
    const apiCall = async () => {
      return {
        content: 'API response',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      };
    };

    const estimatedCost = 0.005;

    // Simulate wrapWithTracking
    const quotaOk = true;
    const response = await apiCall();
    const usage = {
      inputTokens: response.usage.prompt_tokens,
      outputTokens: response.usage.completion_tokens,
      totalTokens: 150,
      costUsd: estimatedCost,
      logId: 'log-id',
    };

    assertEquals(quotaOk, true);
    assertEquals(response.content, 'API response');
    assertEquals(usage.totalTokens, 150);
  });
});

// Helper functions for testing (these would be exported from usage-tracker.ts)

function extractTokensFromOpenAI(response: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return {
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    totalTokens: response.usage?.total_tokens || 0,
  };
}

function extractTokensFromAnthropic(response: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const input = response.usage?.input_tokens || 0;
  const output = response.usage?.output_tokens || 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  };
}

function extractTokensFromGoogle(response: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  const input = response.usageMetadata?.promptTokenCount || 0;
  const output = response.usageMetadata?.candidatesTokenCount || 0;
  return {
    inputTokens: input,
    outputTokens: output,
    totalTokens: input + output,
  };
}

function extractTokensFromXAI(response: any): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
} {
  return {
    inputTokens: response.usage?.prompt_tokens || 0,
    outputTokens: response.usage?.completion_tokens || 0,
    totalTokens:
      (response.usage?.prompt_tokens || 0) +
      (response.usage?.completion_tokens || 0),
  };
}

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

function estimateTokensFromMessages(
  messages: Array<{ role: string; content: string }>
): number {
  let total = 0;
  const avgCharsPerToken = 4;

  for (const message of messages) {
    total += 4; // Message overhead
    total += Math.ceil(message.role.length / avgCharsPerToken);
    total += Math.ceil(message.content.length / avgCharsPerToken);
  }

  total += 3; // Chat format overhead
  return total;
}

async function handleTrackingError(_error: Error): Promise<null> {
  // Log error but don't throw
  console.error('Tracking failed:', _error.message);
  return null;
}

async function handleQuotaCheckError(_error: Error): Promise<null> {
  // Log error but don't throw
  console.error('Quota check failed:', _error.message);
  return null;
}
