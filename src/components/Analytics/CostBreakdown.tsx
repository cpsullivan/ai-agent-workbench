/**
 * Cost Breakdown Component
 *
 * Interactive charts and detailed analysis of AI API costs
 * Supports filtering, drill-down, and multiple visualization types
 *
 * @module CostBreakdown
 */

import React, { useState } from 'react';
import { useUsageMetrics } from '@/hooks/useUsageMetrics';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// Types
// ============================================================================

type TimeRange = 'today' | '7days' | '30days' | '90days' | 'custom';
type ChartType = 'provider' | 'model' | 'timeline' | 'tokens';

interface CostBreakdownProps {
  timeRange?: TimeRange;
  startDate?: Date | null;
  endDate?: Date | null;
}

// ============================================================================
// Helper Functions
// ============================================================================

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

// ============================================================================
// Component
// ============================================================================

export function CostBreakdown({
  timeRange = '30days',
  startDate = null,
  endDate = null,
}: CostBreakdownProps) {
  const { user } = useAuth();
  const [activeChart, setActiveChart] = useState<ChartType>('provider');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { summary, isLoading, error } = useUsageMetrics({
    timeRange,
    startDate,
    endDate,
    userId: user?.id ?? undefined,
    organizationId: user?.organization_id ?? undefined,
    provider: selectedProvider ?? undefined,
    model: selectedModel ?? undefined,
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading breakdown: {error}</p>
      </div>
    );
  }

  // Calculate percentages for pie charts
  const providerData = summary?.byProvider
    ? Object.entries(summary.byProvider).map(([name, data]: [string, any]) => ({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        value: data.cost,
        tokens: data.tokens,
        calls: data.calls,
        percentage: (data.cost / summary.totalCost) * 100,
      }))
    : [];

  const modelData = summary?.byModel
    ? Object.entries(summary.byModel)
        .map(([name, data]: [string, any]) => ({
          name,
          value: data.cost,
          tokens: data.tokens,
          calls: data.calls,
          percentage: (data.cost / summary.totalCost) * 100,
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10) // Top 10 models
    : [];

  const timelineData = summary?.byDay
    ? Object.entries(summary.byDay)
        .map(([date, data]: [string, any]) => ({
          date,
          cost: data.cost,
          tokens: data.tokens,
          calls: data.calls,
        }))
        .sort((a, b) => a.date.localeCompare(b.date))
    : [];

  // Color palette
  const colors = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#F59E0B', // Yellow
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#F97316', // Orange
  ];

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Detailed Cost Breakdown</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveChart('provider')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeChart === 'provider'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            By Provider
          </button>
          <button
            onClick={() => setActiveChart('model')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeChart === 'model'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            By Model
          </button>
          <button
            onClick={() => setActiveChart('timeline')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeChart === 'timeline'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setActiveChart('tokens')}
            className={`px-4 py-2 rounded-md text-sm font-medium ${
              activeChart === 'tokens'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tokens
          </button>
        </div>
      </div>

      {/* Filters */}
      {(selectedProvider || selectedModel) && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
          <span className="text-sm font-medium text-blue-900">Filters:</span>
          {selectedProvider && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              Provider: {selectedProvider}
              <button
                onClick={() => setSelectedProvider(null)}
                className="hover:text-blue-900"
              >
                ×
              </button>
            </span>
          )}
          {selectedModel && (
            <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
              Model: {selectedModel}
              <button
                onClick={() => setSelectedModel(null)}
                className="hover:text-blue-900"
              >
                ×
              </button>
            </span>
          )}
        </div>
      )}

      {/* Chart: By Provider (Pie Chart) */}
      {activeChart === 'provider' && providerData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Cost Distribution by Provider</h3>

          {/* Simple Pie Chart Representation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Visual representation */}
            <div className="relative w-64 h-64 mx-auto">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                {providerData.reduce((acc, item, index) => {
                  const startAngle = acc.angle;
                  const angle = (item.percentage / 100) * 360;
                  const endAngle = startAngle + angle;

                  const startRad = (startAngle * Math.PI) / 180;
                  const endRad = (endAngle * Math.PI) / 180;

                  const x1 = 50 + 40 * Math.cos(startRad);
                  const y1 = 50 + 40 * Math.sin(startRad);
                  const x2 = 50 + 40 * Math.cos(endRad);
                  const y2 = 50 + 40 * Math.sin(endRad);

                  const largeArc = angle > 180 ? 1 : 0;

                  acc.elements.push(
                    <path
                      key={item.name}
                      d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                      fill={colors[index % colors.length]}
                      className="hover:opacity-80 cursor-pointer transition-opacity"
                      onClick={() => setSelectedProvider(item.name.toLowerCase())}
                    />
                  );

                  acc.angle = endAngle;
                  return acc;
                }, { angle: 0, elements: [] as React.ReactElement[] }).elements}
              </svg>
            </div>

            {/* Legend and Details */}
            <div className="space-y-3">
              {providerData.map((item, index) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => setSelectedProvider(item.name.toLowerCase())}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    ></div>
                    <div>
                      <p className="font-medium text-gray-900">{item.name}</p>
                      <p className="text-sm text-gray-600">
                        {formatNumber(item.tokens)} tokens · {formatNumber(item.calls)} calls
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(item.value)}</p>
                    <p className="text-sm text-gray-600">{item.percentage.toFixed(1)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Chart: By Model (Bar Chart) */}
      {activeChart === 'model' && modelData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Top 10 Models by Cost</h3>
          <div className="space-y-3">
            {modelData.map((item, index) => {
              const maxCost = Math.max(...modelData.map(d => d.value));
              const barWidth = (item.value / maxCost) * 100;

              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-gray-700 truncate">{item.name}</span>
                    <span className="font-semibold text-gray-900">{formatCurrency(item.value)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-8 relative overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500 flex items-center px-3"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: colors[index % colors.length],
                      }}
                    >
                      <span className="text-xs font-medium text-white">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-600">
                    <span>{formatNumber(item.tokens)} tokens</span>
                    <span>{formatNumber(item.calls)} calls</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Chart: Timeline (Line Chart) */}
      {activeChart === 'timeline' && timelineData.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Cost Over Time</h3>
          <div className="relative h-64 border border-gray-200 rounded-lg p-4">
            <svg viewBox="0 0 800 200" className="w-full h-full">
              {/* Y-axis labels */}
              {[0, 25, 50, 75, 100].map(percent => (
                <g key={percent}>
                  <line
                    x1="40"
                    y1={180 - percent * 1.6}
                    x2="780"
                    y2={180 - percent * 1.6}
                    stroke="#E5E7EB"
                    strokeWidth="1"
                  />
                  <text
                    x="10"
                    y={185 - percent * 1.6}
                    fontSize="10"
                    fill="#6B7280"
                  >
                    {formatCurrency((summary?.totalCost || 0) * (percent / 100))}
                  </text>
                </g>
              ))}

              {/* Line chart */}
              {timelineData.length > 1 && (
                <polyline
                  points={timelineData
                    .map((item, index) => {
                      const x = 40 + (index / (timelineData.length - 1)) * 740;
                      const y = 180 - (item.cost / (summary?.totalCost || 1)) * 160;
                      return `${x},${y}`;
                    })
                    .join(' ')}
                  fill="none"
                  stroke="#3B82F6"
                  strokeWidth="2"
                />
              )}

              {/* Data points */}
              {timelineData.map((item, index) => {
                const x = 40 + (index / Math.max(timelineData.length - 1, 1)) * 740;
                const y = 180 - (item.cost / (summary?.totalCost || 1)) * 160;

                return (
                  <g key={item.date}>
                    <circle cx={x} cy={y} r="4" fill="#3B82F6" />
                    {index % Math.ceil(timelineData.length / 10) === 0 && (
                      <text
                        x={x}
                        y="195"
                        fontSize="9"
                        fill="#6B7280"
                        textAnchor="middle"
                      >
                        {new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Timeline Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <p className="text-sm text-blue-700 font-medium">Peak Day</p>
              <p className="text-2xl font-bold text-blue-900 mt-1">
                {formatCurrency(Math.max(...timelineData.map(d => d.cost)))}
              </p>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <p className="text-sm text-green-700 font-medium">Average Daily</p>
              <p className="text-2xl font-bold text-green-900 mt-1">
                {formatCurrency(
                  timelineData.reduce((sum, d) => sum + d.cost, 0) / timelineData.length
                )}
              </p>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <p className="text-sm text-purple-700 font-medium">Total Days</p>
              <p className="text-2xl font-bold text-purple-900 mt-1">
                {timelineData.length}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Chart: Token Usage */}
      {activeChart === 'tokens' && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">Token Usage Analysis</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Token Distribution */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">By Provider</h4>
              {providerData.map((item, index) => {
                const maxTokens = Math.max(...providerData.map(d => d.tokens));
                const barWidth = (item.tokens / maxTokens) * 100;

                return (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{item.name}</span>
                      <span className="font-semibold text-gray-900">
                        {formatNumber(item.tokens)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-6">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: colors[index % colors.length],
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cost per Token */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium text-gray-700">Cost per 1K Tokens</h4>
              {providerData.map((item, index) => {
                const costPer1k = (item.value / item.tokens) * 1000;

                return (
                  <div
                    key={item.name}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded"
                        style={{ backgroundColor: colors[index % colors.length] }}
                      ></div>
                      <span className="font-medium text-gray-700">{item.name}</span>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(costPer1k)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* No Data Message */}
      {((activeChart === 'provider' && providerData.length === 0) ||
        (activeChart === 'model' && modelData.length === 0) ||
        (activeChart === 'timeline' && timelineData.length === 0)) && (
        <div className="text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">No data available for this time period</p>
        </div>
      )}
    </div>
  );
}
