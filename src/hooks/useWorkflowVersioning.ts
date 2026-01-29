/**
 * Workflow Versioning Hook
 *
 * Manages Git-style version control for workflows
 * Provides immutable version snapshots with changelog tracking
 *
 * @module useWorkflowVersioning
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  version_name: string | null;
  changelog: string | null;
  workflow_data: object;
  data_size: number | null;
  node_count: number | null;
  created_by: string;
  created_at: string;
}

export interface CreateVersionParams {
  workflow_id: string;
  workflow_data: object;
  version_name?: string;
  changelog?: string;
}

export interface CreateVersionResponse {
  version: WorkflowVersion;
  workflow: {
    id: string;
    current_version_id: string;
    version_count: number;
  };
  message: string;
}

export interface ExecuteWorkflowParams {
  workflow_id: string;
  version_id?: string;
  input_data?: object;
}

export interface ExecuteWorkflowResponse {
  execution_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  workflow_name: string;
  version_number: number;
  message: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new version of a workflow
 */
async function createVersionAPI(params: CreateVersionParams): Promise<CreateVersionResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-version-create`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to create version');
  }

  return response.json();
}

/**
 * List versions for a workflow
 */
async function listVersionsAPI(workflowId: string): Promise<WorkflowVersion[]> {
  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('version_number', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as WorkflowVersion[];
}

/**
 * Get a specific version
 */
async function getVersionAPI(versionId: string): Promise<WorkflowVersion> {
  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('id', versionId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as WorkflowVersion;
}

/**
 * Get a specific version by workflow ID and version number
 */
async function getVersionByNumberAPI(
  workflowId: string,
  versionNumber: number
): Promise<WorkflowVersion> {
  const { data, error } = await supabase
    .from('workflow_versions')
    .select('*')
    .eq('workflow_id', workflowId)
    .eq('version_number', versionNumber)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as WorkflowVersion;
}

/**
 * Execute a workflow (specific version or current)
 */
async function executeWorkflowAPI(params: ExecuteWorkflowParams): Promise<ExecuteWorkflowResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-execute`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to execute workflow');
  }

  return response.json();
}

/**
 * Compare two versions and return a simple diff summary
 */
function compareVersions(
  oldVersion: WorkflowVersion,
  newVersion: WorkflowVersion
): {
  dataSizeChange: number;
  nodeCountChange: number;
  hasDataChanges: boolean;
} {
  const dataSizeChange = (newVersion.data_size || 0) - (oldVersion.data_size || 0);
  const nodeCountChange = (newVersion.node_count || 0) - (oldVersion.node_count || 0);
  const hasDataChanges =
    JSON.stringify(oldVersion.workflow_data) !== JSON.stringify(newVersion.workflow_data);

  return {
    dataSizeChange,
    nodeCountChange,
    hasDataChanges,
  };
}

// ============================================================================
// React Query Keys
// ============================================================================

const versionKeys = {
  all: ['workflow-versions'] as const,
  lists: () => [...versionKeys.all, 'list'] as const,
  list: (workflowId: string) => [...versionKeys.lists(), workflowId] as const,
  details: () => [...versionKeys.all, 'detail'] as const,
  detail: (versionId: string) => [...versionKeys.details(), versionId] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * List all versions for a workflow
 */
export function useWorkflowVersions(workflowId: string | null) {
  return useQuery({
    queryKey: versionKeys.list(workflowId || ''),
    queryFn: () => listVersionsAPI(workflowId!),
    enabled: !!workflowId,
  });
}

/**
 * Get a specific version by ID
 */
export function useWorkflowVersion(versionId: string | null) {
  return useQuery({
    queryKey: versionKeys.detail(versionId || ''),
    queryFn: () => getVersionAPI(versionId!),
    enabled: !!versionId,
  });
}

/**
 * Get a specific version by workflow ID and version number
 */
export function useWorkflowVersionByNumber(workflowId: string | null, versionNumber: number | null) {
  return useQuery({
    queryKey: [...versionKeys.list(workflowId || ''), versionNumber],
    queryFn: () => getVersionByNumberAPI(workflowId!, versionNumber!),
    enabled: !!workflowId && versionNumber !== null,
  });
}

/**
 * Create a new version
 */
export function useCreateVersion() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createVersionAPI,
    onSuccess: (data) => {
      // Invalidate version list for this workflow
      queryClient.invalidateQueries({ queryKey: versionKeys.list(data.version.workflow_id) });
      // Invalidate the workflow detail (to update current_version_id)
      queryClient.invalidateQueries({ queryKey: ['workflows', 'detail', data.workflow.id] });
    },
  });
}

/**
 * Execute a workflow
 */
export function useExecuteWorkflow() {
  return useMutation({
    mutationFn: executeWorkflowAPI,
  });
}

/**
 * Main workflow versioning hook
 * Combines all versioning operations into a single convenient hook
 */
export function useWorkflowVersioning(workflowId?: string | null, versionId?: string | null) {
  const versionsQuery = useWorkflowVersions(workflowId || null);
  const versionQuery = useWorkflowVersion(versionId || null);
  const createMutation = useCreateVersion();
  const executeMutation = useExecuteWorkflow();

  /**
   * Get the latest version
   */
  const latestVersion = versionsQuery.data?.[0] || null;

  /**
   * Compare two versions
   */
  const compareVersionsById = (oldVersionId: string, newVersionId: string) => {
    const versions = versionsQuery.data || [];
    const oldVer = versions.find(v => v.id === oldVersionId);
    const newVer = versions.find(v => v.id === newVersionId);

    if (!oldVer || !newVer) {
      return null;
    }

    return compareVersions(oldVer, newVer);
  };

  /**
   * Restore a specific version (creates a new version with old data)
   */
  const restoreVersion = async (versionIdToRestore: string, changelog?: string) => {
    const versions = versionsQuery.data || [];
    const versionToRestore = versions.find(v => v.id === versionIdToRestore);

    if (!versionToRestore) {
      throw new Error('Version not found');
    }

    return createMutation.mutateAsync({
      workflow_id: versionToRestore.workflow_id,
      workflow_data: versionToRestore.workflow_data,
      version_name: `Restored from v${versionToRestore.version_number}`,
      changelog: changelog || `Restored from version ${versionToRestore.version_number}`,
    });
  };

  return {
    // Data
    versions: versionsQuery.data || [],
    version: versionQuery.data || null,
    latestVersion,

    // Query state
    isLoadingVersions: versionsQuery.isLoading,
    isLoadingVersion: versionQuery.isLoading,
    isErrorVersions: versionsQuery.isError,
    isErrorVersion: versionQuery.isError,
    errorVersions: versionsQuery.error,
    errorVersion: versionQuery.error,

    // Mutations
    createVersion: createMutation.mutate,
    createVersionAsync: createMutation.mutateAsync,
    executeWorkflow: executeMutation.mutate,
    executeWorkflowAsync: executeMutation.mutateAsync,
    restoreVersion,

    // Mutation state
    isCreatingVersion: createMutation.isPending,
    isExecuting: executeMutation.isPending,
    createError: createMutation.error,
    executeError: executeMutation.error,
    executeResult: executeMutation.data,

    // Utility functions
    compareVersionsById,
    refetchVersions: versionsQuery.refetch,
    refetchVersion: versionQuery.refetch,
  };
}
