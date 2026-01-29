/**
 * Presence Indicator Component
 *
 * Displays avatars of active collaborators in real-time
 * Shows who's currently viewing/editing the resource
 *
 * @module PresenceIndicator
 */

import type { UserPresence } from '@/hooks/usePresence';

// ============================================================================
// Types
// ============================================================================

interface PresenceIndicatorProps {
  activeUsers: UserPresence[];
  maxDisplay?: number; // Default: 5
  size?: 'sm' | 'md' | 'lg'; // Default: 'md'
  showTooltip?: boolean; // Default: true
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Get initials from name
 */
function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

/**
 * Get size classes
 */
function getSizeClasses(size: 'sm' | 'md' | 'lg'): {
  avatar: string;
  text: string;
  overlap: string;
} {
  switch (size) {
    case 'sm':
      return {
        avatar: 'w-6 h-6',
        text: 'text-xs',
        overlap: '-ml-1',
      };
    case 'lg':
      return {
        avatar: 'w-10 h-10',
        text: 'text-base',
        overlap: '-ml-2',
      };
    case 'md':
    default:
      return {
        avatar: 'w-8 h-8',
        text: 'text-sm',
        overlap: '-ml-1.5',
      };
  }
}

// ============================================================================
// Component
// ============================================================================

export function PresenceIndicator({
  activeUsers,
  maxDisplay = 5,
  size = 'md',
  showTooltip = true,
}: PresenceIndicatorProps) {
  const sizeClasses = getSizeClasses(size);
  const displayUsers = activeUsers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, activeUsers.length - maxDisplay);

  if (activeUsers.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center">
      {/* Avatar List */}
      <div className="flex items-center">
        {displayUsers.map((user, index) => (
          <div
            key={user.userId}
            className={`relative ${index > 0 ? sizeClasses.overlap : ''}`}
            title={showTooltip ? `${user.userName || user.userEmail} (${user.role})` : undefined}
          >
            {/* Avatar with color border */}
            <div
              className={`${sizeClasses.avatar} rounded-full flex items-center justify-center ${sizeClasses.text} font-medium text-white bg-gray-500 border-2 border-white shadow-sm`}
              style={{
                backgroundColor: user.presenceData.color || '#6B7280',
                borderColor: 'white',
              }}
            >
              {getInitials(user.userName)}
            </div>

            {/* Active indicator (green dot) */}
            {user.isActive && (
              <div className="absolute bottom-0 right-0 w-2 h-2 bg-green-500 border border-white rounded-full"></div>
            )}
          </div>
        ))}

        {/* Remaining count */}
        {remainingCount > 0 && (
          <div
            className={`${sizeClasses.avatar} ${sizeClasses.overlap} rounded-full flex items-center justify-center ${sizeClasses.text} font-medium text-gray-700 bg-gray-200 border-2 border-white shadow-sm`}
            title={showTooltip ? `${remainingCount} more` : undefined}
          >
            +{remainingCount}
          </div>
        )}
      </div>

      {/* Active users count */}
      <span className="ml-2 text-sm text-gray-600">
        {activeUsers.length} {activeUsers.length === 1 ? 'user' : 'users'} online
      </span>
    </div>
  );
}
