# Usage Tracking Integration Guide

**Phase 2.2: Cost Tracking System**

This guide explains how to integrate AI API usage tracking into your codebase to automatically log costs, enforce quotas, and provide analytics.

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Integration Patterns](#integration-patterns)
4. [API Reference](#api-reference)
5. [Examples](#examples)
6. [Testing](#testing)
7. [Troubleshooting](#troubleshooting)

---

## Overview

The usage tracking system automatically:
- **Tracks Tokens**: Counts input and output tokens from AI API responses
- **Calculates Costs**: Uses pricing data from `cost_estimates` table
- **Enforces Quotas**: Blocks API calls if quota is exceeded
- **Logs Usage**: Stores all calls in `api_usage_logs` table
- **Updates Quotas**: Real-time quota tracking in `usage_quotas` table

### Supported Providers

- **OpenAI** (GPT-4, GPT-3.5, etc.)
- **Anthropic** (Claude 3.5 Sonnet, Claude 3 Opus, etc.)
- **Google** (Gemini Pro, Gemini Flash)
- **xAI** (Grok)

---

## Quick Start

### 1. Import the Usage Tracker

```typescript
import { executeWithTracking } from '@/lib/aiModelExecutor';
```

### 2. Wrap Your AI API Call

```typescript
const response = await executeWithTracking(
  {
    provider: 'openai',
    model: 'gpt-4',
    messages: [{ role: 'user', content: 'Hello!' }],
    temperature: 0.7,
    maxTokens: 1000,
  },
  {
    userId: user.id,
    organizationId: user.organization_id,
    sessionId: session.id, // Optional
  }
);

console.log('Cost:', response.cost);
console.log('Tokens:', response.usage.totalTokens);
```

### 3. Handle Quota Exceeded

```typescript
try {
  const response = await executeWithTracking(...);
} catch (error) {
  if (error.message.includes('Quota exceeded')) {
    // Show user-friendly message
    alert('Usage quota exceeded. Please upgrade your plan.');
  }
}
```

---

## Integration Patterns

### Pattern 1: Automatic Tracking (Recommended)

Use `wrapWithTracking()` for automatic quota checking and usage logging:

```typescript
import { wrapWithTracking, estimateCost } from '@/lib/usageTracker';

async function callAI(request, context) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Estimate cost for quota check
  const estimated = await estimateCost(
    supabaseUrl,
    supabaseKey,
    request.provider,
    request.model,
    request.messages,
    request.maxTokens
  );

  // Wrap API call with tracking
  const result = await wrapWithTracking(
    supabaseUrl,
    supabaseKey,
    {
      userId: context.userId,
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      provider: request.provider,
      model: request.model,
    },
    async () => {
      // Your actual AI API call here
      return await yourAIProviderCall(request);
    },
    estimated
  );

  if (result.quotaExceeded) {
    throw new Error('Quota exceeded');
  }

  return result.response;
}
```

**Pros:**
- Automatic quota checking
- Automatic usage logging
- Clean error handling

**Use When:**
- Starting new integrations
- Want minimal boilerplate
- Need quota enforcement

### Pattern 2: Manual Tracking

Use individual functions for more control:

```typescript
import { checkQuota, trackUsage } from '@/lib/usageTracker';

async function callAI(request, context) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Step 1: Check quota
  const quotaCheck = await checkQuota(
    supabaseUrl,
    supabaseKey,
    context.organizationId,
    request.provider,
    request.model,
    0.01 // Estimated cost
  );

  if (quotaCheck && !quotaCheck.allowed) {
    throw new Error('Quota exceeded');
  }

  // Step 2: Make API call
  const apiResponse = await yourAIProviderCall(request);

  // Step 3: Track usage
  await trackUsage(
    supabaseUrl,
    supabaseKey,
    {
      userId: context.userId,
      organizationId: context.organizationId,
      sessionId: context.sessionId,
      provider: request.provider,
      model: request.model,
    },
    apiResponse
  );

  return apiResponse;
}
```

**Pros:**
- Full control over flow
- Can customize logging
- Can handle failures separately

**Use When:**
- Need custom error handling
- Want to log additional metadata
- Integrating with existing error handling

---

## API Reference

### `executeWithTracking(request, context)`

High-level function for AI model execution with automatic tracking.

**Parameters:**
- `request: AIModelRequest`
  - `provider`: 'openai' | 'anthropic' | 'google' | 'xai'
  - `model`: string (e.g., 'gpt-4', 'claude-3-5-sonnet-20241022')
  - `messages`: Array<{ role: string; content: string }>
  - `temperature?`: number
  - `maxTokens?`: number
  - `stream?`: boolean

- `context: ExecutionContext`
  - `userId`: string
  - `organizationId`: string
  - `sessionId?`: string
  - `workflowId?`: string

**Returns:** `Promise<AIModelResponse>`
- `content`: string
- `usage`: { inputTokens, outputTokens, totalTokens }
- `cost`: number
- `model`: string
- `provider`: string

**Throws:**
- `Error('Quota exceeded')` if quota limit reached
- `Error('OpenAI integration not yet implemented')` etc.

### `trackUsage(supabaseUrl, supabaseKey, options, apiResponse)`

Track usage after an AI API call completes.

**Parameters:**
- `supabaseUrl`: string
- `supabaseKey`: string
- `options: UsageTrackingOptions`
  - `userId`: string
  - `organizationId`: string
  - `sessionId?`: string
  - `workflowId?`: string
  - `provider`: 'openai' | 'anthropic' | 'google' | 'xai'
  - `model`: string
- `apiResponse`: any (raw API response from provider)

**Returns:** `Promise<UsageResult | null>`
- `inputTokens`: number
- `outputTokens`: number
- `totalTokens`: number
- `costUsd`: number
- `logId`: string

### `checkQuota(supabaseUrl, supabaseKey, organizationId, provider, model, estimatedCost)`

Check if organization has sufficient quota before making a call.

**Parameters:**
- `supabaseUrl`: string
- `supabaseKey`: string
- `organizationId`: string
- `provider`: string
- `model`: string
- `estimatedCost`: number (in USD)

**Returns:** `Promise<QuotaCheckResult | null>`
- `allowed`: boolean
- `quotaLimit`: number
- `currentUsage`: number
- `remaining`: number
- `quotaType`: string

### `estimateCost(supabaseUrl, supabaseKey, provider, model, messages, maxOutputTokens)`

Estimate the cost of an AI call before execution.

**Parameters:**
- `supabaseUrl`: string
- `supabaseKey`: string
- `provider`: string
- `model`: string
- `messages`: Array<{ role: string; content: string }>
- `maxOutputTokens`: number (default: 1000)

**Returns:** `Promise<number>` (estimated cost in USD)

---

## Examples

### Example 1: Integrate into `useFreeAgentSession.executeAgent()`

Replace the placeholder in `src/hooks/useFreeAgentSession.ts`:

```typescript
import { executeWithTracking } from '@/lib/aiModelExecutor';

const executeAgent = useCallback(
  async (options?: AgentExecutionOptions): Promise<void> => {
    if (!session || !sessionState || !user) {
      setError('No active session');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build messages from session history
      const messages = sessionState.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // Execute AI model with automatic usage tracking
      const response = await executeWithTracking(
        {
          provider: 'openai', // or extract from session.model
          model: session.model || 'gpt-4',
          messages,
          temperature: options?.temperature || 0.7,
          maxTokens: options?.maxSteps || 1000,
        },
        {
          userId: user.id,
          organizationId: user.organization_id,
          sessionId: session.id,
        }
      );

      // Add AI response to session
      await addMessage('assistant', response.content);

      // Optional: Show cost to user
      console.log('AI call cost: $' + response.cost.toFixed(6));
      console.log('Tokens used:', response.usage.totalTokens);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Agent execution failed';
      setError(errorMsg);

      // Handle quota exceeded
      if (errorMsg.includes('Quota exceeded')) {
        setError('Usage quota exceeded. Please contact your administrator.');
      }
    } finally {
      setIsLoading(false);
    }
  },
  [session, sessionState, user, addMessage]
);
```

### Example 2: Integrate into Workflow Node Execution

For workflow nodes that call AI models:

```typescript
import { executeWithTracking } from '@/lib/aiModelExecutor';

async function executeAINode(
  node: WorkflowNode,
  context: WorkflowExecutionContext
): Promise<WorkflowNodeResult> {
  try {
    const response = await executeWithTracking(
      {
        provider: node.config.provider,
        model: node.config.model,
        messages: node.config.messages,
        temperature: node.config.temperature,
        maxTokens: node.config.maxTokens,
      },
      {
        userId: context.userId,
        organizationId: context.organizationId,
        workflowId: context.workflowId,
      }
    );

    return {
      success: true,
      output: response.content,
      metadata: {
        cost: response.cost,
        tokens: response.usage.totalTokens,
        model: response.model,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### Example 3: Show Quota Status to User

Display remaining quota in UI:

```typescript
import { getQuotaStatus } from '@/lib/aiModelExecutor';

function QuotaIndicator({ organizationId }: { organizationId: string }) {
  const [quota, setQuota] = useState<any>(null);

  useEffect(() => {
    async function fetchQuota() {
      const status = await getQuotaStatus(organizationId);
      setQuota(status);
    }

    fetchQuota();
    const interval = setInterval(fetchQuota, 60000); // Refresh every minute

    return () => clearInterval(interval);
  }, [organizationId]);

  if (!quota || !quota.allowed) return null;

  const percentage = (quota.currentUsage / quota.quotaLimit) * 100;

  return (
    <div className="quota-indicator">
      <div className="quota-bar">
        <div
          className="quota-fill"
          style={{
            width: `${percentage}%`,
            backgroundColor: percentage > 90 ? 'red' : percentage > 75 ? 'yellow' : 'green',
          }}
        />
      </div>
      <span>
        ${quota.currentUsage.toFixed(2)} / ${quota.quotaLimit.toFixed(2)} used
      </span>
    </div>
  );
}
```

---

## Testing

### Unit Tests

Test usage tracking in isolation:

```typescript
import { trackUsage, checkQuota, estimateCost } from '@/lib/usageTracker';

describe('trackUsage', () => {
  it('should log usage to database', async () => {
    const mockResponse = {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
      },
    };

    const result = await trackUsage(
      'mock-url',
      'mock-key',
      {
        userId: 'user-1',
        organizationId: 'org-1',
        provider: 'openai',
        model: 'gpt-4',
      },
      mockResponse
    );

    expect(result).toBeDefined();
    expect(result?.inputTokens).toBe(100);
    expect(result?.outputTokens).toBe(50);
    expect(result?.costUsd).toBeGreaterThan(0);
  });
});
```

### Integration Tests

Test quota enforcement:

```typescript
describe('Quota Enforcement', () => {
  it('should block API call when quota exceeded', async () => {
    // Set quota to $1.00
    await supabase.from('usage_quotas').insert({
      organization_id: 'org-1',
      quota_type: 'daily',
      quota_limit: 1.00,
      current_usage: 0.99,
      reset_at: new Date(Date.now() + 86400000).toISOString(),
    });

    // Try to make expensive API call ($0.05)
    await expect(
      executeWithTracking(
        {
          provider: 'openai',
          model: 'gpt-4',
          messages: [{ role: 'user', content: 'Long message...' }],
          maxTokens: 1000,
        },
        {
          userId: 'user-1',
          organizationId: 'org-1',
        }
      )
    ).rejects.toThrow('Quota exceeded');
  });
});
```

---

## Troubleshooting

### Issue: Usage not being logged

**Symptoms:** API calls work but no data in `api_usage_logs`

**Solutions:**
1. Check that `trackUsage()` is being called after API response
2. Verify `cost_estimates` table has pricing for your model
3. Check browser console for errors
4. Verify RLS policies allow insert

### Issue: Quota always shows as exceeded

**Symptoms:** All API calls blocked even with available quota

**Solutions:**
1. Check `usage_quotas.reset_at` is in the future
2. Verify `current_usage` hasn't exceeded `quota_limit`
3. Check that organization_id matches
4. Run `SELECT * FROM check_quota('org-id', 'provider', 'model', 0.01)` to debug

### Issue: Cost calculations seem wrong

**Symptoms:** Costs don't match provider pricing

**Solutions:**
1. Verify `cost_estimates` table has latest pricing
2. Check token counts from API responses
3. Ensure correct provider/model names
4. Run manual calculation: `(inputTokens/1000) * inputCost + (outputTokens/1000) * outputCost`

### Issue: Tracking slows down API calls

**Symptoms:** API responses take longer than expected

**Solutions:**
1. Use `wrapWithTracking()` for async tracking
2. Don't await `trackUsage()` if you don't need the result
3. Ensure database has proper indexes
4. Consider batching logs for high-frequency calls

---

## Best Practices

### 1. Always Check Quota Before Expensive Calls

```typescript
// Good: Check quota before expensive call
const quotaCheck = await checkQuota(...);
if (!quotaCheck.allowed) {
  return { error: 'Quota exceeded' };
}

// Make expensive call
const response = await callExpensiveAI(...);
```

### 2. Show Cost to Users

```typescript
// Show cost after each AI interaction
console.log(`This request cost $${response.cost.toFixed(6)}`);
```

### 3. Handle Quota Errors Gracefully

```typescript
try {
  const response = await executeWithTracking(...);
} catch (error) {
  if (error.message.includes('Quota exceeded')) {
    showUpgradePrompt(); // Show user-friendly upgrade UI
  } else {
    showGenericError();
  }
}
```

### 4. Track All AI Calls

Even free/internal calls should be tracked for analytics:

```typescript
// Track even if free
await trackUsage(..., apiResponse);
```

### 5. Set Reasonable Quotas

```sql
-- Daily quota: $10/day
INSERT INTO usage_quotas (
  organization_id,
  quota_type,
  quota_limit,
  reset_at
) VALUES (
  'org-1',
  'daily',
  10.00,
  NOW() + INTERVAL '1 day'
);
```

---

## Migration Checklist

When adding usage tracking to existing code:

- [ ] Import usage tracking functions
- [ ] Identify all AI API call locations
- [ ] Wrap each call with `executeWithTracking()` or add manual tracking
- [ ] Add quota exceeded error handling
- [ ] Test with small quota to verify blocking works
- [ ] Update UI to show costs/quotas to users
- [ ] Add quota indicators to relevant pages
- [ ] Write tests for tracking logic
- [ ] Monitor logs for any tracking failures
- [ ] Document integration for team

---

## Support

For issues or questions:
1. Check this guide's troubleshooting section
2. Review code examples in `src/lib/aiModelExecutor.ts`
3. Check database functions in `supabase/migrations/006_add_usage_tracking.sql`
4. Review test files in `src/hooks/__tests__/` (when available)

---

**Last Updated:** January 28, 2026
**Phase:** 2.2 - Cost Tracking
**Version:** 1.0
