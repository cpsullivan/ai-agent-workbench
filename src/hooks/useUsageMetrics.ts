/**
 * Usage Metrics Hook
 *
 * Fetch and manage AI API usage metrics with real-time updates
 * Supports filtering, caching, and data export
 *
 * @module useUsageMetrics
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

export type TimeRange = 'today' | '7days' | '30days' | '90days' | 'custom';

export interface UsageMetricsOptions {
  timeRange?: TimeRange;
  startDate?: Date | null;
  endDate?: Date | null;
  userId?: string;
  organizationId?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  workflowId?: string;
}

export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  totalCalls: number;
  byProvider: Record<string, { cost: number; tokens: number; calls: number }>;
  byModel: Record<string, { cost: number; tokens: number; calls: number }>;
  byDay: Record<string, { cost: number; tokens: number; calls: number }>;
}

export interface QuotaInfo {
  type: string;
  provider: string | null;
  model: string | null;
  limit: number;
  current: number;
  percentage: number;
  resetAt: string;
}

export interface UseUsageMetricsResult {
  summary: UsageSummary | null;
  quotas: QuotaInfo[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  exportToCsv: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get date range from TimeRange enum
 */
function getDateRange(timeRange: TimeRange): { start: Date; end: Date } {
  const end = new Date();
  let start = new Date();

  switch (timeRange) {
    case 'today':
      start.setHours(0, 0, 0, 0);
      break;
    case '7days':
      start.setDate(start.getDate() - 7);
      break;
    case '30days':
      start.setDate(start.getDate() - 30);
      break;
    case '90days':
      start.setDate(start.getDate() - 90);
      break;
    default:
      // Custom range will be handled separately
      break;
  }

  return { start, end };
}

/**
 * Format data for CSV export
 */
function formatCsvData(summary: UsageSummary | null): string {
  if (!summary) return '';

  let csv = 'Type,Name,Cost (USD),Tokens,Calls\n';

  // By Provider
  csv += '\nBy Provider\n';
  for (const [provider, data] of Object.entries(summary.byProvider)) {
    csv += `Provider,${provider},${data.cost},${data.tokens},${data.calls}\n`;
  }

  // By Model
  csv += '\nBy Model\n';
  for (const [model, data] of Object.entries(summary.byModel)) {
    csv += `Model,${model},${data.cost},${data.tokens},${data.calls}\n`;
  }

  // By Day
  csv += '\nBy Day\n';
  for (const [day, data] of Object.entries(summary.byDay)) {
    csv += `Day,${day},${data.cost},${data.tokens},${data.calls}\n`;
  }

  // Total
  csv += `\nTotal,,${summary.totalCost},${summary.totalTokens},${summary.totalCalls}\n`;

  return csv;
}

/**
 * Download CSV file
 */
