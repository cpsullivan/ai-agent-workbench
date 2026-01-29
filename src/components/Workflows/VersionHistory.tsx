/**
 * Version History Component
 *
 * Displays detailed version history for a workflow
 * Shows all versions with changelog, metadata, and restore functionality
 *
 * @module VersionHistory
 */

import { useState } from 'react';
import { useWorkflowVersioning } from '@/hooks/useWorkflowVersioning';

// ============================================================================
// Types
// ============================================================================

interface VersionHistoryProps {
  workflowId: string;
  onClose?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export function VersionHistory({ workflowId, onClose }: VersionHistoryProps) {
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [compareVersionId, setCompareVersionId] = useState<string | null>(null);

  const {
    versions,
    latestVersion,
    isLoadingVersions,
    isErrorVersions,
    errorVersions,
    restoreVersion,
    isCreatingVersion,
    compareVersionsById,
  } = useWorkflowVersioning(workflowId);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleRestore = async (versionId: string, versionNumber: number) => {
    if (
      window.confirm(
        `Are you sure you want to restore to version ${versionNumber}? This will create a new version with the old data.`
      )
    ) {
      try {
        await restoreVersion(versionId);
        alert('Version restored successfully! A new version has been created.');
      } catch (error) {
        alert(`Failed to restore version: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  };

  const handleCompare = () => {
    if (!selectedVersionId || !compareVersionId) {
      alert('Please select two versions to compare');
      return;
    }

    const comparison = compareVersionsById(selectedVersionId, compareVersionId);
    if (!comparison) {
      alert('Failed to compare versions');
      return;
    }

    const message = `
Comparison Results:
- Data Size Change: ${comparison.dataSizeChange > 0 ? '+' : ''}${comparison.dataSizeChange} bytes
- Node Count Change: ${comparison.nodeCountChange > 0 ? '+' : ''}${comparison.nodeCountChange} nodes
- Has Data Changes: ${comparison.hasDataChanges ? 'Yes' : 'No'}
    `.trim();

    alert(message);
  };

  // ============================================================================
  // Render
  // ============================================================================

  if (isLoadingVersions) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading version history...</div>
      </div>
    );
  }

  if (isErrorVersions) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Error loading versions: {errorVersions?.message}</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-12 text-center">
        <p className="text-lg text-gray-600">No versions found</p>
        <p className="text-sm text-gray-500 mt-2">This workflow doesn't have any versions yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Version History</h2>
          <p className="text-sm text-gray-600 mt-1">{versions.length} versions</p>
        </div>
        <div className="flex gap-2">
          {(selectedVersionId || compareVersionId) && (
            <button
              onClick={() => {
                setSelectedVersionId(null);
                setCompareVersionId(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear Selection
            </button>
          )}
          {selectedVersionId && compareVersionId && (
            <button
              onClick={handleCompare}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
            >
              Compare Selected
            </button>
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

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          💡 Click on a version to select it for comparison. Select two versions and click "Compare Selected" to see differences.
        </p>
      </div>

      {/* Version List */}
      <div className="space-y-4">
        {versions.map(version => {
          const isLatest = version.id === latestVersion?.id;
          const isSelected = version.id === selectedVersionId || version.id === compareVersionId;

          return (
            <div
              key={version.id}
              onClick={() => {
                if (!selectedVersionId) {
                  setSelectedVersionId(version.id);
                } else if (selectedVersionId === version.id) {
                  setSelectedVersionId(null);
                } else if (!compareVersionId) {
                  setCompareVersionId(version.id);
                } else {
                  setSelectedVersionId(version.id);
                  setCompareVersionId(null);
                }
              }}
              className={`bg-white rounded-lg shadow-sm p-6 cursor-pointer transition-all ${
                isSelected
                  ? 'ring-2 ring-blue-500 shadow-md'
                  : 'hover:shadow-md'
              }`}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      Version {version.version_number}
                    </h3>
                    {isLatest && (
                      <span className="px-2 py-1 text-xs font-medium text-green-800 bg-green-100 rounded">
                        Current
                      </span>
                    )}
                    {isSelected && (
                      <span className="px-2 py-1 text-xs font-medium text-blue-800 bg-blue-100 rounded">
                        {version.id === selectedVersionId ? 'Selected A' : 'Selected B'}
                      </span>
                    )}
                  </div>
                  {version.version_name && (
                    <p className="text-sm font-medium text-gray-700">{version.version_name}</p>
                  )}
                </div>

                {/* Actions */}
                {!isLatest && (
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      handleRestore(version.id, version.version_number);
                    }}
                    disabled={isCreatingVersion}
                    className="px-3 py-1 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50"
                  >
                    Restore
                  </button>
                )}
              </div>

              {/* Changelog */}
              {version.changelog && (
                <p className="text-sm text-gray-600 mb-3">{version.changelog}</p>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Nodes</p>
                  <p className="font-medium text-gray-900">{version.node_count || 0}</p>
                </div>
                <div>
                  <p className="text-gray-500">Size</p>
                  <p className="font-medium text-gray-900">
                    {Math.round((version.data_size || 0) / 1024)}KB
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Created</p>
                  <p className="font-medium text-gray-900">
                    {new Date(version.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Time</p>
                  <p className="font-medium text-gray-900">
                    {new Date(version.created_at).toLocaleTimeString()}
                  </p>
                </div>
              </div>

              {/* Workflow Data Preview */}
              <details className="mt-4">
                <summary className="text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900">
                  View Data
                </summary>
                <pre className="mt-2 p-3 bg-gray-50 rounded-lg text-xs overflow-auto max-h-64">
                  {JSON.stringify(version.workflow_data, null, 2)}
                </pre>
              </details>
            </div>
          );
        })}
      </div>

      {/* Loading State (for restore) */}
      {isCreatingVersion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <p className="text-lg font-medium text-gray-900">Restoring version...</p>
          </div>
        </div>
      )}
    </div>
  );
}
