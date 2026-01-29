/**
 * Tests for LiveCursors Component
 *
 * Tests for displaying other users' cursors in real-time
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { LiveCursors } from '../Collaboration/LiveCursors';
import type { UserPresence } from '@/hooks/usePresence';

describe('LiveCursors', () => {
  const mockUsersWithCursors: UserPresence[] = [
    {
      userId: 'user-1',
      userEmail: 'alice@example.com',
      userName: 'Alice',
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
      userName: 'Bob',
      role: 'editor',
      presenceData: {
        status: 'active',
        color: '#10B981',
        cursorX: 300,
        cursorY: 400,
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    },
  ];

  const mockUsersWithoutCursors: UserPresence[] = [
    {
      userId: 'user-3',
      userEmail: 'charlie@example.com',
      userName: 'Charlie',
      role: 'viewer',
      presenceData: {
        status: 'active',
        color: '#F59E0B',
        // No cursor position
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    },
  ];

  it('should render nothing when no active users', () => {
    const { container } = render(<LiveCursors activeUsers={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing when users have no cursor positions', () => {
    const { container } = render(<LiveCursors activeUsers={mockUsersWithoutCursors} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render cursors for users with cursor positions', () => {
    const { container } = render(<LiveCursors activeUsers={mockUsersWithCursors} />);

    // Should render 2 cursor elements
    const cursors = container.querySelectorAll('svg');
    expect(cursors.length).toBe(2);
  });

  it('should position cursor using transform style', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const cursorContainer = container.querySelector('div[style*="left"]');
    expect(cursorContainer).toHaveStyle({
      left: '100px',
      top: '200px',
    });
  });

  it('should apply user color to cursor SVG', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const cursorPath = container.querySelector('path');
    expect(cursorPath).toHaveAttribute('fill', '#3B82F6');
  });

  it('should display user name label with cursor', () => {
    const { getByText } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    expect(getByText('Alice')).toBeInTheDocument();
  });

  it('should display "Anonymous" for users without names', () => {
    const anonymousUser: UserPresence = {
      userId: 'user-4',
      userEmail: 'anon@example.com',
      userName: null,
      role: 'editor',
      presenceData: {
        status: 'active',
        color: '#EF4444',
        cursorX: 500,
        cursorY: 600,
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    };

    const { getByText } = render(<LiveCursors activeUsers={[anonymousUser]} />);

    expect(getByText('Anonymous')).toBeInTheDocument();
  });

  it('should apply user color to name label background', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const nameLabel = container.querySelector('div[style*="backgroundColor"]');
    expect(nameLabel).toHaveStyle({
      backgroundColor: '#3B82F6',
    });
  });

  it('should render multiple cursors with different positions', () => {
    const { container } = render(<LiveCursors activeUsers={mockUsersWithCursors} />);

    const cursorContainers = container.querySelectorAll('div[style*="left"]');
    expect(cursorContainers.length).toBe(2);

    // Check Alice's cursor position
    expect(cursorContainers[0]).toHaveStyle({
      left: '100px',
      top: '200px',
    });

    // Check Bob's cursor position
    expect(cursorContainers[1]).toHaveStyle({
      left: '300px',
      top: '400px',
    });
  });

  it('should have pointer-events-none class to prevent interference', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const cursorContainer = container.querySelector('.pointer-events-none');
    expect(cursorContainer).toBeInTheDocument();
  });

  it('should have high z-index to appear above content', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const cursorContainer = container.querySelector('.z-50');
    expect(cursorContainer).toBeInTheDocument();
  });

  it('should use fixed positioning', () => {
    const { container } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    const cursorContainer = container.querySelector('.fixed');
    expect(cursorContainer).toBeInTheDocument();
  });

  it('should handle cursor position updates', () => {
    const { container, rerender } = render(<LiveCursors activeUsers={[mockUsersWithCursors[0]]} />);

    let cursorContainer = container.querySelector('div[style*="left"]');
    expect(cursorContainer).toHaveStyle({
      left: '100px',
      top: '200px',
    });

    // Update cursor position
    const updatedUser: UserPresence = {
      ...mockUsersWithCursors[0],
      presenceData: {
        ...mockUsersWithCursors[0].presenceData,
        cursorX: 500,
        cursorY: 600,
      },
    };

    rerender(<LiveCursors activeUsers={[updatedUser]} />);

    cursorContainer = container.querySelector('div[style*="left"]');
    expect(cursorContainer).toHaveStyle({
      left: '500px',
      top: '600px',
    });
  });

  it('should filter out users without cursor data', () => {
    const mixedUsers = [...mockUsersWithCursors, ...mockUsersWithoutCursors];
    const { container } = render(<LiveCursors activeUsers={mixedUsers} />);

    // Should only render 2 cursors (users with cursor data)
    const cursors = container.querySelectorAll('svg');
    expect(cursors.length).toBe(2);
  });

  it('should use default color if color is not provided', () => {
    const userWithoutColor: UserPresence = {
      userId: 'user-5',
      userEmail: 'user5@example.com',
      userName: 'User 5',
      role: 'editor',
      presenceData: {
        status: 'active',
        cursorX: 100,
        cursorY: 200,
        // No color
      },
      lastSeen: new Date().toISOString(),
      isActive: true,
    };

    const { container } = render(<LiveCursors activeUsers={[userWithoutColor]} />);

    const cursorPath = container.querySelector('path');
    expect(cursorPath).toHaveAttribute('fill', '#6B7280'); // Default gray color
  });
});
