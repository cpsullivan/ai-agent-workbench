/**
 * Tests for useUsageMetrics Hook
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useUsageMetrics } from '../useUsageMetrics';
import { supabase } from '@/lib/supabase';

// Mock Supabase client
vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => ({
            limit: vi.fn(() => ({ data: null, error: null })),
          })),
        })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn(() => ({
        subscribe: vi.fn(),
      })),
    })),
  },
}));

describe('useUsageMetrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with loading state', () => {
    const { result } = renderHook(() => useUsageMetrics());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.summary).toBe(null);
    expect(result.current.quotas).toEqual([]);
    expect(result.current.error).toBe(null);
  });

  it('should fetch usage summary successfully', async () => {
    const mockSummary = {
      totalCost: 10.5,
      totalCalls: 100,
      totalTokens: 50000,
      byProvider: {
        openai: { cost: 6.0, calls: 60, tokens: 30000 },
        anthropic: { cost: 4.5, calls: 40, tokens: 20000 },
      },
      byModel: {
        'gpt-4': { cost: 6.0, calls: 60, tokens: 30000 },
        'claude-3-5-sonnet-20241022': { cost: 4.5, calls: 40, tokens: 20000 },
      },
      byDay: {},
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockSummary,
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    const { result } = renderHook(() =>
      useUsageMetrics({
        timeRange: '30days',
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual(mockSummary);
    expect(result.current.error).toBe(null);
    expect(supabase.rpc).toHaveBeenCalledWith('get_usage_summary', {
      p_organization_id: 'org-123',
      p_start_date: expect.any(String),
      p_end_date: expect.any(String),
    });
  });

  it('should handle fetch errors gracefully', async () => {
    const mockError = {
      message: 'Database connection failed',
      details: '',
      hint: '',
      code: 'ERROR',
      name: 'PostgrestError',
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: mockError,
      count: null,
      status: 500,
      statusText: 'Error',
    });

    const { result } = renderHook(() =>
      useUsageMetrics({
        timeRange: '7days',
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Database connection failed');
    expect(result.current.summary).toBe(null);
  });

  it('should use cache for repeated calls within TTL', async () => {
    const mockSummary = {
      totalCost: 5.0,
      totalCalls: 50,
      totalTokens: 25000,
      byProvider: {},
      byModel: {},
      byDay: {},
    };

    vi.mocked(supabase.rpc).mockResolvedValue({
      data: mockSummary,
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    const { result, rerender } = renderHook(() =>
      useUsageMetrics({
        timeRange: '30days',
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Clear mock call history
    vi.mocked(supabase.rpc).mockClear();

    // Rerender with same params
    rerender();

    // Should not call supabase.rpc again (using cache)
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(result.current.summary).toEqual(mockSummary);
  });

  it('should calculate date ranges correctly for different time ranges', async () => {
    const testCases: Array<{
      timeRange: 'today' | '7days' | '30days' | '90days';
      expectedDays: number;
    }> = [
      { timeRange: 'today', expectedDays: 0 },
      { timeRange: '7days', expectedDays: 7 },
      { timeRange: '30days', expectedDays: 30 },
      { timeRange: '90days', expectedDays: 90 },
    ];

    for (const { timeRange, expectedDays } of testCases) {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: { totalCost: 0, totalCalls: 0, totalTokens: 0, byProvider: {}, byModel: {}, byDay: {} },
        error: null,
        count: null,
        status: 200,
        statusText: 'OK',
      });

      renderHook(() =>
        useUsageMetrics({
          timeRange,
          organizationId: 'org-123',
        })
      );

      await waitFor(() => {
        expect(supabase.rpc).toHaveBeenCalled();
      });

      const call = vi.mocked(supabase.rpc).mock.calls[0];
      const params = call[1] as any;

      const startDate = new Date(params.p_start_date);
      const endDate = new Date(params.p_end_date);
      const diffDays = Math.round(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(diffDays).toBe(expectedDays);

      vi.mocked(supabase.rpc).mockClear();
    }
  });

  it('should handle custom date ranges', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { totalCost: 0, totalCalls: 0, totalTokens: 0, byProvider: {}, byModel: {}, byDay: {} },
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    renderHook(() =>
      useUsageMetrics({
        timeRange: 'custom',
        startDate,
        endDate,
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });

    const call = vi.mocked(supabase.rpc).mock.calls[0];
    const params = call[1] as any;

    expect(params.p_start_date).toBe(startDate.toISOString());
    expect(params.p_end_date).toBe(endDate.toISOString());
  });

  it('should fetch quotas successfully', async () => {
    const mockQuotas = [
      {
        id: '1',
        organization_id: 'org-123',
        quota_type: 'daily',
        quota_limit: 100.0,
        current_usage: 75.0,
        reset_at: new Date('2024-12-31').toISOString(),
        provider: null,
        model: null,
      },
      {
        id: '2',
        organization_id: 'org-123',
        quota_type: 'monthly',
        quota_limit: 1000.0,
        current_usage: 500.0,
        reset_at: new Date('2024-12-31').toISOString(),
        provider: null,
        model: null,
      },
    ];

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { totalCost: 0, totalCalls: 0, totalTokens: 0, byProvider: {}, byModel: {}, byDay: {} },
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    vi.mocked(supabase.from).mockReturnValueOnce({
      select: vi.fn().mockReturnValueOnce({
        eq: vi.fn().mockReturnValueOnce({
          order: vi.fn().mockReturnValueOnce({
            limit: vi.fn().mockResolvedValueOnce({
              data: mockQuotas,
              error: null,
            }),
          }),
        }),
      }),
    } as any);

    const { result } = renderHook(() =>
      useUsageMetrics({
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.quotas.length).toBeGreaterThan(0);
    });

    expect(result.current.quotas).toHaveLength(2);
    expect(result.current.quotas[0]).toMatchObject({
      type: 'daily',
      limit: 100.0,
      current: 75.0,
      percentage: 75.0,
      provider: null,
      model: null,
    });
    expect(result.current.quotas[1]).toMatchObject({
      type: 'monthly',
      limit: 1000.0,
      current: 500.0,
      percentage: 50.0,
      provider: null,
      model: null,
    });
  });

  it('should refetch data when refetch is called', async () => {
    const mockSummary1 = {
      totalCost: 10.0,
      totalCalls: 100,
      totalTokens: 50000,
      byProvider: {},
      byModel: {},
      byDay: {},
    };

    const mockSummary2 = {
      totalCost: 15.0,
      totalCalls: 150,
      totalTokens: 75000,
      byProvider: {},
      byModel: {},
      byDay: {},
    };

    vi.mocked(supabase.rpc)
      .mockResolvedValueOnce({ data: mockSummary1, error: null, count: null, status: 200, statusText: 'OK' })
      .mockResolvedValueOnce({ data: mockSummary2, error: null, count: null, status: 200, statusText: 'OK' });

    const { result } = renderHook(() =>
      useUsageMetrics({
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.summary).toEqual(mockSummary1);

    // Refetch
    result.current.refetch();

    await waitFor(() => {
      expect(result.current.summary).toEqual(mockSummary2);
    });

    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });

  it('should export to CSV correctly', async () => {
    const mockSummary = {
      totalCost: 10.5,
      totalCalls: 100,
      totalTokens: 50000,
      byProvider: {
        openai: { cost: 6.0, calls: 60, tokens: 30000 },
        anthropic: { cost: 4.5, calls: 40, tokens: 20000 },
      },
      byModel: {
        'gpt-4': { cost: 6.0, calls: 60, tokens: 30000 },
        'claude-3-5-sonnet-20241022': { cost: 4.5, calls: 40, tokens: 20000 },
      },
      byDay: {},
    };

    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: mockSummary,
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    // Mock document.createElement and URL.createObjectURL
    const mockLink = {
      click: vi.fn(),
      href: '',
      download: '',
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');

    const { result } = renderHook(() =>
      useUsageMetrics({
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.exportToCsv();

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.click).toHaveBeenCalled();
    expect(mockLink.download).toContain('.csv');
  });

  it('should filter by user ID when provided', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: { totalCost: 0, totalCalls: 0, totalTokens: 0, byProvider: {}, byModel: {}, byDay: {} },
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    renderHook(() =>
      useUsageMetrics({
        userId: 'user-456',
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalled();
    });

    // Should still call get_usage_summary at org level
    // User filtering happens in component logic
    expect(supabase.rpc).toHaveBeenCalledWith('get_usage_summary', {
      p_organization_id: 'org-123',
      p_start_date: expect.any(String),
      p_end_date: expect.any(String),
    });
  });

  it('should setup real-time subscription for usage updates', async () => {
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
    };

    vi.mocked(supabase.channel).mockReturnValue(mockChannel as any);
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: { totalCost: 0, totalCalls: 0, totalTokens: 0, byProvider: {}, byModel: {}, byDay: {} },
      error: null,
      count: null,
      status: 200,
      statusText: 'OK',
    });

    renderHook(() =>
      useUsageMetrics({
        organizationId: 'org-123',
      })
    );

    await waitFor(() => {
      expect(supabase.channel).toHaveBeenCalledWith('usage_updates');
    });

    expect(mockChannel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        event: '*',
        schema: 'public',
        table: 'api_usage_logs',
      }),
      expect.any(Function)
    );

    expect(mockChannel.subscribe).toHaveBeenCalled();
  });
});
