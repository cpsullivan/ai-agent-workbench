/**
 * Settings Page
 *
 * Central location for user settings including secrets management,
 * profile settings, and organization settings
 */

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import SecretsManager from '@/components/Settings/SecretsManager';

type SettingsTab = 'secrets' | 'profile' | 'organization';

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('secrets');

  const tabs = [
    { id: 'secrets' as const, label: 'Secrets', icon: '🔐' },
    { id: 'profile' as const, label: 'Profile', icon: '👤' },
    ...(isAdmin ? [{ id: 'organization' as const, label: 'Organization', icon: '🏢' }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
              <p className="mt-1 text-sm text-gray-600">
                Manage your account, secrets, and preferences
              </p>
            </div>
            <a
              href="/"
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              ← Back to Dashboard
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    px-6 py-4 text-sm font-medium border-b-2 transition-colors
                    ${
                      activeTab === tab.id
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }
                  `}
                >
                  <span className="mr-2">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'secrets' && <SecretsManager />}
            {activeTab === 'profile' && <ProfileSettings user={user} />}
            {activeTab === 'organization' && isAdmin && <OrganizationSettings />}
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Profile Settings (Placeholder)
// ============================================================================

function ProfileSettings({ user }: { user: any }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profile Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your personal information and preferences
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Profile settings coming in a future update. For now, you can manage your secrets.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={user?.email || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
          <input
            type="text"
            value={user?.full_name || ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
          />
          <p className="mt-1 text-xs text-gray-500">
            Profile editing will be available in Phase 2
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Member Since</label>
          <input
            type="text"
            value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : ''}
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-gray-600"
          />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Organization Settings (Placeholder)
// ============================================================================

function OrganizationSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Organization Settings</h2>
        <p className="mt-1 text-sm text-gray-600">
          Manage your organization's settings and team members
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Organization management coming in a future update.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold mb-2">Planned Features</h3>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            <li>Manage team members</li>
            <li>Assign roles and permissions</li>
            <li>View organization usage statistics</li>
            <li>Configure billing and subscription</li>
            <li>Set organization-wide policies</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
