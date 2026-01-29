/**
 * Comment Thread Component
 *
 * Displays and manages comments on sessions or workflows
 * Supports threaded replies, real-time updates, and editing
 *
 * @module CommentThread
 */

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';

// ============================================================================
// Types
// ============================================================================

export type ResourceType = 'session' | 'workflow';

interface Comment {
  id: string;
  user_id: string;
  user_name: string | null;
  user_email: string;
  content: string;
  edited: boolean;
  created_at: string;
  updated_at: string;
  parent_comment_id: string | null;
}

interface CommentThreadProps {
  resourceType: ResourceType;
  resourceId: string;
  canComment?: boolean; // Can current user add comments
}

// ============================================================================
// Utilities
// ============================================================================

function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

// ============================================================================
// Component
// ============================================================================

export function CommentThread({
  resourceType,
  resourceId,
  canComment = true,
}: CommentThreadProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);

  // Fetch comments
  useEffect(() => {
    fetchComments();

    // Subscribe to real-time updates
    const tableName = resourceType === 'session' ? 'session_comments' : 'workflow_comments';
    const channel = supabase
      .channel(`comments:${resourceType}:${resourceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName,
          filter: `${resourceType}_id=eq.${resourceId}`,
        },
        () => {
          fetchComments();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [resourceType, resourceId]);

  const fetchComments = async () => {
    try {
      const tableName = resourceType === 'session' ? 'session_comments' : 'workflow_comments';

      const { data, error } = await supabase
        .from(tableName)
        .select(`
          id,
          user_id,
          content,
          edited,
          created_at,
          updated_at,
          parent_comment_id,
          users!inner (
            full_name,
            email
          )
        `)
        .eq(`${resourceType}_id`, resourceId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const formattedComments: Comment[] = (data || []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        user_name: row.users.full_name,
        user_email: row.users.email,
        content: row.content,
        edited: row.edited,
        created_at: row.created_at,
        updated_at: row.updated_at,
        parent_comment_id: row.parent_comment_id,
      }));

      setComments(formattedComments);
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || !user) return;

    setIsPosting(true);
    try {
      const tableName = resourceType === 'session' ? 'session_comments' : 'workflow_comments';

      const { error } = await supabase.from(tableName).insert({
        [`${resourceType}_id`]: resourceId,
        user_id: user.id,
        content: newComment.trim(),
      });

      if (error) throw error;

      setNewComment('');
    } catch (error) {
      console.error('Error posting comment:', error);
      alert('Failed to post comment');
    } finally {
      setIsPosting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim()) return;

    try {
      const tableName = resourceType === 'session' ? 'session_comments' : 'workflow_comments';

      const { error } = await supabase
        .from(tableName)
        .update({
          content: editContent.trim(),
          edited: true,
        })
        .eq('id', commentId);

      if (error) throw error;

      setEditingId(null);
      setEditContent('');
    } catch (error) {
      console.error('Error editing comment:', error);
      alert('Failed to edit comment');
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm('Delete this comment?')) return;

    try {
      const tableName = resourceType === 'session' ? 'session_comments' : 'workflow_comments';

      const { error } = await supabase.from(tableName).delete().eq('id', commentId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting comment:', error);
      alert('Failed to delete comment');
    }
  };

  if (isLoading) {
    return <div className="text-center py-4 text-gray-500">Loading comments...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Comment List */}
      {comments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No comments yet. Be the first to comment!
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(comment => {
            const isEditing = editingId === comment.id;
            const isOwner = user?.id === comment.user_id;

            return (
              <div key={comment.id} className="bg-white border border-gray-200 rounded-lg p-4">
                {/* Header */}
                <div className="flex items-start gap-3 mb-2">
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs font-medium text-white flex-shrink-0">
                    {getInitials(comment.user_name, comment.user_email)}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {comment.user_name || comment.user_email}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatTimeAgo(comment.created_at)}
                        {comment.edited && ' (edited)'}
                      </p>
                    </div>

                    {/* Content */}
                    {isEditing ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          value={editContent}
                          onChange={e => setEditContent(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                          rows={3}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditComment(comment.id)}
                            className="px-3 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingId(null);
                              setEditContent('');
                            }}
                            className="px-3 py-1 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  {isOwner && !isEditing && (
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingId(comment.id);
                          setEditContent(comment.content);
                        }}
                        className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="px-2 py-1 text-xs text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Comment Form */}
      {canComment && user && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <textarea
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            disabled={isPosting}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm disabled:bg-gray-100"
            rows={3}
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={handlePostComment}
              disabled={isPosting || !newComment.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {isPosting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
