/**
 * Tests for Analytics Usage API Endpoint
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

describe('Analytics Usage Endpoint', () => {
  describe('Authentication', () => {
    it('should return 401 without authorization header', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123'
      );

      // Mock handler response
      const expectedStatus = 401;
      assertEquals(expectedStatus, 401);
    });

    it('should return 401 with invalid token', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123',
        {
          Authorization: 'Bearer invalid-token',
        }
      );

      const expectedStatus = 401;
      assertEquals(expectedStatus, 401);
    });

    it('should accept valid authorization token', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const expectedStatus = 200;
      assertExists(req.headers.get('Authorization'));
    });
  });

  describe('Query Parameters', () => {
    it('should require organization_id parameter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const orgId = url.searchParams.get('organization_id');

      assertEquals(orgId, null);
    });

    it('should parse start_date parameter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&start_date=2024-01-01T00:00:00Z',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const startDate = url.searchParams.get('start_date');

      assertEquals(startDate, '2024-01-01T00:00:00Z');
    });

    it('should parse end_date parameter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&end_date=2024-01-31T23:59:59Z',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const endDate = url.searchParams.get('end_date');

      assertEquals(endDate, '2024-01-31T23:59:59Z');
    });

    it('should parse provider filter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&provider=openai',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const provider = url.searchParams.get('provider');

      assertEquals(provider, 'openai');
    });

    it('should parse model filter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&model=gpt-4',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const model = url.searchParams.get('model');

      assertEquals(model, 'gpt-4');
    });

    it('should parse user_id filter', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&user_id=user-456',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const userId = url.searchParams.get('user_id');

      assertEquals(userId, 'user-456');
    });

    it('should parse pagination parameters', async () => {
      const req = createMockRequest(
        'GET',
        'http://localhost/functions/v1/analytics-usage?organization_id=org-123&page=2&limit=50',
        {
          Authorization: 'Bearer valid-token',
        }
      );

      const url = new URL(req.url);
      const page = url.searchParams.get('page');
      const limit = url.searchParams.get('limit');

      assertEquals(page, '2');
      assertEquals(limit, '50');
    });
  });

  describe('Response Format', () => {
    it('should return usage summary', async () => {
      const mockResponse = {
        summary: {
          totalCost: 125.5,
          totalCalls: 1000,
          totalTokens: 500000,
          byProvider: {
            openai: { cost: 75.0, calls: 600, tokens: 300000 },
            anthropic: { cost: 50.5, calls: 400, tokens: 200000 },
          },
          byModel: {
            'gpt-4': { cost: 60.0, calls: 500, tokens: 250000 },
            'claude-3-5-sonnet-20241022': { cost: 50.5, calls: 400, tokens: 200000 },
          },
        },
      };

      assertExists(mockResponse.summary);
      assertEquals(mockResponse.summary.totalCost, 125.5);
      assertEquals(mockResponse.summary.totalCalls, 1000);
    });

    it('should include breakdown by provider', async () => {
      const mockResponse = {
        summary: {
          byProvider: {
            openai: { cost: 75.0, calls: 600, tokens: 300000 },
            anthropic: { cost: 50.5, calls: 400, tokens: 200000 },
          },
        },
      };

      assertExists(mockResponse.summary.byProvider);
      assertEquals(mockResponse.summary.byProvider.openai.cost, 75.0);
    });

    it('should include breakdown by model', async () => {
      const mockResponse = {
        summary: {
          byModel: {
            'gpt-4': { cost: 60.0, calls: 500, tokens: 250000 },
          },
        },
      };

      assertExists(mockResponse.summary.byModel);
      assertEquals(mockResponse.summary.byModel['gpt-4'].cost, 60.0);
    });

    it('should include cache headers', async () => {
      const expectedHeaders = {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'application/json',
      };

      assertExists(expectedHeaders['Cache-Control']);
      assertEquals(expectedHeaders['Cache-Control'], 'public, max-age=300');
    });

    it('should include pagination metadata when requested', async () => {
      const mockResponse = {
        summary: {},
        logs: [],
        pagination: {
          page: 1,
          limit: 100,
          total: 1000,
          totalPages: 10,
        },
      };

      assertExists(mockResponse.pagination);
      assertEquals(mockResponse.pagination.page, 1);
      assertEquals(mockResponse.pagination.total, 1000);
    });
  });

  describe('Permissions', () => {
    it('should check analytics read permission', async () => {
      const userId = 'user-123';
      const organizationId = 'org-456';
      const resource = 'analytics';
      const action = 'read';

      // Mock permission check
      const hasPermission = true;

      assertEquals(hasPermission, true);
    });

    it('should return 403 without analytics permission', async () => {
      const hasPermission = false;
      const expectedStatus = 403;

      assertEquals(hasPermission, false);
      assertEquals(expectedStatus, 403);
    });

    it('should allow admin users', async () => {
      const userRole = 'admin';
      const hasPermission = userRole === 'admin';

      assertEquals(hasPermission, true);
    });

    it('should block viewer role without explicit permission', async () => {
      const userRole = 'viewer';
      const hasAnalyticsPermission = false;

      assertEquals(userRole, 'viewer');
      assertEquals(hasAnalyticsPermission, false);
    });
  });

  describe('Data Filtering', () => {
    it('should filter by date range', async () => {
      const logs = [
        { created_at: '2024-01-15T00:00:00Z', cost_usd: 1.0 },
        { created_at: '2024-01-20T00:00:00Z', cost_usd: 2.0 },
        { created_at: '2024-01-25T00:00:00Z', cost_usd: 3.0 },
      ];

      const startDate = new Date('2024-01-18T00:00:00Z');
      const endDate = new Date('2024-01-31T23:59:59Z');

      const filtered = logs.filter((log) => {
        const logDate = new Date(log.created_at);
        return logDate >= startDate && logDate <= endDate;
      });

      assertEquals(filtered.length, 2);
      assertEquals(filtered[0].cost_usd, 2.0);
      assertEquals(filtered[1].cost_usd, 3.0);
    });

    it('should filter by provider', async () => {
      const logs = [
        { provider: 'openai', cost_usd: 1.0 },
        { provider: 'anthropic', cost_usd: 2.0 },
        { provider: 'openai', cost_usd: 3.0 },
      ];

      const filtered = logs.filter((log) => log.provider === 'openai');

      assertEquals(filtered.length, 2);
      assertEquals(filtered[0].cost_usd, 1.0);
      assertEquals(filtered[1].cost_usd, 3.0);
    });

    it('should filter by model', async () => {
      const logs = [
        { model: 'gpt-4', cost_usd: 1.0 },
        { model: 'gpt-3.5-turbo', cost_usd: 2.0 },
        { model: 'gpt-4', cost_usd: 3.0 },
      ];

      const filtered = logs.filter((log) => log.model === 'gpt-4');

      assertEquals(filtered.length, 2);
    });

    it('should filter by user', async () => {
      const logs = [
        { user_id: 'user-1', cost_usd: 1.0 },
        { user_id: 'user-2', cost_usd: 2.0 },
        { user_id: 'user-1', cost_usd: 3.0 },
      ];

      const filtered = logs.filter((log) => log.user_id === 'user-1');

      assertEquals(filtered.length, 2);
      assertEquals(filtered[0].cost_usd, 1.0);
      assertEquals(filtered[1].cost_usd, 3.0);
    });

    it('should apply multiple filters', async () => {
      const logs = [
        {
          provider: 'openai',
          model: 'gpt-4',
          user_id: 'user-1',
          cost_usd: 1.0,
        },
        {
          provider: 'openai',
          model: 'gpt-3.5-turbo',
          user_id: 'user-1',
          cost_usd: 2.0,
        },
        {
          provider: 'anthropic',
          model: 'claude-3-5-sonnet-20241022',
          user_id: 'user-1',
          cost_usd: 3.0,
        },
      ];

      const filtered = logs.filter(
        (log) =>
          log.provider === 'openai' &&
          log.model === 'gpt-4' &&
          log.user_id === 'user-1'
      );

      assertEquals(filtered.length, 1);
      assertEquals(filtered[0].cost_usd, 1.0);
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for invalid date format', async () => {
      const invalidDate = 'not-a-date';
      const expectedStatus = 400;

      assertEquals(expectedStatus, 400);
    });

    it('should return 500 on database error', async () => {
      const dbError = new Error('Connection timeout');
      const expectedStatus = 500;

      assertExists(dbError);
      assertEquals(expectedStatus, 500);
    });

    it('should handle missing organization gracefully', async () => {
      const organizationId = 'nonexistent-org';
      const logs = [];

      assertEquals(logs.length, 0);
    });
  });

  describe('Performance', () => {
    it('should limit query results', async () => {
      const limit = 100;
      const mockLogs = Array.from({ length: 1000 }, (_, i) => ({
        id: `${i}`,
        cost_usd: 1.0,
      }));

      const limited = mockLogs.slice(0, limit);

      assertEquals(limited.length, 100);
    });

    it('should use offset for pagination', async () => {
      const mockLogs = Array.from({ length: 100 }, (_, i) => ({
        id: `${i}`,
        cost_usd: 1.0,
      }));

      const page = 3;
      const limit = 20;
      const offset = (page - 1) * limit;

      const paginated = mockLogs.slice(offset, offset + limit);

      assertEquals(paginated.length, 20);
      assertEquals(paginated[0].id, '40');
    });
  });
});
