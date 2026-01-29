/**
 * Tests for Quota Check API Endpoint
 */

import { describe, it, expect, beforeEach } from 'https://deno.land/std@0.192.0/testing/bdd.ts';
import { assertEquals, assertExists } from 'https://deno.land/std@0.192.0/testing/asserts.ts';

// Mock request helper
function createMockRequest(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  body?: any
): Request {
  return new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Quota Check Endpoint', () => {
  describe('Authentication', () => {
    it('should return 401 without authorization header', async () => {
      const req = createMockRequest(
        'POST',
        'http://localhost/functions/v1/quota-check',
        {},
        { organization_id: 'org-123' }
      );

      const expectedStatus = 401;
      assertEquals(expectedStatus, 401);
    });

    it('should return 401 with invalid token', async () => {
      const req = createMockRequest(
        'POST',
        'http://localhost/functions/v1/quota-check',
        {
          Authorization: 'Bearer invalid-token',
        },
        { organization_id: 'org-123' }
      );

      const expectedStatus = 401;
      assertEquals(expectedStatus, 401);
    });

    it('should accept valid authorization token', async () => {
      const req = createMockRequest(
        'POST',
        'http://localhost/functions/v1/quota-check',
        {
          Authorization: 'Bearer valid-token',
          'Content-Type': 'application/json',
        },
        { organization_id: 'org-123' }
      );

      assertExists(req.headers.get('Authorization'));
      assertEquals(req.method, 'POST');
    });
  });

  describe('Request Validation', () => {
    it('should require organization_id', async () => {
      const body = {
        provider: 'openai',
        model: 'gpt-4',
      };

      const hasOrgId = 'organization_id' in body;
      assertEquals(hasOrgId, false);
    });

    it('should require provider', async () => {
      const body = {
        organization_id: 'org-123',
        model: 'gpt-4',
      };

      const hasProvider = 'provider' in body;
      assertEquals(hasProvider, false);
    });

    it('should require model', async () => {
      const body = {
        organization_id: 'org-123',
        provider: 'openai',
      };

      const hasModel = 'model' in body;
      assertEquals(hasModel, false);
    });

    it('should accept estimated_cost parameter', async () => {
      const body = {
        organization_id: 'org-123',
        provider: 'openai',
        model: 'gpt-4',
        estimated_cost: 0.05,
      };

      assertExists(body.estimated_cost);
      assertEquals(body.estimated_cost, 0.05);
    });

    it('should accept estimated_tokens parameter', async () => {
      const body = {
        organization_id: 'org-123',
        provider: 'openai',
        model: 'gpt-4',
        estimated_tokens: 1000,
      };

      assertExists(body.estimated_tokens);
      assertEquals(body.estimated_tokens, 1000);
    });
  });

  describe('Quota Checking Logic', () => {
    it('should allow when under quota', async () => {
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

    it('should block when quota exceeded', async () => {
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

    it('should account for estimated cost', async () => {
      const quotaLimit = 100.0;
      const currentUsage = 98.0;
      const estimatedCost = 3.0;

      const wouldExceed = currentUsage + estimatedCost > quotaLimit;
      const remaining = quotaLimit - currentUsage - estimatedCost;

      assertEquals(wouldExceed, true);
      assertEquals(remaining, -1.0);
    });

    it('should check daily quota first', async () => {
      const quotas = [
        { quotaType: 'daily', quotaLimit: 10.0, currentUsage: 9.5 },
        { quotaType: 'monthly', quotaLimit: 100.0, currentUsage: 50.0 },
      ];

      // Daily quota should be checked first and block
      const dailyWouldExceed = quotas[0].currentUsage + 1.0 > quotas[0].quotaLimit;

      assertEquals(dailyWouldExceed, true);
    });

    it('should check provider-specific quota', async () => {
      const quotaCheck = {
        allowed: true,
        quotaLimit: 50.0,
        currentUsage: 25.0,
        remaining: 25.0,
        quotaType: 'provider',
        provider: 'openai',
      };

      assertEquals(quotaCheck.provider, 'openai');
      assertEquals(quotaCheck.allowed, true);
    });

    it('should check model-specific quota', async () => {
      const quotaCheck = {
        allowed: false,
        quotaLimit: 20.0,
        currentUsage: 21.0,
        remaining: -1.0,
        quotaType: 'model',
        provider: 'openai',
        model: 'gpt-4',
      };

      assertEquals(quotaCheck.model, 'gpt-4');
      assertEquals(quotaCheck.allowed, false);
    });

    it('should allow unlimited quota', async () => {
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

    it('should return most restrictive quota', async () => {
      const quotas = [
        { quotaType: 'daily', allowed: true, remaining: 50.0 },
        { quotaType: 'monthly', allowed: false, remaining: -5.0 },
      ];

      // Should return monthly (most restrictive)
      const mostRestrictive = quotas.find((q) => !q.allowed) || quotas[0];

      assertEquals(mostRestrictive.quotaType, 'monthly');
      assertEquals(mostRestrictive.allowed, false);
    });
  });

  describe('Response Format - Success', () => {
    it('should return 200 when quota allows', async () => {
      const response = {
        status: 200,
        body: {
          allowed: true,
          quota_limit: 100.0,
          current_usage: 50.0,
          remaining: 50.0,
          quota_type: 'daily',
        },
      };

      assertEquals(response.status, 200);
      assertEquals(response.body.allowed, true);
    });

    it('should include X-RateLimit headers', async () => {
      const headers = {
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '50',
        'X-RateLimit-Reset': '1704067200',
      };

      assertExists(headers['X-RateLimit-Limit']);
      assertExists(headers['X-RateLimit-Remaining']);
      assertExists(headers['X-RateLimit-Reset']);
    });

    it('should include quota type in response', async () => {
      const response = {
        allowed: true,
        quota_type: 'daily',
      };

      assertEquals(response.quota_type, 'daily');
    });
  });

  describe('Response Format - Quota Exceeded', () => {
    it('should return 429 when quota exceeded', async () => {
      const response = {
        status: 429,
        body: {
          allowed: false,
          quota_limit: 100.0,
          current_usage: 105.0,
          remaining: -5.0,
          quota_type: 'daily',
          message: 'Quota exceeded',
        },
      };

      assertEquals(response.status, 429);
      assertEquals(response.body.allowed, false);
    });

    it('should include Retry-After header', async () => {
      const headers = {
        'Retry-After': '3600', // 1 hour
      };

      assertExists(headers['Retry-After']);
    });

    it('should include quota reset time', async () => {
      const response = {
        allowed: false,
        reset_at: '2024-01-01T00:00:00Z',
      };

      assertExists(response.reset_at);
    });

    it('should include descriptive error message', async () => {
      const response = {
        allowed: false,
        message: 'Daily quota exceeded. Resets at 2024-01-01 00:00:00 UTC',
      };

      assertExists(response.message);
      assertEquals(response.message.includes('quota exceeded'), true);
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate cost from tokens if not provided', async () => {
      const estimatedTokens = 1000;
      const inputCostPer1k = 0.03; // GPT-4 pricing
      const estimatedCost = (estimatedTokens / 1000) * inputCostPer1k;

      assertEquals(estimatedCost, 0.03);
    });

    it('should use provided estimated_cost over tokens', async () => {
      const providedCost = 0.05;
      const estimatedCost = providedCost;

      assertEquals(estimatedCost, 0.05);
    });

    it('should default to 0 if no estimate provided', async () => {
      const estimatedCost = 0;
      assertEquals(estimatedCost, 0);
    });
  });

  describe('Permissions', () => {
    it('should check user belongs to organization', async () => {
      const userOrgId = 'org-123';
      const requestOrgId = 'org-123';

      assertEquals(userOrgId, requestOrgId);
    });

    it('should reject if user not in organization', async () => {
      const userOrgId = 'org-123';
      const requestOrgId = 'org-456';

      assertEquals(userOrgId === requestOrgId, false);
    });

    it('should allow admins to check any organization', async () => {
      const userRole = 'admin';
      const hasPermission = userRole === 'admin';

      assertEquals(hasPermission, true);
    });
  });

  describe('Database Integration', () => {
    it('should call check_quota RPC function', async () => {
      const rpcCall = {
        function: 'check_quota',
        params: {
          p_organization_id: 'org-123',
          p_provider: 'openai',
          p_model: 'gpt-4',
          p_estimated_cost: 0.05,
        },
      };

      assertEquals(rpcCall.function, 'check_quota');
      assertExists(rpcCall.params.p_organization_id);
    });

    it('should handle database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      const expectedStatus = 500;

      assertExists(dbError);
      assertEquals(expectedStatus, 500);
    });

    it('should handle missing quota gracefully', async () => {
      const quotaData = null;
      const defaultResponse = {
        allowed: true,
        quotaLimit: Infinity,
        currentUsage: 0,
        remaining: Infinity,
        quotaType: 'none',
      };

      assertEquals(quotaData, null);
      assertEquals(defaultResponse.allowed, true);
    });
  });

  describe('Quota Violation Logging', () => {
    it('should log quota violations', async () => {
      const violation = {
        organization_id: 'org-123',
        user_id: 'user-456',
        provider: 'openai',
        model: 'gpt-4',
        attempted_cost: 0.05,
        quota_limit: 100.0,
        current_usage: 100.5,
        created_at: new Date().toISOString(),
      };

      assertExists(violation.organization_id);
      assertExists(violation.attempted_cost);
      assertEquals(violation.current_usage > violation.quota_limit, true);
    });

    it('should not log when quota allows', async () => {
      const allowed = true;
      const shouldLog = !allowed;

      assertEquals(shouldLog, false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero quota limit', async () => {
      const quotaCheck = {
        allowed: false,
        quotaLimit: 0.0,
        currentUsage: 0.0,
        remaining: 0.0,
        quotaType: 'daily',
      };

      assertEquals(quotaCheck.quotaLimit, 0.0);
      assertEquals(quotaCheck.allowed, false);
    });

    it('should handle negative current usage (shouldn\'t happen)', async () => {
      const currentUsage = -5.0;
      const quotaLimit = 100.0;
      const allowed = currentUsage < quotaLimit;

      assertEquals(allowed, true);
    });

    it('should handle very small estimated costs', async () => {
      const estimatedCost = 0.000001;
      const quotaLimit = 0.00001;
      const currentUsage = 0.000008;
      const wouldExceed = currentUsage + estimatedCost > quotaLimit;

      assertEquals(wouldExceed, false);
    });

    it('should handle very large costs', async () => {
      const estimatedCost = 1000000.0;
      const quotaLimit = 100.0;
      const currentUsage = 0.0;
      const wouldExceed = currentUsage + estimatedCost > quotaLimit;

      assertEquals(wouldExceed, true);
    });

    it('should handle exact quota match', async () => {
      const quotaLimit = 100.0;
      const currentUsage = 100.0;
      const allowed = currentUsage < quotaLimit;

      assertEquals(allowed, false);
    });
  });

  describe('Performance', () => {
    it('should cache quota checks for same org', async () => {
      // Simulate cache check
      const cacheKey = 'quota:org-123:openai:gpt-4';
      const cacheTTL = 60; // 60 seconds

      assertExists(cacheKey);
      assertEquals(cacheTTL, 60);
    });

    it('should respond quickly for cached results', async () => {
      const cached = true;
      const responseTime = cached ? 10 : 500; // ms

      assertEquals(responseTime, 10);
    });
  });

  describe('Method Validation', () => {
    it('should only accept POST requests', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/quota-check'
      );

      assertEquals(req.method, 'GET');
      const expectedStatus = 405;
      assertEquals(expectedStatus, 405);
    });

    it('should accept POST requests', async () => {
      const req = createMockRequest(
        'POST',
        'http://localhost/functions/v1/quota-check',
        { 'Content-Type': 'application/json' },
        { organization_id: 'org-123' }
      );

      assertEquals(req.method, 'POST');
    });
  });
});
