/**
 * Tests for PresenceIndicator Component
 *
 * Tests for displaying active user avatars with online status
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PresenceIndicator } from '../Collaboration/PresenceIndicator';
import type { UserPresence } from '@/hooks/usePresence';

describe('PresenceIndicator', () => {
  const mockUsers: UserPresence[] = [
    {
      userId: 'user-1',
      userEmail: 'alice@example.com',
      userName: 'Alice Smith',
      role: 'editor',
      presenceData: {
        status: 'active',
        color: '#3B82F6',
        cursorX: 100,
        cursorY: 200,
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    },
    {
      userId: 'user-2',
      userEmail: 'bob@example.com',
      userName: 'Bob Jones',
      role: 'editor',
      presenceData: {
        status: 'active',
        color: '#10B981',
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    },
    {
      userId: 'user-3',
      userEmail: 'charlie@example.com',
      userName: null,
      role: 'viewer',
      presenceData: {
        status: 'idle',
        color: '#F59E0B',
      },
      lastSeen: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      isActive: false,
    },
  ];

  it('should render nothing when no active users', () => {
    const { container } = render(<PresenceIndicator activeUsers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render avatars for active users', () => {
    render(<PresenceIndicator activeUsers={mockUsers} />);

    // Should show user initials
    expect(screen.getByText('AS')).toBeInTheDocument(); // Alice Smith
    expect(screen.getByText('BJ')).toBeInTheDocument(); // Bob Jones
  });

  it('should show email initials when userName is null', () => {
    render(<PresenceIndicator activeUsers={mockUsers} />);

    // Charlie has no userName, should use email
    expect(screen.getByText('C')).toBeInTheDocument(); // charlie@example.com
  });

  it('should display online indicator for active users', () => {
    const { container } = render(<PresenceIndicator activeUsers={mockUsers} />);

    // Active users should have green dot (bg-green-500)
    const greenDots = container.querySelectorAll('.bg-green-500');
    expect(greenDots.length).toBe(2); // Alice and Bob are active
  });

  it('should not display online indicator for inactive users', () => {
    const inactiveUsers: UserPresence[] = [
      {
        ...mockUsers[2],
        isActive: false,
      },
    ];

    const { container } = render(<PresenceIndicator activeUsers={inactiveUsers} />);

    const greenDots = container.querySelectorAll('.bg-green-500');
    expect(greenDots.length).toBe(0);
  });

  it('should apply user color to avatar background', () => {
    const { container } = render(<PresenceIndicator activeUsers={[mockUsers[0]]} />);

    // Find avatar with Alice's color
    const avatar = container.querySelector('[style*="#3B82F6"]');
    expect(avatar).toBeInTheDocument();
  });

  it('should limit displayed users with maxDisplay prop', () => {
    render(<PresenceIndicator activeUsers={mockUsers} maxDisplay={2} />);

    // Should show 2 avatars + overflow indicator
    expect(screen.getByText('AS')).toBeInTheDocument();
    expect(screen.getByText('BJ')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument(); // +1 more user
  });

  it('should render small size variant', () => {
    const { container } = render(<PresenceIndicator activeUsers={[mockUsers[0]]} size="sm" />);

    // Small size should have w-6 h-6 classes
    const avatar = container.querySelector('.w-6.h-6');
    expect(avatar).toBeInTheDocument();
  });

  it('should render medium size variant (default)', () => {
    const { container } = render(<PresenceIndicator activeUsers={[mockUsers[0]]} />);

    // Medium size should have w-8 h-8 classes
    const avatar = container.querySelector('.w-8.h-8');
    expect(avatar).toBeInTheDocument();
  });

  it('should render large size variant', () => {
    const { container } = render(<PresenceIndicator activeUsers={[mockUsers[0]]} size="lg" />);

    // Large size should have w-10 h-10 classes
    const avatar = container.querySelector('.w-10.h-10');
    expect(avatar).toBeInTheDocument();
  });

  it('should show tooltip with user name on hover', () => {
    render(<PresenceIndicator activeUsers={[mockUsers[0]]} />);

    // Should have title attribute for tooltip
    const avatar = screen.getByText('AS').parentElement;
    expect(avatar).toHaveAttribute('title', 'Alice Smith');
  });

  it('should handle users with single-word names', () => {
    const singleNameUser: UserPresence = {
      userId: 'user-4',
      userEmail: 'david@example.com',
      userName: 'David',
      role: 'editor',
      presenceData: { status: 'active', color: '#EF4444' },
      lastSeen: new Date().toISOString(),
      isActive: true,
    };

    render(<PresenceIndicator activeUsers={[singleNameUser]} />);

    // Should show first letter for single-word name
    expect(screen.getByText('D')).toBeInTheDocument();
  });

  it('should handle overflow count correctly', () => {
    const manyUsers: UserPresence[] = Array.from({ length: 10 }, (_, i) => ({
      userId: `user-${i}`,
      userEmail: `user${i}@example.com`,
      userName: `User ${i}`,
      role: 'editor',
      presenceData: { status: 'active' as const, color: '#3B82F6' },
      lastSeen: new Date().toISOString(),
      isActive: true,
    }));

    render(<PresenceIndicator activeUsers={manyUsers} maxDisplay={3} />);

    // Should show +7 (10 total - 3 displayed)
    expect(screen.getByText('+7')).toBeInTheDocument();
  });
});