function downloadCsv(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Use Usage Metrics Hook
 *
 * Fetch and manage AI API usage metrics with real-time updates
 *
 * @example
 * ```tsx
 * const { summary, quotas, isLoading, error, refetch, exportToCsv } = useUsageMetrics({
 *   timeRange: '30days',
 *   organizationId: 'org-123',
 * });
 * ```
 */
export function useUsageMetrics(options: UsageMetricsOptions = {}): UseUsageMetricsResult {
  const {
    timeRange = '30days',
    startDate: customStartDate = null,
    endDate: customEndDate = null,
    userId,
    organizationId,
    provider,
    model,
    sessionId,
    workflowId,
  } = options;

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [quotas, setQuotas] = useState<QuotaInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cacheRef = useRef<{ key: string; data: UsageSummary; timestamp: number } | null>(null);
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Generate cache key from options
   */
  const getCacheKey = useCallback(() => {
    return JSON.stringify({
      timeRange,
      startDate: customStartDate?.toISOString(),
      endDate: customEndDate?.toISOString(),
      userId,
      organizationId,
      provider,
      model,
      sessionId,
      workflowId,
    });
  }, [timeRange, customStartDate, customEndDate, userId, organizationId, provider, model, sessionId, workflowId]);

  /**
   * Fetch usage summary from database
   */
  const fetchSummary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check cache
      const cacheKey = getCacheKey();
      if (
        cacheRef.current &&
        cacheRef.current.key === cacheKey &&
        Date.now() - cacheRef.current.timestamp < CACHE_TTL
      ) {
        setSummary(cacheRef.current.data);
        setIsLoading(false);
        return;
      }

      if (!organizationId) {
        throw new Error('Organization ID is required');
      }

      // Determine date range
      let startDate: Date;
      let endDate: Date;

      if (timeRange === 'custom' && customStartDate && customEndDate) {
        startDate = customStartDate;
        endDate = customEndDate;
      } else {
        const range = getDateRange(timeRange);
        startDate = range.start;
        endDate = range.end;
      }

      // Call database function to get usage summary
      const { data, error: dbError } = await supabase.rpc('get_usage_summary', {
        p_organization_id: organizationId,
        p_start_date: startDate.toISOString(),
        p_end_date: endDate.toISOString(),
      });

      if (dbError) {
        throw new Error(dbError.message);
      }

      if (!data || data.length === 0) {
        // No data found, return empty summary
        setSummary({
          totalCost: 0,
          totalTokens: 0,
          totalCalls: 0,
          byProvider: {},
          byModel: {},
          byDay: {},
        });
        setIsLoading(false);
        return;
      }

      const summaryData: UsageSummary = {
        totalCost: parseFloat(data[0].total_cost || 0),
        totalTokens: parseInt(data[0].total_tokens || 0),
        totalCalls: parseInt(data[0].total_calls || 0),
        byProvider: data[0].by_provider || {},
        byModel: data[0].by_model || {},
        byDay: data[0].by_day || {},
      };

      // Apply additional filters if specified
      if (provider) {
        summaryData.byProvider = {
          [provider]: summaryData.byProvider[provider] || { cost: 0, tokens: 0, calls: 0 },
        };
      }

      if (model) {
        summaryData.byModel = {
          [model]: summaryData.byModel[model] || { cost: 0, tokens: 0, calls: 0 },
        };
      }

      // Update cache
      cacheRef.current = {
        key: cacheKey,
        data: summaryData,
        timestamp: Date.now(),
      };

      setSummary(summaryData);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to fetch usage metrics';
      setError(errorMsg);
      console.error('Error fetching usage metrics:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getCacheKey, timeRange, customStartDate, customEndDate, organizationId, provider, model]);

  /**
   * Fetch quota information
   */
  const fetchQuotas = useCallback(async () => {
    try {
      if (!organizationId) {
        return;
      }

      const { data, error: dbError } = await supabase
        .from('usage_quotas')
        .select('*')
        .eq('organization_id', organizationId)
        .gt('reset_at', new Date().toISOString());

      if (dbError) {
        throw new Error(dbError.message);
      }

      if (!data || data.length === 0) {
        setQuotas([]);
        return;
      }

      const quotaInfo: QuotaInfo[] = data.map(quota => ({
        type: quota.quota_type,
        provider: quota.provider,
        model: quota.model,
        limit: parseFloat(quota.quota_limit),
        current: parseFloat(quota.current_usage),
        percentage: (parseFloat(quota.current_usage) / parseFloat(quota.quota_limit)) * 100,
        resetAt: quota.reset_at,
      }));

      setQuotas(quotaInfo);
    } catch (err) {
      console.error('Error fetching quotas:', err);
    }
  }, [organizationId]);

  /**
   * Refetch data
   */
  const refetch = useCallback(async () => {
    await Promise.all([fetchSummary(), fetchQuotas()]);
  }, [fetchSummary, fetchQuotas]);

  /**
   * Export data to CSV
   */
  const exportToCsv = useCallback(() => {
    if (!summary) {
      console.warn('No data to export');
      return;
    }

    const csvContent = formatCsvData(summary);
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `usage-metrics-${timestamp}.csv`;

    downloadCsv(csvContent, filename);
  }, [summary]);

  // Fetch data on mount and when options change
  useEffect(() => {
    refetch();
  }, [refetch]);

  // Set up real-time subscription for usage updates
  useEffect(() => {
    if (!organizationId) {
      return;
    }

    const channel = supabase
      .channel('usage_updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'api_usage_logs',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          // Invalidate cache and refetch on new usage logs
          cacheRef.current = null;
          refetch();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'usage_quotas',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          // Refetch quotas on updates
          fetchQuotas();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [organizationId, refetch, fetchQuotas]);

  return {
    summary,
    quotas,
    isLoading,
    error,
    refetch,
    exportToCsv,
  };
}
