/**
 * Workflow List Component
 *
 * Displays a list of workflows with filtering, search, and pagination
 * Allows users to browse, select, and manage their workflows
 *
 * @module WorkflowList
 */

import { useState } from 'react';
import { useWorkflowPersistence } from '@/hooks/useWorkflowPersistence';
import type { WorkflowListFilters } from '@/hooks/useWorkflowPersistence';

// ============================================================================
// Types
// ============================================================================

interface WorkflowListProps {
  onSelectWorkflow?: (workflowId: string) => void;
  onCreateNew?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function WorkflowList({ onSelectWorkflow, onCreateNew }: WorkflowListProps) {
  const [filters, setFilters] = useState<WorkflowListFilters>({
    page: 1,
    limit: 20,
  });

  const {
    workflows,
    pagination,
    isLoadingList,
    isErrorList,
    errorList,
    deleteWorkflow,
    isDeleting,
    refetchList,
  } = useWorkflowPersistence(null, filters);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleFilterChange = (key: keyof WorkflowListFilters, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key === 'page' ? (value as number) : 1, // Reset to page 1 when changing filters
    }));
  };

  const handleDelete = (workflowId: string, workflowName: string) => {
    if (window.confirm(`Are you sure you want to delete "${workflowName}"? This cannot be undone.`)) {
      deleteWorkflow(workflowId, {
        onSuccess: () => {
          alert('Workflow deleted successfully');
          refetchList();
        },
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'draft':
        return 'bg-yellow-100 text-yellow-800';
      case 'archived':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return '🌐';
      case 'organization':
        return '👥';
      case 'private':
        return '🔒';
      default:
        return '🔒';
    }
  };

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Workflows</h1>
        {onCreateNew && (
          <button
            onClick={onCreateNew}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            + Create Workflow
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              placeholder="Search workflows..."
              value={filters.search || ''}
              onChange={e => handleFilterChange('search', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select
              value={filters.category || ''}
              onChange={e => handleFilterChange('category', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Categories</option>
              <option value="automation">Automation</option>
              <option value="data-processing">Data Processing</option>
              <option value="ai-agent">AI Agent</option>
              <option value="integration">Integration</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Visibility</label>
            <select
              value={filters.visibility || ''}
              onChange={e => handleFilterChange('visibility', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All</option>
              <option value="private">Private</option>
              <option value="organization">Organization</option>
              <option value="public">Public</option>
            </select>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoadingList && (
        <div className="flex items-center justify-center h-64">
          <div className="text-lg text-gray-600">Loading workflows...</div>
        </div>
      )}

      {/* Error State */}
      {isErrorList && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading workflows: {errorList?.message}</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoadingList && !isErrorList && workflows.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm p-12 text-center">
          <p className="text-lg text-gray-600 mb-2">No workflows found</p>
          <p className="text-sm text-gray-500">
            {filters.search || filters.category || filters.status || filters.visibility
              ? 'Try adjusting your filters'
              : 'Create your first workflow to get started'}
          </p>
          {onCreateNew && (
            <button
              onClick={onCreateNew}
              className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              + Create Workflow
            </button>
          )}
        </div>
      )}

      {/* Workflow List */}
      {!isLoadingList && !isErrorList && workflows.length > 0 && (
        <>
          <div className="space-y-4">
            {workflows.map(workflow => (
              <div key={workflow.id} className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <button
                        onClick={() => onSelectWorkflow?.(workflow.id)}
                        className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                      >
                        {workflow.name}
                      </button>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(workflow.status)}`}>
                        {workflow.status}
                      </span>
                      <span className="text-sm" title={workflow.visibility}>
                        {getVisibilityIcon(workflow.visibility)}
                      </span>
                    </div>

                    {/* Description */}
                    {workflow.description && (
                      <p className="text-sm text-gray-600 mb-3">{workflow.description}</p>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {workflow.category && (
                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                          {workflow.category}
                        </span>
                      )}
                      <span>v{workflow.version_count || 0}</span>
                      <span>{workflow.execution_count || 0} executions</span>
                      {workflow.last_executed_at && (
                        <span>Last run: {new Date(workflow.last_executed_at).toLocaleDateString()}</span>
                      )}
                      <span>Created: {new Date(workflow.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Tags */}
                    {workflow.tags && workflow.tags.length > 0 && (
                      <div className="flex items-center gap-2 mt-2">
                        {workflow.tags.map((tag: string) => (
                          <span key={tag} className="px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => onSelectWorkflow?.(workflow.id)}
                      className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(workflow.id, workflow.name)}
                      disabled={isDeleting}
                      className="px-3 py-1 text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-700">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} workflows
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleFilterChange('page', filters.page! - 1)}
                  disabled={filters.page === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="px-3 py-2 text-sm text-gray-700">
                  Page {filters.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => handleFilterChange('page', filters.page! + 1)}
                  disabled={!pagination.hasMore}
                  className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
