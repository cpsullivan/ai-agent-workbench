/**
 * Live Cursors Component
 *
 * Displays other users' cursors in real-time during collaborative editing
 * Shows cursor position with user name label and color-coding
 *
 * @module LiveCursors
 */

import { useEffect, useState } from 'react';
import type { UserPresence } from '@/hooks/usePresence';

// ============================================================================
// Types
// ============================================================================

interface LiveCursorsProps {
  activeUsers: UserPresence[];
}

interface CursorPosition {
  userId: string;
  userName: string | null;
  color: string;
  x: number;
  y: number;
}

// ============================================================================
// Component
// ============================================================================

export function LiveCursors({ activeUsers }: LiveCursorsProps) {
  const [cursorPositions, setCursorPositions] = useState<CursorPosition[]>([]);

  // Update cursor positions when active users change
  useEffect(() => {
    const positions: CursorPosition[] = activeUsers
      .filter(user => user.presenceData.cursorX !== undefined && user.presenceData.cursorY !== undefined)
      .map(user => ({
        userId: user.userId,
        userName: user.userName,
        color: user.presenceData.color || '#6B7280',
        x: user.presenceData.cursorX!,
        y: user.presenceData.cursorY!,
      }));

    setCursorPositions(positions);
  }, [activeUsers]);

  if (cursorPositions.length === 0) {
    return null;
  }

  return (
    <>
      {cursorPositions.map(cursor => (
        <div
          key={cursor.userId}
          className="pointer-events-none fixed z-50 transition-all duration-100"
          style={{
            left: `${cursor.x}px`,
            top: `${cursor.y}px`,
            transform: 'translate(-2px, -2px)',
          }}
        >
          {/* Cursor SVG */}
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))' }}
          >
            <path
              d="M5 3L19 12L12 13L9 20L5 3Z"
              fill={cursor.color}
              stroke="white"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          </svg>

          {/* User name label */}
          <div
            className="absolute top-5 left-3 px-2 py-1 text-xs font-medium text-white rounded shadow-lg whitespace-nowrap"
            style={{
              backgroundColor: cursor.color,
            }}
          >
            {cursor.userName || 'Anonymous'}
          </div>
        </div>
      ))}
    </>
  );
}
