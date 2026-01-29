/**
 * Tests for UsageDashboard Component
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UsageDashboard } from '../UsageDashboard';
import { useAuth } from '@/hooks/useAuth';
import { useUsageMetrics } from '@/hooks/useUsageMetrics';

// Mock hooks
vi.mock('@/hooks/useAuth');
vi.mock('@/hooks/useUsageMetrics');

describe('UsageDashboard', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    organization_id: 'org-456',
  };

  const mockSummary = {
    totalCost: 125.50,
    totalCalls: 1000,
    totalTokens: 500000,
    byProvider: {
      openai: { cost: 75.0, calls: 600, tokens: 300000 },
      anthropic: { cost: 50.5, calls: 400, tokens: 200000 },
    },
    byModel: {
      'gpt-4': { cost: 60.0, calls: 500, tokens: 250000 },
      'gpt-3.5-turbo': { cost: 15.0, calls: 100, tokens: 50000 },
      'claude-3-5-sonnet-20241022': { cost: 40.5, calls: 300, tokens: 150000 },
      'claude-3-opus-20240229': { cost: 10.0, calls: 100, tokens: 50000 },
    },
    byDay: {},
  };

  const mockQuotas = [
    {
      type: 'daily',
      provider: null,
      model: null,
      limit: 100.0,
      current: 75.0,
      percentage: 75.0,
      resetAt: new Date('2024-12-31T23:59:59Z').toISOString(),
    },
    {
      type: 'monthly',
      provider: null,
      model: null,
      limit: 1000.0,
      current: 500.0,
      percentage: 50.0,
      resetAt: new Date('2024-12-31T23:59:59Z').toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      isLoading: false,
      error: null,
    } as any);

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: mockSummary,
      quotas: mockQuotas,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });
  });

  it('should render loading state', () => {
    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: null,
      quotas: [],
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should render error state', () => {
    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: null,
      quotas: [],
      isLoading: false,
      error: 'Failed to load usage data',
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    expect(screen.getByText(/Error loading usage data/i)).toBeInTheDocument();
    expect(screen.getByText(/Failed to load usage data/i)).toBeInTheDocument();
  });

  it('should display total cost', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/Total Cost/i)).toBeInTheDocument();
    expect(screen.getByText('$125.50')).toBeInTheDocument();
  });

  it('should display total API calls', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/API Calls/i)).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
  });

  it('should display total tokens', () => {
    render(<UsageDashboard />);

    expect(screen.getByText('500,000 tokens')).toBeInTheDocument();
  });

  it('should display average cost per call', () => {
    render(<UsageDashboard />);

    // $125.50 / 1000 calls = $0.1255 per call
    expect(screen.getByText(/Avg: \$0\.125500 per call/i)).toBeInTheDocument();
  });

  it('should display cost per 1K tokens', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/Cost per 1K Tokens/i)).toBeInTheDocument();
    // ($125.50 / 500000) * 1000 = $0.251
    expect(screen.getByText('$0.251000')).toBeInTheDocument();
  });

  it('should render time range selector', () => {
    render(<UsageDashboard />);

    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 30 Days')).toBeInTheDocument();
    expect(screen.getByText('Last 90 Days')).toBeInTheDocument();
    expect(screen.getByText('Custom Range')).toBeInTheDocument();
  });

  it('should change time range when button clicked', () => {
    render(<UsageDashboard />);

    const button7Days = screen.getByText('Last 7 Days');
    fireEvent.click(button7Days);

    expect(button7Days).toHaveClass('bg-blue-600');
  });

  it('should show custom date inputs when custom range selected', () => {
    render(<UsageDashboard />);

    const customButton = screen.getByText('Custom Range');
    fireEvent.click(customButton);

    expect(screen.getByLabelText(/Start Date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/End Date/i)).toBeInTheDocument();
  });

  it('should display quota progress bars', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/Daily Quota/i)).toBeInTheDocument();
    expect(screen.getByText(/Monthly Quota/i)).toBeInTheDocument();
    expect(screen.getByText('$75.00 / $100.00')).toBeInTheDocument();
    expect(screen.getByText('$500.00 / $1,000.00')).toBeInTheDocument();
  });

  it('should show warning for quota above 75%', () => {
    render(<UsageDashboard />);

    expect(
      screen.getByText(/⚠️ Approaching quota limit/i)
    ).toBeInTheDocument();
  });

  it('should use correct color for quota percentage', () => {
    render(<UsageDashboard />);

    const quotaBars = screen.getAllByRole('progressbar', { hidden: true });

    // Daily quota at 75% should be yellow
    expect(quotaBars[0]).toHaveClass('bg-yellow-500');

    // Monthly quota at 50% should be blue
    expect(quotaBars[1]).toHaveClass('bg-blue-500');
  });

  it('should display cost by provider', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/Cost by Provider/i)).toBeInTheDocument();
    expect(screen.getByText('Openai')).toBeInTheDocument();
    expect(screen.getByText('Anthropic')).toBeInTheDocument();
    expect(screen.getByText('$75.00')).toBeInTheDocument();
    expect(screen.getByText('$50.50')).toBeInTheDocument();
  });

  it('should display top models by cost', () => {
    render(<UsageDashboard />);

    expect(screen.getByText(/Top Models by Cost/i)).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('claude-3-5-sonnet-20241022')).toBeInTheDocument();
    expect(screen.getByText('$60.00')).toBeInTheDocument();
    expect(screen.getByText('$40.50')).toBeInTheDocument();
  });

  it('should sort models by cost in descending order', () => {
    render(<UsageDashboard />);

    const modelNames = screen.getAllByText(/^(gpt-4|gpt-3\.5-turbo|claude)/);

    // First should be gpt-4 ($60), last should be claude-3-opus ($10)
    expect(modelNames[0]).toHaveTextContent('gpt-4');
  });

  it('should limit to top 5 models', () => {
    const largeSummary = {
      totalCost: 490,
      totalCalls: 7,
      totalTokens: 7,
      byProvider: {},
      byDay: {},
      byModel: {
        model1: { cost: 100, calls: 1, tokens: 1 },
        model2: { cost: 90, calls: 1, tokens: 1 },
        model3: { cost: 80, calls: 1, tokens: 1 },
        model4: { cost: 70, calls: 1, tokens: 1 },
        model5: { cost: 60, calls: 1, tokens: 1 },
        model6: { cost: 50, calls: 1, tokens: 1 },
        model7: { cost: 40, calls: 1, tokens: 1 },
      },
    };

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: largeSummary,
      quotas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    // Should only show top 5
    expect(screen.queryByText('model6')).not.toBeInTheDocument();
    expect(screen.queryByText('model7')).not.toBeInTheDocument();
  });

  it('should call exportToCsv when export button clicked', () => {
    const mockExport = vi.fn();

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: mockSummary,
      quotas: mockQuotas,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      exportToCsv: mockExport,
    });

    render(<UsageDashboard />);

    const exportButton = screen.getByText('Export to CSV');
    fireEvent.click(exportButton);

    expect(mockExport).toHaveBeenCalledTimes(1);
  });

  it('should toggle detailed breakdown', () => {
    render(<UsageDashboard />);

    const toggleButton = screen.getByText('Show Detailed Breakdown');
    fireEvent.click(toggleButton);

    expect(screen.getByText('Hide Detailed Breakdown')).toBeInTheDocument();
  });

  it('should call refetch when retry button clicked in error state', () => {
    const mockRefetch = vi.fn();

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: null,
      quotas: [],
      isLoading: false,
      error: 'Network error',
      refetch: mockRefetch,
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    const retryButton = screen.getByText('Retry');
    fireEvent.click(retryButton);

    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it('should auto-refresh every 30 seconds', () => {
    vi.useFakeTimers();
    const mockRefetch = vi.fn();

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: mockSummary,
      quotas: mockQuotas,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    // Fast-forward 30 seconds
    vi.advanceTimersByTime(30000);

    expect(mockRefetch).toHaveBeenCalledTimes(1);

    // Fast-forward another 30 seconds
    vi.advanceTimersByTime(30000);

    expect(mockRefetch).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it('should cleanup auto-refresh on unmount', () => {
    vi.useFakeTimers();
    const mockRefetch = vi.fn();

    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: mockSummary,
      quotas: mockQuotas,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
      exportToCsv: vi.fn(),
    });

    const { unmount } = render(<UsageDashboard />);

    unmount();

    // Fast-forward 30 seconds after unmount
    vi.advanceTimersByTime(30000);

    // Should not call refetch after unmount
    expect(mockRefetch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should format currency correctly', () => {
    render(<UsageDashboard />);

    // Should show up to 6 decimal places for small amounts
    expect(screen.getByText(/\$0\.251000/)).toBeInTheDocument();

    // Should show 2 decimal places for larger amounts
    expect(screen.getByText(/\$125\.50/)).toBeInTheDocument();
  });

  it('should format large numbers with commas', () => {
    render(<UsageDashboard />);

    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getByText('500,000 tokens')).toBeInTheDocument();
  });

  it('should handle missing summary data gracefully', () => {
    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: null,
      quotas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByText(/Cost by Provider/i)).not.toBeInTheDocument();
  });

  it('should handle empty quotas array', () => {
    vi.mocked(useUsageMetrics).mockReturnValue({
      summary: mockSummary,
      quotas: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      exportToCsv: vi.fn(),
    });

    render(<UsageDashboard />);

    expect(screen.queryByText(/Quota Usage/i)).not.toBeInTheDocument();
  });

  it('should pass correct parameters to useUsageMetrics', () => {
    render(<UsageDashboard />);

    expect(useUsageMetrics).toHaveBeenCalledWith({
      timeRange: '30days',
      startDate: null,
      endDate: null,
      userId: mockUser.id,
      organizationId: mockUser.organization_id,
    });
  });
});
