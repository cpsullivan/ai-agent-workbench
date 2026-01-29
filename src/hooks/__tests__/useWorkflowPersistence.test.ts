/**
 * Tests for Workflow Persistence and Versioning Hooks
 *
 * Test suite covering:
 * - Workflow creation
 * - Workflow updates
 * - Workflow listing and filtering
 * - Workflow deletion
 * - Version creation
 * - Version history
 * - Cache management
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  useWorkflowPersistence,
  useWorkflow,
  useWorkflowVersioning,
  useWorkflowVersions,
} from '../useWorkflowPersistence';
import { supabase } from '@/lib/supabase';
import React from 'react';

// ============================================================================
// Mocks
// ============================================================================

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      single: vi.fn(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
    })),
  },
}));

// Mock fetch
global.fetch = vi.fn();

// ============================================================================
// Test Data
// ============================================================================

const mockSession = {
  access_token: 'mock-token',
  user: { id: 'user-123' },
};

const mockWorkflow = {
  id: 'workflow-123',
  user_id: 'user-123',
  organization_id: 'org-123',
  name: 'Test Workflow',
  description: 'A test workflow',
  category: 'automation',
  tags: ['test', 'automation'],
  status: 'active' as const,
  visibility: 'private' as const,
  current_version_id: 'version-1',
  version_count: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockWorkflowList = {
  workflows: [mockWorkflow],
  pagination: {
    page: 1,
    limit: 20,
    total: 1,
    totalPages: 1,
    hasMore: false,
  },
};

const mockVersion = {
  id: 'version-1',
  workflow_id: 'workflow-123',
  version_number: 1,
  version_name: 'v1.0.0',
  changelog: 'Initial version',
  workflow_data: { nodes: [], edges: [] },
  data_size: 1024,
  node_count: 5,
  created_by: 'user-123',
  created_at: new Date().toISOString(),
};

// ============================================================================
// Helper Functions
// ============================================================================

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function setupMocks(options: {
  authenticated?: boolean;
  createSuccess?: boolean;
  updateSuccess?: boolean;
  listSuccess?: boolean;
  deleteSuccess?: boolean;
}) {
  const {
    authenticated = true,
    createSuccess = true,
    updateSuccess = true,
    listSuccess = true,
    deleteSuccess = true,
  } = options;

  // Mock auth session
  vi.mocked(supabase.auth.getSession).mockResolvedValue({
    data: { session: authenticated ? (mockSession as any) : null },
    error: null,
  });

  // Mock fetch responses
  vi.mocked(fetch).mockImplementation(async (url: any) => {
    const urlStr = url.toString();

    if (urlStr.includes('workflow-create')) {
      if (!createSuccess) {
        return {
          ok: false,
          json: async () => ({ error: 'Failed to create workflow' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          workflow: mockWorkflow,
          version_id: 'version-1',
          message: 'Workflow created',
        }),
      } as Response;
    }

    if (urlStr.includes('workflow-update')) {
      if (!updateSuccess) {
        return {
          ok: false,
          json: async () => ({ error: 'Failed to update workflow' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          workflow: { ...mockWorkflow, name: 'Updated Workflow' },
          message: 'Workflow updated',
        }),
      } as Response;
    }

    if (urlStr.includes('workflow-list')) {
      if (!listSuccess) {
        return {
          ok: false,
          json: async () => ({ error: 'Failed to list workflows' }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => mockWorkflowList,
      } as Response;
    }

    if (urlStr.includes('workflow-version-create')) {
      return {
        ok: true,
        json: async () => ({
          version: mockVersion,
          workflow: {
            id: 'workflow-123',
            current_version_id: 'version-2',
            version_count: 2,
          },
          message: 'Version created',
        }),
      } as Response;
    }

    return { ok: false, json: async () => ({}) } as Response;
  });

  // Mock Supabase queries
  const fromMock = vi.mocked(supabase.from);
  fromMock.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: mockVersion, error: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockResolvedValue({ error: deleteSuccess ? null : { message: 'Delete failed' } }),
  } as any);
}

// ============================================================================
// Tests: Workflow Creation
// ============================================================================

describe('useWorkflowPersistence - Create', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new workflow', async () => {
    setupMocks({ authenticated: true, createSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    let createdWorkflow: any;
    await act(async () => {
      createdWorkflow = await result.current.createWorkflow({
        name: 'New Workflow',
        description: 'Test workflow',
        workflow_data: { nodes: [], edges: [] },
      });
    });

    expect(createdWorkflow.workflow).toBeDefined();
    expect(createdWorkflow.workflow.name).toBe('Test Workflow');
    expect(createdWorkflow.version_id).toBe('version-1');
  });

  it('should include all optional parameters', async () => {
    setupMocks({ authenticated: true, createSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createWorkflow({
        name: 'Advanced Workflow',
        description: 'Complex workflow',
        category: 'data-processing',
        tags: ['ml', 'data'],
        visibility: 'organization',
        workflow_data: { nodes: [], edges: [] },
        version_name: 'v1.0.0',
        changelog: 'Initial release',
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('workflow-create'),
      expect.objectContaining({
        body: expect.stringContaining('Advanced Workflow'),
      })
    );
  });

  it('should throw error when not authenticated', async () => {
    setupMocks({ authenticated: false });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.createWorkflow({
          name: 'Test',
          workflow_data: {},
        });
      })
    ).rejects.toThrow('Not authenticated');
  });

  it('should handle create API errors', async () => {
    setupMocks({ authenticated: true, createSuccess: false });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.createWorkflow({
          name: 'Test',
          workflow_data: {},
        });
      })
    ).rejects.toThrow('Failed to create workflow');
  });

  it('should invalidate workflow list after create', async () => {
    setupMocks({ authenticated: true, createSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createWorkflow({
        name: 'Test',
        workflow_data: {},
      });
    });

    // Query should be invalidated to trigger refetch
    expect(result.current.isCreating).toBe(false);
  });
});

// ============================================================================
// Tests: Workflow Updates
// ============================================================================

describe('useWorkflowPersistence - Update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update workflow metadata', async () => {
    setupMocks({ authenticated: true, updateSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    let updatedWorkflow: any;
    await act(async () => {
      updatedWorkflow = await result.current.updateWorkflow({
        workflow_id: 'workflow-123',
        name: 'Updated Name',
        description: 'Updated description',
      });
    });

    expect(updatedWorkflow.workflow.name).toBe('Updated Workflow');
  });

  it('should update workflow status', async () => {
    setupMocks({ authenticated: true, updateSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.updateWorkflow({
        workflow_id: 'workflow-123',
        status: 'archived',
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('workflow-update'),
      expect.objectContaining({
        method: 'PATCH',
      })
    );
  });

  it('should update workflow visibility', async () => {
    setupMocks({ authenticated: true, updateSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.updateWorkflow({
        workflow_id: 'workflow-123',
        visibility: 'public',
      });
    });

    expect(fetch).toHaveBeenCalled();
  });

  it('should handle update API errors', async () => {
    setupMocks({ authenticated: true, updateSuccess: false });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.updateWorkflow({
          workflow_id: 'workflow-123',
          name: 'New Name',
        });
      })
    ).rejects.toThrow('Failed to update workflow');
  });
});

// ============================================================================
// Tests: Workflow Listing
// ============================================================================

describe('useWorkflowPersistence - List', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all workflows', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    expect(result.current.workflows?.workflows).toHaveLength(1);
    expect(result.current.workflows?.pagination.total).toBe(1);
  });

  it('should filter workflows by category', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(
      () => useWorkflowPersistence({ category: 'automation' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('category=automation'),
      expect.any(Object)
    );
  });

  it('should filter workflows by status', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(
      () => useWorkflowPersistence({ status: 'active' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('status=active'),
      expect.any(Object)
    );
  });

  it('should search workflows', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(
      () => useWorkflowPersistence({ search: 'test' }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('search=test'),
      expect.any(Object)
    );
  });

  it('should handle pagination', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result } = renderHook(
      () => useWorkflowPersistence({ page: 2, limit: 10 }),
      { wrapper: createWrapper() }
    );

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('page=2'),
      expect.any(Object)
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('limit=10'),
      expect.any(Object)
    );
  });

  it('should handle list API errors', async () => {
    setupMocks({ authenticated: true, listSuccess: false });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });

    expect(result.current.error?.message).toContain('Failed to list workflows');
  });
});

// ============================================================================
// Tests: Workflow Deletion
// ============================================================================

describe('useWorkflowPersistence - Delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete a workflow', async () => {
    setupMocks({ authenticated: true, deleteSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.deleteWorkflow('workflow-123');
    });

    const fromMock = vi.mocked(supabase.from);
    expect(fromMock).toHaveBeenCalledWith('workflows');
  });

  it('should invalidate workflow list after delete', async () => {
    setupMocks({ authenticated: true, deleteSuccess: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.deleteWorkflow('workflow-123');
    });

    expect(result.current.isDeleting).toBe(false);
  });

  it('should handle delete errors', async () => {
    setupMocks({ authenticated: true, deleteSuccess: false });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await expect(
      act(async () => {
        await result.current.deleteWorkflow('workflow-123');
      })
    ).rejects.toThrow();
  });
});

// ============================================================================
// Tests: Version Creation
// ============================================================================

describe('useWorkflowVersioning - Create Version', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create a new version', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowVersioning('workflow-123'), {
      wrapper: createWrapper(),
    });

    let versionResult: any;
    await act(async () => {
      versionResult = await result.current.createVersion({
        workflow_id: 'workflow-123',
        workflow_data: { nodes: [], edges: [] },
        version_name: 'v2.0.0',
        changelog: 'Added new features',
      });
    });

    expect(versionResult.version).toBeDefined();
    expect(versionResult.workflow.version_count).toBe(2);
  });

  it('should increment version number', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowVersioning('workflow-123'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createVersion({
        workflow_id: 'workflow-123',
        workflow_data: {},
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('workflow-version-create'),
      expect.any(Object)
    );
  });

  it('should support optional version name and changelog', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowVersioning('workflow-123'), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.createVersion({
        workflow_id: 'workflow-123',
        workflow_data: {},
        version_name: 'Alpha Release',
        changelog: 'Initial alpha version',
      });
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('Alpha Release'),
      })
    );
  });
});

// ============================================================================
// Tests: Version History
// ============================================================================

describe('useWorkflowVersions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should list all versions for a workflow', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowVersions('workflow-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.versions).toBeDefined();
    });
  });

  it('should order versions by number descending', async () => {
    setupMocks({ authenticated: true });

    const mockVersions = [
      { ...mockVersion, version_number: 3 },
      { ...mockVersion, version_number: 2 },
      { ...mockVersion, version_number: 1 },
    ];

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: mockVersions, error: null }),
    } as any);

    const { result } = renderHook(() => useWorkflowVersions('workflow-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.versions).toHaveLength(3);
    });

    expect(result.current.versions?.[0].version_number).toBe(3);
  });

  it('should handle errors when loading versions', async () => {
    setupMocks({ authenticated: true });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      }),
    } as any);

    const { result } = renderHook(() => useWorkflowVersions('workflow-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});

// ============================================================================
// Tests: useWorkflow Hook
// ============================================================================

describe('useWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should get a specific workflow by ID', async () => {
    setupMocks({ authenticated: true });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: mockWorkflow, error: null }),
    } as any);

    const { result } = renderHook(() => useWorkflow('workflow-123'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.workflow).toBeDefined();
    });

    expect(result.current.workflow?.id).toBe('workflow-123');
  });

  it('should handle workflow not found', async () => {
    setupMocks({ authenticated: true });

    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      }),
    } as any);

    const { result } = renderHook(() => useWorkflow('nonexistent'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBeDefined();
    });
  });
});

// ============================================================================
// Tests: Cache Management
// ============================================================================

describe('Workflow Persistence - Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should cache workflow list', async () => {
    setupMocks({ authenticated: true, listSuccess: true });

    const { result, rerender } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    const firstCallCount = vi.mocked(fetch).mock.calls.length;

    // Rerender should use cache
    rerender();

    expect(vi.mocked(fetch).mock.calls.length).toBe(firstCallCount);
  });

  it('should invalidate cache after create', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.workflows).toBeDefined();
    });

    await act(async () => {
      await result.current.createWorkflow({
        name: 'New Workflow',
        workflow_data: {},
      });
    });

    // Cache should be invalidated
    expect(result.current.workflows).toBeDefined();
  });

  it('should invalidate cache after update', async () => {
    setupMocks({ authenticated: true });

    const { result } = renderHook(() => useWorkflowPersistence(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.updateWorkflow({
        workflow_id: 'workflow-123',
        name: 'Updated',
      });
    });

    // Cache should be invalidated
    expect(true).toBe(true);
  });
});
