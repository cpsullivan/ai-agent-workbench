/**
 * Secrets Manager Component
 *
 * UI for managing encrypted secrets (API keys, credentials)
 * Provides create, list, update, and delete functionality
 */

import { useState } from 'react';
import { useSecrets, validateSecretKey, sanitizeSecretKey, COMMON_SECRET_KEYS } from '@/hooks/useSecrets';
import type { EncryptedSecret } from '@/types';

export default function SecretsManager() {
  const {
    secrets,
    isLoading,
    error,
    createSecret,
    deleteSecret,
    isCreating,
    isDeleting,
  } = useSecrets();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    secret_key: '',
    secret_value: '',
    description: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Handle form submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    // Validate secret key
    const validation = validateSecretKey(formData.secret_key);
    if (!validation.valid) {
      setFormError(validation.error || 'Invalid secret key');
      return;
    }

    // Validate secret value
    if (!formData.secret_value || formData.secret_value.trim().length === 0) {
      setFormError('Secret value is required');
      return;
    }

    try {
      await createSecret({
        secret_key: sanitizeSecretKey(formData.secret_key),
        secret_value: formData.secret_value,
        description: formData.description || undefined,
      });

      // Reset form
      setFormData({ secret_key: '', secret_value: '', description: '' });
      setShowCreateForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save secret');
    }
  }

  // Handle delete
  async function handleDelete(secretKey: string) {
    if (deleteConfirm !== secretKey) {
      setDeleteConfirm(secretKey);
      return;
    }

    try {
      await deleteSecret(secretKey);
      setDeleteConfirm(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete secret');
    }
  }

  // Format date
  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Secrets Management</h2>
        <p className="mt-1 text-sm text-gray-600">
          Securely store API keys and credentials with AES-256 encryption
        </p>
      </div>

      {/* Security Warning */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg
            className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <div>
            <h3 className="text-sm font-medium text-yellow-900">Security Best Practices</h3>
            <ul className="mt-2 text-sm text-yellow-800 list-disc list-inside space-y-1">
              <li>Secrets are encrypted at rest using AES-256</li>
              <li>Never share secrets or paste them in public channels</li>
              <li>Rotate secrets regularly (every 90 days recommended)</li>
              <li>Use unique secrets for each service</li>
              <li>All access attempts are logged for security auditing</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Create Button */}
      {!showCreateForm && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
        >
          + Add New Secret
        </button>
      )}

      {/* Create Form */}
      {showCreateForm && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Add New Secret</h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Common Secrets Dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Common Secrets (Optional)
              </label>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) {
                    setFormData({
                      ...formData,
                      secret_key: e.target.value,
                      description: COMMON_SECRET_KEYS.find(k => k.key === e.target.value)?.label || '',
                    });
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Select a common secret type --</option>
                {COMMON_SECRET_KEYS.map(({ key, label }) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {/* Secret Key */}
            <div>
              <label htmlFor="secret_key" className="block text-sm font-medium text-gray-700 mb-1">
                Secret Key <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                id="secret_key"
                required
                value={formData.secret_key}
                onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., openai_api_key"
                pattern="[a-z0-9_]+"
              />
              <p className="mt-1 text-xs text-gray-500">
                Lowercase letters, numbers, and underscores only (3-64 chars)
              </p>
            </div>

            {/* Secret Value */}
            <div>
              <label htmlFor="secret_value" className="block text-sm font-medium text-gray-700 mb-1">
                Secret Value <span className="text-red-600">*</span>
              </label>
              <textarea
                id="secret_value"
                required
                value={formData.secret_value}
                onChange={(e) => setFormData({ ...formData, secret_value: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Enter your API key or credential"
                rows={3}
              />
              <p className="mt-1 text-xs text-gray-500">
                This value will be encrypted before storage
              </p>
            </div>

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="e.g., Production OpenAI key"
              />
            </div>

            {/* Error Message */}
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {formError}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {isCreating ? 'Saving...' : 'Save Secret'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setFormData({ secret_key: '', secret_value: '', description: '' });
                  setFormError(null);
                }}
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading secrets...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error instanceof Error ? error.message : 'Failed to load secrets'}
        </div>
      )}

      {/* Secrets List */}
      {!isLoading && !error && secrets && (
        <div>
          <h3 className="text-lg font-semibold mb-4">
            Your Secrets ({secrets.length})
          </h3>

          {secrets.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <svg
                className="w-12 h-12 text-gray-400 mx-auto mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <p className="text-gray-600">No secrets yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Add your first secret to get started
              </p>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-200">
              {secrets.map((secret) => (
                <SecretListItem
                  key={secret.id}
                  secret={secret}
                  onDelete={() => handleDelete(secret.secret_key)}
                  isDeleting={isDeleting}
                  showConfirm={deleteConfirm === secret.secret_key}
                  onCancelDelete={() => setDeleteConfirm(null)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Secret List Item Component
// ============================================================================

interface SecretListItemProps {
  secret: EncryptedSecret;
  onDelete: () => void;
  isDeleting: boolean;
  showConfirm: boolean;
  onCancelDelete: () => void;
  formatDate: (date: string) => string;
}

function SecretListItem({
  secret,
  onDelete,
  isDeleting,
  showConfirm,
  onCancelDelete,
  formatDate,
}: SecretListItemProps) {
  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-mono text-sm font-medium text-gray-900">
              {secret.secret_key}
            </h4>
            {secret.last_used_at && (
              <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                Recently used
              </span>
            )}
          </div>

          {secret.description && (
            <p className="mt-1 text-sm text-gray-600">{secret.description}</p>
          )}

          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span>Created: {formatDate(secret.created_at)}</span>
            {secret.last_used_at && (
              <span>Last used: {formatDate(secret.last_used_at)}</span>
            )}
          </div>
        </div>

        <div className="ml-4">
          {!showConfirm ? (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Confirm delete?</span>
              <button
                onClick={onDelete}
                disabled={isDeleting}
                className="px-3 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
              <button
                onClick={onCancelDelete}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
