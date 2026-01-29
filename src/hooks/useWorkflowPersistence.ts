/**
 * Workflow Persistence Hook
 *
 * Manages workflow CRUD operations with database persistence
 * Provides React Query integration for caching and optimistic updates
 *
 * @module useWorkflowPersistence
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Workflow } from '@/types';

// ============================================================================
// Types
// ============================================================================

export interface CreateWorkflowParams {
  name: string;
  description?: string;
  category?: string;
  tags?: string[];
  visibility?: 'private' | 'organization' | 'public';
  workflow_data: object;
  version_name?: string;
  changelog?: string;
}

export interface UpdateWorkflowParams {
  workflow_id: string;
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'private' | 'organization' | 'public';
}

export interface WorkflowListFilters {
  category?: string;
  status?: 'draft' | 'active' | 'archived';
  visibility?: 'private' | 'organization' | 'public';
  search?: string;
  page?: number;
  limit?: number;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface CreateWorkflowResponse {
  workflow: Workflow;
  version_id: string;
  message: string;
}

export interface UpdateWorkflowResponse {
  workflow: Workflow;
  message: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a new workflow
 */
async function createWorkflowAPI(params: CreateWorkflowParams): Promise<CreateWorkflowResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-create`,
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
    throw new Error(error.error || 'Failed to create workflow');
  }

  return response.json();
}

/**
 * Update workflow metadata
 */
async function updateWorkflowAPI(params: UpdateWorkflowParams): Promise<UpdateWorkflowResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-update`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update workflow');
  }

  return response.json();
}

/**
 * List workflows with filtering
 */
async function listWorkflowsAPI(filters?: WorkflowListFilters): Promise<WorkflowListResponse> {
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    throw new Error('Not authenticated');
  }

  // Build query parameters
  const params = new URLSearchParams();
  if (filters?.category) params.append('category', filters.category);
  if (filters?.status) params.append('status', filters.status);
  if (filters?.visibility) params.append('visibility', filters.visibility);
  if (filters?.search) params.append('search', filters.search);
  if (filters?.page) params.append('page', filters.page.toString());
  if (filters?.limit) params.append('limit', filters.limit.toString());

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/workflow-list?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to list workflows');
  }

  return response.json();
}

/**
 * Get a single workflow by ID
 */
async function getWorkflowAPI(workflowId: string): Promise<Workflow> {
  const { data, error } = await supabase
    .from('workflows')
    .select('*')
    .eq('id', workflowId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Workflow;
}

/**
 * Delete a workflow
 */
async function deleteWorkflowAPI(workflowId: string): Promise<void> {
  const { error } = await supabase.from('workflows').delete().eq('id', workflowId);

  if (error) {
    throw new Error(error.message);
  }
}

// ============================================================================
// React Query Keys
// ============================================================================

const workflowKeys = {
  all: ['workflows'] as const,
  lists: () => [...workflowKeys.all, 'list'] as const,
  list: (filters?: WorkflowListFilters) => [...workflowKeys.lists(), filters] as const,
  details: () => [...workflowKeys.all, 'detail'] as const,
  detail: (id: string) => [...workflowKeys.details(), id] as const,
};

// ============================================================================
// Hooks
// ============================================================================

/**
 * List workflows with filtering and pagination
 */
export function useWorkflowList(filters?: WorkflowListFilters) {
  return useQuery({
    queryKey: workflowKeys.list(filters),
    queryFn: () => listWorkflowsAPI(filters),
    staleTime: 5000, // Consider data fresh for 5 seconds
  });
}

/**
 * Get a single workflow by ID
 */
export function useWorkflow(workflowId: string | null) {
  return useQuery({
    queryKey: workflowKeys.detail(workflowId || ''),
    queryFn: () => getWorkflowAPI(workflowId!),
    enabled: !!workflowId,
  });
}

/**
 * Create a new workflow
 */
export function useCreateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createWorkflowAPI,
    onSuccess: () => {
      // Invalidate workflow lists to refetch
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

/**
 * Update workflow metadata
 */
export function useUpdateWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateWorkflowAPI,
    onSuccess: (data) => {
      // Invalidate the specific workflow and all lists
      queryClient.invalidateQueries({ queryKey: workflowKeys.detail(data.workflow.id) });
      queryClient.invalidateQueries({ queryKey: workflowKeys.lists() });
    },
  });
}

/**
 * Delete a workflow
 */
export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteWorkflowAPI,
    onSuccess: () => {
      // Invalidate all workflow queries
      queryClient.invalidateQueries({ queryKey: workflowKeys.all });
    },
  });
}

/**
 * Main workflow persistence hook
 * Combines all workflow operations into a single convenient hook
 */
export function useWorkflowPersistence(workflowId?: string | null, filters?: WorkflowListFilters) {
  const listQuery = useWorkflowList(filters);
  const workflowQuery = useWorkflow(workflowId || null);
  const createMutation = useCreateWorkflow();
  const updateMutation = useUpdateWorkflow();
  const deleteMutation = useDeleteWorkflow();

  return {
    // Data
    workflows: listQuery.data?.workflows || [],
    workflow: workflowQuery.data || null,
    pagination: listQuery.data?.pagination,

    // List query state
    isLoadingList: listQuery.isLoading,
    isErrorList: listQuery.isError,
    errorList: listQuery.error,

    // Detail query state
    isLoadingWorkflow: workflowQuery.isLoading,
    isErrorWorkflow: workflowQuery.isError,
    errorWorkflow: workflowQuery.error,

    // Mutations
    createWorkflow: createMutation.mutate,
    updateWorkflow: updateMutation.mutate,
    deleteWorkflow: deleteMutation.mutate,

    // Mutation state
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
    createError: createMutation.error,
    updateError: updateMutation.error,
    deleteError: deleteMutation.error,

    // Utility
    refetchList: listQuery.refetch,
    refetchWorkflow: workflowQuery.refetch,
  };
}
