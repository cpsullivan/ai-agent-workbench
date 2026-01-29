/**
 * Workflows Page
 *
 * Main page for workflow management
 * Shows workflow list and allows creation/editing
 *
 * @module Workflows
 */

import { useState } from 'react';
import { WorkflowList } from '@/components/Workflows/WorkflowList';
import { WorkflowBuilder } from '@/components/WorkflowBuilder';
import { VersionHistory } from '@/components/Workflows/VersionHistory';

type View = 'list' | 'builder' | 'versions';

export default function Workflows() {
  const [view, setView] = useState<View>('list');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const handleSelectWorkflow = (workflowId: string) => {
    setSelectedWorkflowId(workflowId);
    setView('builder');
  };

  const handleCreateNew = () => {
    setSelectedWorkflowId(null);
    setView('builder');
  };

  const handleViewVersions = () => {
    setView('versions');
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedWorkflowId(null);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">
              {view === 'list' ? 'Workflows' : view === 'builder' ? 'Workflow Builder' : 'Version History'}
            </h1>
            <div className="flex gap-2">
              {view !== 'list' && (
                <button
                  onClick={handleBackToList}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← Back to List
                </button>
              )}
              {view === 'builder' && selectedWorkflowId && (
                <button
                  onClick={handleViewVersions}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  📜 Version History
                </button>
              )}
              <a
                href="/"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Home
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="py-6">
        {view === 'list' && (
          <WorkflowList onSelectWorkflow={handleSelectWorkflow} onCreateNew={handleCreateNew} />
        )}
        {view === 'builder' && (
          <WorkflowBuilder workflowId={selectedWorkflowId || undefined} onClose={handleBackToList} />
        )}
        {view === 'versions' && selectedWorkflowId && (
          <VersionHistory workflowId={selectedWorkflowId} onClose={handleBackToList} />
        )}
      </main>
    </div>
  );
}
