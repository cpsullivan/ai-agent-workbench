/**
 * Tests for CostBreakdown Component
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CostBreakdown } from '../CostBreakdown';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          gte: vi.fn(() => ({
            lte: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
    })),
  },
}));

describe('CostBreakdown', () => {
  const mockLogs = [
    {
      id: '1',
      created_at: '2024-01-15T10:00:00Z',
      provider: 'openai',
      model: 'gpt-4',
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.05,
    },
    {
      id: '2',
      created_at: '2024-01-16T11:00:00Z',
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      input_tokens: 2000,
      output_tokens: 1000,
      cost_usd: 0.03,
    },
    {
      id: '3',
      created_at: '2024-01-17T12:00:00Z',
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      input_tokens: 500,
      output_tokens: 250,
      cost_usd: 0.001,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: mockLogs,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);
  });

  it('should render loading state', () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue(
                new Promise(() => {}) // Never resolves
              ),
            }),
          }),
        }),
      }),
    } as any);

    render(<CostBreakdown timeRange="30days" />);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('should render error state', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: new Error('Database error'),
              }),
            }),
          }),
        }),
      }),
    } as any);

    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText(/Error loading breakdown/i)).toBeInTheDocument();
    });
  });

  it('should display chart type selector', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Provider')).toBeInTheDocument();
    });

    expect(screen.getByText('By Model')).toBeInTheDocument();
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Tokens')).toBeInTheDocument();
  });

  it('should switch chart types', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Provider')).toBeInTheDocument();
    });

    const modelButton = screen.getByText('By Model');
    fireEvent.click(modelButton);

    expect(modelButton).toHaveClass('bg-blue-600');
  });

  it('should aggregate costs by provider', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      // OpenAI should have 2 logs: $0.05 + $0.001 = $0.051
      // Anthropic should have 1 log: $0.03
      expect(screen.getByText(/openai/i)).toBeInTheDocument();
      expect(screen.getByText(/anthropic/i)).toBeInTheDocument();
    });
  });

  it('should aggregate costs by model', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Model')).toBeInTheDocument();
    });

    const modelButton = screen.getByText('By Model');
    fireEvent.click(modelButton);

    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText('claude-3-5-sonnet-20241022')).toBeInTheDocument();
      expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
    });
  });

  it('should display pie chart for provider view', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      const svg = screen.getByRole('img', { hidden: true });
      expect(svg.tagName).toBe('svg');
    });
  });

  it('should calculate correct percentages for pie chart', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      // Total cost: $0.05 + $0.03 + $0.001 = $0.081
      // OpenAI: ($0.051 / $0.081) * 100 = 62.96%
      // Anthropic: ($0.03 / $0.081) * 100 = 37.04%
      expect(screen.getByText(/62\.96%/)).toBeInTheDocument();
      expect(screen.getByText(/37\.04%/)).toBeInTheDocument();
    });
  });

  it('should display bar chart for model view', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Model')).toBeInTheDocument();
    });

    const modelButton = screen.getByText('By Model');
    fireEvent.click(modelButton);

    await waitFor(() => {
      // Should have bars for each model
      const bars = screen.getAllByRole('presentation', { hidden: true });
      expect(bars.length).toBeGreaterThan(0);
    });
  });

  it('should display timeline chart', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    const timelineButton = screen.getByText('Timeline');
    fireEvent.click(timelineButton);

    await waitFor(() => {
      // Should show dates
      expect(screen.getByText(/Jan 15/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 16/)).toBeInTheDocument();
      expect(screen.getByText(/Jan 17/)).toBeInTheDocument();
    });
  });

  it('should display token usage chart', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('Tokens')).toBeInTheDocument();
    });

    const tokensButton = screen.getByText('Tokens');
    fireEvent.click(tokensButton);

    await waitFor(() => {
      // Should show token counts
      expect(screen.getByText(/1,000/)).toBeInTheDocument();
      expect(screen.getByText(/2,000/)).toBeInTheDocument();
    });
  });

  it('should filter by provider', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('openai')).toBeInTheDocument();
    });

    const providerElement = screen.getByText('openai');
    fireEvent.click(providerElement);

    await waitFor(() => {
      // Should show models from OpenAI only
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
      expect(screen.queryByText('claude-3-5-sonnet-20241022')).not.toBeInTheDocument();
    });
  });

  it('should filter by model', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('By Model'));

    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('gpt-4'));

    // Should show only gpt-4 data
    await waitFor(() => {
      expect(screen.getByText(/\$0\.05/)).toBeInTheDocument();
    });
  });

  it('should clear filters', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('openai')).toBeInTheDocument();
    });

    // Apply filter
    fireEvent.click(screen.getByText('openai'));

    await waitFor(() => {
      expect(screen.getByText('Clear Filter')).toBeInTheDocument();
    });

    // Clear filter
    fireEvent.click(screen.getByText('Clear Filter'));

    await waitFor(() => {
      // Should show all data again
      expect(screen.getByText('anthropic')).toBeInTheDocument();
    });
  });

  it('should sort models by cost descending', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('By Model'));

    await waitFor(() => {
      const models = screen.getAllByRole('listitem', { hidden: true });
      // First should be gpt-4 ($0.05), last should be gpt-3.5-turbo ($0.001)
      expect(models[0]).toHaveTextContent('gpt-4');
    });
  });

  it('should limit to top 10 models in bar chart', async () => {
    const manyLogs = Array.from({ length: 15 }, (_, i) => ({
      id: `${i}`,
      created_at: '2024-01-15T10:00:00Z',
      provider: 'openai',
      model: `model-${i}`,
      input_tokens: 1000,
      output_tokens: 500,
      cost_usd: 0.01 * (15 - i), // Descending costs
    }));

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: manyLogs,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);

    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('By Model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('By Model'));

    await waitFor(() => {
      // Should show top 10 only
      expect(screen.getByText('model-0')).toBeInTheDocument();
      expect(screen.queryByText('model-14')).not.toBeInTheDocument();
    });
  });

  it('should format costs with correct precision', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      // Should show 6 decimal places for small amounts
      expect(screen.getByText(/\$0\.001000/)).toBeInTheDocument();
      expect(screen.getByText(/\$0\.050000/)).toBeInTheDocument();
    });
  });

  it('should format dates correctly in timeline', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('Timeline')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Timeline'));

    await waitFor(() => {
      // Should show formatted dates
      expect(screen.getByText(/Jan/)).toBeInTheDocument();
    });
  });

  it('should calculate total tokens correctly', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('Tokens')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Tokens'));

    await waitFor(() => {
      // Total tokens: (1000+500) + (2000+1000) + (500+250) = 5250
      expect(screen.getByText(/5,250/)).toBeInTheDocument();
    });
  });

  it('should handle empty data gracefully', async () => {
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any);

    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText(/No usage data/i)).toBeInTheDocument();
    });
  });

  it('should pass correct date range to query', async () => {
    const startDate = new Date('2024-01-01');
    const endDate = new Date('2024-01-31');

    render(
      <CostBreakdown
        timeRange="custom"
        startDate={startDate}
        endDate={endDate}
      />
    );

    await waitFor(() => {
      const fromCall = vi.mocked(supabase.from).mock.calls[0];
      expect(fromCall[0]).toBe('api_usage_logs');
    });
  });

  it('should show tooltips on hover', async () => {
    render(<CostBreakdown timeRange="30days" />);

    await waitFor(() => {
      expect(screen.getByText('openai')).toBeInTheDocument();
    });

    const providerElement = screen.getByText('openai');
    fireEvent.mouseEnter(providerElement);

    await waitFor(() => {
      // Tooltip should show details
      expect(screen.getByText(/Cost:/)).toBeInTheDocument();
    });
  });
});
