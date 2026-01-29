/**
 * Collaborator List Component
 *
 * Displays detailed list of all collaborators with roles and status
 * Allows managing collaborator permissions (owner/editor/viewer)
 *
 * @module CollaboratorList
 */

import { useState } from 'react';
import type { UserPresence } from '@/hooks/usePresence';

// ============================================================================
// Types
// ============================================================================

interface CollaboratorListProps {
  collaborators: UserPresence[];
  currentUserId: string;
  onRemoveCollaborator?: (userId: string) => Promise<void>;
  onChangeRole?: (userId: string, newRole: string) => Promise<void>;
  canManage?: boolean; // Can current user manage collaborators
}

// ============================================================================
// Utilities
// ============================================================================

function getRoleBadgeColor(role: string): string {
  switch (role) {
    case 'owner':
      return 'bg-purple-100 text-purple-800';
    case 'editor':
      return 'bg-blue-100 text-blue-800';
    case 'viewer':
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.split(' ');
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

function formatLastSeen(lastSeen: string): string {
  const date = new Date(lastSeen);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

// ============================================================================
// Component
// ============================================================================

export function CollaboratorList({
  collaborators,
  currentUserId,
  onRemoveCollaborator,
  onChangeRole,
  canManage = false,
}: CollaboratorListProps) {
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);

  const handleRemove = async (userId: string, userName: string | null) => {
    if (!onRemoveCollaborator) return;

    if (window.confirm(`Remove ${userName || 'this user'} from collaborators?`)) {
      setRemovingUserId(userId);
      try {
        await onRemoveCollaborator(userId);
      } catch (error) {
        alert(`Failed to remove collaborator: ${error instanceof Error ? error.message : 'Unknown error'}`);
      } finally {
        setRemovingUserId(null);
      }
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!onChangeRole) return;

    setChangingRoleUserId(userId);
    try {
      await onChangeRole(userId, newRole);
    } catch (error) {
      alert(`Failed to change role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setChangingRoleUserId(null);
    }
  };

  if (collaborators.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No collaborators yet. Invite users to start collaborating!
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {collaborators.map(collaborator => {
        const isCurrentUser = collaborator.userId === currentUserId;
        const isOwner = collaborator.role === 'owner';

        return (
          <div
            key={collaborator.userId}
            className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
          >
            {/* User Info */}
            <div className="flex items-center gap-3 flex-1">
              {/* Avatar */}
              <div className="relative">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white bg-gray-500"
                  style={{
                    backgroundColor: collaborator.presenceData.color || '#6B7280',
                  }}
                >
                  {getInitials(collaborator.userName)}
                </div>
                {/* Active indicator */}
                {collaborator.isActive && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
                )}
              </div>

              {/* Name and Email */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {collaborator.userName || collaborator.userEmail}
                    {isCurrentUser && <span className="text-gray-500 ml-1">(You)</span>}
                  </p>
                  {collaborator.isActive && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium text-green-800 bg-green-100 rounded">
                      Online
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {collaborator.userName ? collaborator.userEmail : ''}
                </p>
                {!collaborator.isActive && (
                  <p className="text-xs text-gray-400">
                    Last seen {formatLastSeen(collaborator.lastSeen)}
                  </p>
                )}
              </div>
            </div>

            {/* Role and Actions */}
            <div className="flex items-center gap-2">
              {/* Role */}
              {canManage && !isCurrentUser && !isOwner ? (
                <select
                  value={collaborator.role}
                  onChange={e => handleRoleChange(collaborator.userId, e.target.value)}
                  disabled={changingRoleUserId === collaborator.userId}
                  className="px-2 py-1 text-xs font-medium border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="owner">Owner</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              ) : (
                <span
                  className={`px-2 py-1 text-xs font-medium rounded ${getRoleBadgeColor(collaborator.role)}`}
                >
                  {collaborator.role.charAt(0).toUpperCase() + collaborator.role.slice(1)}
                </span>
              )}

              {/* Remove Button */}
              {canManage && !isCurrentUser && !isOwner && onRemoveCollaborator && (
                <button
                  onClick={() => handleRemove(collaborator.userId, collaborator.userName)}
                  disabled={removingUserId === collaborator.userId}
                  className="px-2 py-1 text-xs font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                  title="Remove collaborator"
                >
                  {removingUserId === collaborator.userId ? 'Removing...' : 'Remove'}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
