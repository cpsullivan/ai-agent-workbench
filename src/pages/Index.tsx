import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Main application page - AI Agent Workbench
 *
 * This will eventually contain:
 * - Free Agent mode (autonomous AI with memory)
 * - Workflow builder (visual drag-drop)
 * - Session management
 * - Multi-model support
 */
export default function Index() {
  const { user, signOut, isAdmin, isMember } = useAuth();
  const [sessionActive, setSessionActive] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-900">AI Agent Workbench</h1>

            {/* User menu */}
            <div className="flex items-center gap-4">
              <a
                href="/workflows"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                🔄 Workflows
              </a>
              <a
                href="/settings"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                ⚙️ Settings
              </a>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.full_name || user?.email}
                </p>
                <p className="text-xs text-gray-500">
                  {isAdmin ? 'Admin' : isMember ? 'Member' : 'Viewer'}
                </p>
              </div>
              <button
                onClick={() => signOut()}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Authentication Status */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-sm font-medium text-green-900">
              ✓ Phase 1.1 Complete: Authentication system is working!
            </p>
          </div>
          <p className="text-sm text-green-700 mt-1 ml-7">
            You are logged in as <strong>{user?.email}</strong>
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Welcome</h2>
          <p className="text-gray-600 mb-4">
            The AI Agent Workbench authentication is now active. You can now sign in with
            OAuth or email/password.
          </p>

          <div className="space-y-4">
            {/* Completed Features */}
            <div className="border-l-4 border-green-500 pl-4">
              <h3 className="font-medium text-gray-900">✓ Implemented Features:</h3>
              <ul className="list-disc list-inside text-gray-600 mt-2 space-y-1">
                <li>OAuth Authentication (Google, GitHub, Microsoft) - Phase 1.1</li>
                <li>Email/Password Authentication - Phase 1.1</li>
                <li>Role-Based Access Control (RBAC) - Phase 1.1</li>
                <li>Protected Routes - Phase 1.1</li>
                <li>Secrets Management - Encrypted storage - Phase 1.2</li>
                <li>Session Persistence - Auto-save every 30s - Phase 1.3</li>
                <li>Workflow Persistence - Git-style versioning - Phase 1.4</li>
              </ul>
            </div>

            {/* Planned Features */}
            <div className="border-l-4 border-blue-500 pl-4">
              <h3 className="font-medium text-gray-900">Planned Features:</h3>
              <ul className="list-disc list-inside text-gray-600 mt-2 space-y-1">
                <li>Multi-user Collaboration - Real-time sync (Phase 2.1)</li>
                <li>Cost Tracking - Monitor API usage (Phase 2.2)</li>
                <li>Performance Optimization - Redis caching (Phase 2.3)</li>
                <li>Advanced Workflow Features - Templates, control flow (Phase 2.4)</li>
                <li>Free Agent Mode - Autonomous AI with memory (Phase 2.x)</li>
                <li>70% Test Coverage - Comprehensive testing (Phase 3)</li>
              </ul>
            </div>

            {/* User Permissions */}
            <div className="border-l-4 border-yellow-500 pl-4">
              <h3 className="font-medium text-gray-900">Your Permissions:</h3>
              <div className="mt-2 space-y-1">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Role:</span>{' '}
                  {isAdmin ? 'Administrator' : isMember ? 'Member' : 'Viewer'}
                </p>
                {!user?.organization_id && (
                  <p className="text-sm text-yellow-600">
                    ⚠ You're not assigned to an organization yet. Contact an admin to get
                    access.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4 mt-6">
              <button
                onClick={() => setSessionActive(!sessionActive)}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
                disabled={!isMember}
                title={!isMember ? 'Requires member or admin role' : ''}
              >
                {sessionActive ? 'Stop Session' : 'Start Session'}
              </button>
              {sessionActive && (
                <span className="text-sm text-gray-600">
                  Session active (placeholder)
                </span>
              )}
              {!isMember && (
                <span className="text-sm text-gray-500">
                  (Requires organization membership)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Next Steps */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-blue-900 mb-2">Next Steps</h3>
          <ol className="list-decimal list-inside text-sm text-blue-800 space-y-1">
            <li>Configure Supabase project with OAuth providers</li>
            <li>Run database migration (001_add_auth_tables.sql)</li>
            <li>Create test organization and assign user roles</li>
            <li>Begin Phase 1.2: Secrets Management implementation</li>
          </ol>
        </div>
      </main>
    </div>
  );
}
