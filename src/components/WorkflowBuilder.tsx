/**
 * Workflow Builder Component
 *
 * FOUNDATIONAL IMPLEMENTATION for Phase 1.4
 * Provides workflow creation/editing UI with database persistence
 *
 * FUTURE (Phase 2):
 * - Visual drag-and-drop canvas (react-flow integration)
 * - Node library with 25+ tool nodes
 * - Control flow nodes (conditionals, loops)
 * - Full execution engine
 *
 * @module WorkflowBuilder
 */

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useWorkflowPersistence } from '@/hooks/useWorkflowPersistence';
import { useWorkflowVersioning } from '@/hooks/useWorkflowVersioning';
import { usePresence } from '@/hooks/usePresence';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { PresenceIndicator } from './Collaboration/PresenceIndicator';
import { InviteModal } from './Collaboration/InviteModal';
import { CommentThread } from './Collaboration/CommentThread';

// ============================================================================
// Types
// ============================================================================

interface WorkflowNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

interface WorkflowData {
  nodes: WorkflowNode[];
  edges: Array<{ from: string; to: string }>;
}

interface WorkflowBuilderProps {
  workflowId?: string;
  onClose?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowBuilder({ workflowId, onClose }: WorkflowBuilderProps) {
  const { user } = useAuth();
  const [isEditing, setIsEditing] = useState(!workflowId);
  const [workflowName, setWorkflowName] = useState('');
  const [workflowDescription, setWorkflowDescription] = useState('');
  const [workflowCategory, setWorkflowCategory] = useState('automation');
  const [workflowData, setWorkflowData] = useState<WorkflowData>({
    nodes: [],
    edges: [],
  });
  const [changelog, setChangelog] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showComments, setShowComments] = useState(false);

  // Hooks
  const {
    workflow,
    isLoadingWorkflow,
    createWorkflow,
    updateWorkflow,
    isCreating,
    isUpdating,
    createError,
    updateError,
  } = useWorkflowPersistence(workflowId);

  const {
    versions,
    latestVersion,
    isLoadingVersions,
    createVersion,
    isCreatingVersion,
    createError: versionError,
  } = useWorkflowVersioning(workflowId);

  // Presence tracking
  const presence = usePresence({
    resourceType: 'workflow',
    resourceId: workflowId || '',
    enabled: !!workflowId,
  });

  // Real-time collaboration
  const collaboration = useRealtimeCollaboration<WorkflowData>({
    resourceType: 'workflow',
    resourceId: workflowId || '',
    initialState: workflowData,
    userId: user?.id || '',
    enableOT: true,
    onRemoteChange: (newData, operation) => {
      // Update workflow data when remote changes arrive
      setWorkflowData(newData);
      console.log('Remote change applied to workflow:', operation);
    },
  });

