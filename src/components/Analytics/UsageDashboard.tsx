/**
 * Usage Dashboard Component
 *
 * Displays comprehensive overview of AI API usage and costs
 * Includes real-time updates, quota tracking, and export functionality
 *
 * @module UsageDashboard
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useUsageMetrics } from '@/hooks/useUsageMetrics';
import { CostBreakdown } from './CostBreakdown';

// ============================================================================
// Types
// ============================================================================

type TimeRange = 'today' | '7days' | '30days' | '90days' | 'custom';

// ============================================================================
// Component
// ============================================================================

export function UsageDashboard() {
  const { user } = useAuth();
  const [timeRange, setTimeRange] = useState<TimeRange>('30days');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const {
    summary,
    quotas,
    isLoading,
    error,
    refetch,
    exportToCsv,
  } = useUsageMetrics({
    timeRange,
    startDate,
    endDate,
    userId: user?.id ?? undefined,
    organizationId: user?.organization_id ?? undefined,
  });

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      refetch();
    }, 30000);

    return () => clearInterval(interval);
  }, [refetch]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getTimeRangeLabel = (range: TimeRange) => {
    switch (range) {
      case 'today':
        return 'Today';
      case '7days':
        return 'Last 7 Days';
      case '30days':
        return 'Last 30 Days';
      case '90days':
        return 'Last 90 Days';
      case 'custom':
        return 'Custom Range';
      default:
        return range;
    }
  };

  const getQuotaColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    if (percentage >= 50) return 'bg-blue-500';
    return 'bg-green-500';
  };

  const getQuotaTextColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-700';
    if (percentage >= 75) return 'text-yellow-700';
    return 'text-gray-700';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading usage data: {error}</p>
        <button
          onClick={() => refetch()}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Usage Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showBreakdown ? 'Hide' : 'Show'} Detailed Breakdown
          </button>
          <button
            onClick={() => exportToCsv()}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            Export to CSV
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Time Range:</label>
          <div className="flex gap-2">
            {(['today', '7days', '30days', '90days', 'custom'] as TimeRange[]).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  timeRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {getTimeRangeLabel(range)}
              </button>
            ))}
          </div>
        </div>

        {timeRange === 'custom' && (
          <div className="mt-4 flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate?.toISOString().split('T')[0] || ''}
                onChange={e => setStartDate(new Date(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate?.toISOString().split('T')[0] || ''}
                onChange={e => setEndDate(new Date(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-md"
              />
            </div>
          </div>
        )}
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Cost */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Total Cost</h3>
            <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">
            {formatCurrency(summary?.totalCost || 0)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {formatNumber(summary?.totalTokens || 0)} tokens
          </p>
        </div>

        {/* Total Calls */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">API Calls</h3>
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">
            {formatNumber(summary?.totalCalls || 0)}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Avg: {formatCurrency((summary?.totalCost || 0) / (summary?.totalCalls || 1))} per call
          </p>
        </div>

        {/* Average Cost per Token */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-600">Cost per 1K Tokens</h3>
            <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <p className="mt-4 text-3xl font-bold text-gray-900">
            {formatCurrency(((summary?.totalCost || 0) / (summary?.totalTokens || 1)) * 1000)}
          </p>
          <p className="mt-1 text-sm text-gray-500">Average across all models</p>
        </div>
      </div>

      {/* Quotas */}
      {quotas && quotas.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quota Usage</h2>
          <div className="space-y-4">
            {quotas.map((quota, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    {quota.type.charAt(0).toUpperCase() + quota.type.slice(1)} Quota
                    {quota.provider && ` - ${quota.provider}`}
                    {quota.model && ` (${quota.model})`}
                  </span>
                  <span className={`text-sm font-semibold ${getQuotaTextColor(quota.percentage)}`}>
                    {formatCurrency(quota.current)} / {formatCurrency(quota.limit)}
                    ({quota.percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`${getQuotaColor(quota.percentage)} h-2 rounded-full transition-all`}
                    style={{ width: `${Math.min(quota.percentage, 100)}%` }}
                  ></div>
                </div>
                {quota.percentage >= 75 && (
                  <p className="text-xs text-yellow-600">
                    ⚠️ Approaching quota limit. Resets {new Date(quota.resetAt).toLocaleString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cost by Provider */}
      {summary?.byProvider && Object.keys(summary.byProvider).length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Cost by Provider</h2>
          <div className="space-y-3">
            {Object.entries(summary.byProvider).map(([provider, data]: [string, any]) => (
              <div key={provider} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900 capitalize">{provider}</p>
                  <p className="text-sm text-gray-600">
                    {formatNumber(data.tokens)} tokens · {formatNumber(data.calls)} calls
                  </p>
                </div>
                <p className="text-lg font-semibold text-gray-900">
                  {formatCurrency(data.cost)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Models */}
      {summary?.byModel && Object.keys(summary.byModel).length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Models by Cost</h2>
          <div className="space-y-3">
            {Object.entries(summary.byModel)
              .sort(([, a]: [string, any], [, b]: [string, any]) => b.cost - a.cost)
              .slice(0, 5)
              .map(([model, data]: [string, any]) => (
                <div key={model} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{model}</p>
                    <p className="text-sm text-gray-600">
                      {formatNumber(data.tokens)} tokens · {formatNumber(data.calls)} calls
                    </p>
                  </div>
                  <p className="text-lg font-semibold text-gray-900">
                    {formatCurrency(data.cost)}
                  </p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Detailed Breakdown (Toggle) */}
      {showBreakdown && (
        <CostBreakdown
          timeRange={timeRange}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </div>
  );
}