  // Load workflow data when workflow loads
  useEffect(() => {
    if (workflow && latestVersion) {
      setWorkflowName(workflow.name);
      setWorkflowDescription(workflow.description || '');
      setWorkflowCategory(workflow.category || 'automation');
      setWorkflowData(latestVersion.workflow_data as WorkflowData);
      setIsEditing(false);
    }
  }, [workflow, latestVersion]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleCreate = () => {
    if (!workflowName.trim()) {
      alert('Please enter a workflow name');
      return;
    }

    createWorkflow(
      {
        name: workflowName,
        description: workflowDescription,
        category: workflowCategory,
        workflow_data: workflowData,
        version_name: 'Initial Version',
        changelog: 'Initial workflow creation',
      },
      {
        onSuccess: () => {
          alert('Workflow created successfully!');
          setIsEditing(false);
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!workflowId || !workflow) return;

    // Check if metadata changed
    const metadataChanged =
      workflowName !== workflow.name ||
      workflowDescription !== (workflow.description || '') ||
      workflowCategory !== (workflow.category || '');

    if (metadataChanged) {
      updateWorkflow(
        {
          workflow_id: workflowId,
          name: workflowName,
          description: workflowDescription,
          category: workflowCategory,
        },
        {
          onSuccess: () => {
            console.log('Metadata updated');
          },
        }
      );
    }

    // Create new version with updated data
    createVersion(
      {
        workflow_id: workflowId,
        workflow_data: workflowData,
        changelog: changelog || 'Updated workflow',
      },
      {
        onSuccess: () => {
          alert('New version created successfully!');
          setChangelog('');
          setIsEditing(false);
        },
      }
    );
  };

  const handleAddNode = async () => {
    const newNode: WorkflowNode = {
      id: `node-${Date.now()}`,
      type: 'action',
      label: `Node ${workflowData.nodes.length + 1}`,
      config: {},
    };

    const newData = {
      ...workflowData,
      nodes: [...workflowData.nodes, newNode],
    };

    setWorkflowData(newData);

    // Broadcast to collaborators
    if (collaboration.isConnected) {
      await collaboration.broadcastChange({
        type: 'insert',
        path: `nodes.${workflowData.nodes.length}`,
        value: newNode,
      });
    }
  };

  const handleRemoveNode = async (nodeId: string) => {
    const nodeIndex = workflowData.nodes.findIndex(n => n.id === nodeId);
    const newData = {
      nodes: workflowData.nodes.filter(n => n.id !== nodeId),
      edges: workflowData.edges.filter(e => e.from !== nodeId && e.to !== nodeId),
    };

    setWorkflowData(newData);

    // Broadcast to collaborators
    if (collaboration.isConnected && nodeIndex >= 0) {
      await collaboration.broadcastChange({
        type: 'delete',
        path: `nodes.${nodeIndex}`,
        oldValue: workflowData.nodes[nodeIndex],
      });
    }
  };

  const handleStatusChange = (status: 'draft' | 'active' | 'archived') => {
    if (!workflowId) return;

    updateWorkflow(
      {
        workflow_id: workflowId,
        status,
      },
      {
        onSuccess: () => {
          alert(`Workflow status updated to ${status}`);
        },
      }
    );
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoadingWorkflow || isLoadingVersions) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-lg text-gray-600">Loading workflow...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold text-gray-900">
              {workflowId ? 'Edit Workflow' : 'Create Workflow'}
            </h2>
            {/* Presence Indicator */}
            {workflowId && presence.activeUsers.length > 0 && (
              <PresenceIndicator activeUsers={presence.activeUsers} size="sm" />
            )}
          </div>
          <div className="flex gap-2">
            {workflow && (
              <>
                {/* Comments Button */}
                <button
                  onClick={() => setShowComments(!showComments)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  💬 Comments
                </button>
                {/* Invite Button */}
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  + Invite
                </button>
                <select
                  value={workflow.status}
                  onChange={e => handleStatusChange(e.target.value as 'draft' | 'active' | 'archived')}
                  className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                  disabled={isUpdating}
                >
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
              </>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            )}
          </div>
        </div>

        {/* Metadata Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Workflow Name *
            </label>
            <input
              type="text"
              value={workflowName}
              onChange={e => setWorkflowName(e.target.value)}
              placeholder="e.g., Data Processing Pipeline"
              disabled={!isEditing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={workflowDescription}
              onChange={e => setWorkflowDescription(e.target.value)}
              placeholder="Describe what this workflow does..."
              disabled={!isEditing}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={workflowCategory}
              onChange={e => setWorkflowCategory(e.target.value)}
              disabled={!isEditing}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
            >
              <option value="automation">Automation</option>
              <option value="data-processing">Data Processing</option>
              <option value="ai-agent">AI Agent</option>
              <option value="integration">Integration</option>
              <option value="other">Other</option>
            </select>
          </div>

          {workflowId && isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Changelog (for new version)
              </label>
              <input
                type="text"
                value={changelog}
                onChange={e => setChangelog(e.target.value)}
                placeholder="Describe the changes in this version..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex gap-2">
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Edit Workflow
            </button>
          ) : (
            <>
              <button
                onClick={workflowId ? handleUpdate : handleCreate}
                disabled={isCreating || isUpdating || isCreatingVersion}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isCreating || isUpdating || isCreatingVersion
                  ? 'Saving...'
                  : workflowId
                    ? 'Save Version'
                    : 'Create Workflow'}
              </button>
              {workflowId && (
                <button
                  onClick={() => {
                    setIsEditing(false);
                    // Reset to original values
                    if (workflow && latestVersion) {
                      setWorkflowName(workflow.name);
                      setWorkflowDescription(workflow.description || '');
                      setWorkflowCategory(workflow.category || 'automation');
                      setWorkflowData(latestVersion.workflow_data as WorkflowData);
                    }
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              )}
            </>
          )}
        </div>

        {(createError || updateError || versionError) && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">
              Error: {(createError || updateError || versionError)?.message}
            </p>
          </div>
        )}
      </div>

      {/* Canvas Placeholder */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Workflow Canvas</h3>
          {isEditing && (
            <button
              onClick={handleAddNode}
              className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              + Add Node
            </button>
          )}
        </div>

        {workflowData.nodes.length === 0 ? (
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
            <p className="text-gray-500">
              No nodes yet. Click "Add Node" to start building your workflow.
            </p>
            <p className="text-sm text-gray-400 mt-2">
              Full visual workflow builder will be available in Phase 2
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {workflowData.nodes.map(node => (
              <div
                key={node.id}
                className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">{node.label}</p>
                  <p className="text-sm text-gray-500">Type: {node.type}</p>
                </div>
                {isEditing && (
                  <button
                    onClick={() => handleRemoveNode(node.id)}
                    className="px-3 py-1 text-sm text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Version History */}
      {workflowId && versions.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Version History</h3>
          <div className="space-y-2">
            {versions.slice(0, 5).map(version => (
              <div
                key={version.id}
                className="flex items-center justify-between p-3 border border-gray-200 rounded-lg"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    Version {version.version_number}
                    {version.version_name && ` - ${version.version_name}`}
                  </p>
                  {version.changelog && (
                    <p className="text-sm text-gray-600">{version.changelog}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {new Date(version.created_at).toLocaleString()} • {version.node_count} nodes •{' '}
                    {Math.round((version.data_size || 0) / 1024)}KB
                  </p>
                </div>
                {version.id === latestVersion?.id && (
                  <span className="px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded">
                    Current
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comments Section */}
      {workflowId && showComments && (
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Comments</h3>
            <button
              onClick={() => setShowComments(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <CommentThread resourceType="workflow" resourceId={workflowId} canComment={true} />
        </div>
      )}

      {/* Invite Modal */}
      {workflowId && workflow && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          resourceType="workflow"
          resourceId={workflowId}
          resourceName={workflow.name}
          onInviteSuccess={() => {
            console.log('User invited successfully');
          }}
        />
      )}
    </div>
  );
}
