/**
 * Core Type Definitions
 *
 * Central location for all TypeScript types used throughout the application.
 * These types will be synchronized with the Supabase database schema.
 */

// ============================================================================
// User & Authentication Types
// ============================================================================

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  organization_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  plan_tier: 'free' | 'pro' | 'enterprise';
  max_users: number;
  created_at: string;
  updated_at: string;
}

export type UserRole = 'admin' | 'member' | 'viewer';

export interface UserRoleAssignment {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  created_at: string;
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'active' | 'paused' | 'completed' | 'error';
export type SessionVisibility = 'private' | 'organization' | 'public';

export interface FreeAgentSession {
  id: string;
  user_id: string;
  organization_id?: string | null;
  name: string;
  description?: string | null;
  status: SessionStatus;
  model: string;
  current_state?: string;
  last_snapshot_at?: string | null;
  snapshot_count: number;
  memory_summary?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  visibility: SessionVisibility;
}

export interface SessionSnapshot {
  id: string;
  session_id: string;
  snapshot_number: number;
  snapshot_data: Record<string, unknown>;
  snapshot_size?: number;
  compression_enabled?: boolean;
  created_at: string;
}

export interface SessionMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  metadata?: Record<string, unknown> | null;
  message_order: number;
  created_at: string;
}

export interface SessionState {
  messages: SessionMessage[];
  memory: {
    blackboard: Record<string, unknown>;
    scratchpad: string[];
    attributes: Record<string, unknown>;
  };
  currentStep?: string;
  isRunning: boolean;
  lastError?: string | null;
}

// Legacy alias for backwards compatibility
export type Session = FreeAgentSession;

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowVisibility = 'private' | 'organization' | 'public';
export type WorkflowStatus = 'draft' | 'active' | 'archived';

export interface Workflow {
  id: string;
  user_id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  category: string | null;
  tags: string[] | null;
  status: WorkflowStatus;
  visibility: WorkflowVisibility;
  current_version_id: string | null;
  version_count: number;
  execution_count: number;
  last_executed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowVersion {
  id: string;
  workflow_id: string;
  version_number: number;
  workflow_data: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface WorkflowExecution {
  id: string;
  workflow_id: string;
  version_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input_data: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string;
  started_at: string;
  completed_at?: string;
}

// ============================================================================
// Secrets Types
// ============================================================================

export interface Secret {
  id: string;
  user_id: string;
  secret_key: string;
  created_at: string;
  updated_at: string;
  // encrypted_value is NOT exposed to frontend
}

export interface EncryptedSecret {
  id: string;
  user_id: string;
  secret_key: string;
  description?: string | null;
  encryption_key_version: number;
  last_used_at?: string | null;
  created_at: string;
  updated_at: string;
  // encrypted_value is NOT exposed to frontend
}

export interface SecretInput {
  secret_key: string;
  secret_value: string;
  description?: string;
}

// ============================================================================
// Collaboration Types
// ============================================================================

export type CollaboratorRole = 'owner' | 'editor' | 'viewer';

export interface SessionCollaborator {
  id: string;
  session_id: string;
  user_id: string;
  role: CollaboratorRole;
  joined_at: string;
}

export interface WorkflowCollaborator {
  id: string;
  workflow_id: string;
  user_id: string;
  role: CollaboratorRole;
  joined_at: string;
}

export interface SessionComment {
  id: string;
  session_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Usage & Analytics Types
// ============================================================================

export interface ApiUsageLog {
  id: string;
  user_id: string;
  session_id?: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export interface UsageQuota {
  id: string;
  organization_id: string;
  quota_type: 'tokens' | 'api_calls' | 'storage';
  quota_limit: number;
  current_usage: number;
  reset_at: string;
}

export interface UsageSummary {
  total_sessions: number;
  total_workflows: number;
  total_api_calls: number;
  total_cost_usd: number;
  period_start: string;
  period_end: string;
}

// ============================================================================
// Agent & Memory Types
// ============================================================================

export interface AgentMemory {
  blackboard: Record<string, unknown>;
  scratchpad: string[];
  attributes: Record<string, unknown>;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface LoadingState {
  isLoading: boolean;
  error: string | null;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
}

// ============================================================================
// Form Types
// ============================================================================

export interface LoginFormData {
  email: string;
  password: string;
}

export interface SessionCreateFormData {
  name: string;
  model: string;
  initialPrompt?: string;
}

export interface WorkflowCreateFormData {
  name: string;
  description?: string;
  visibility: WorkflowVisibility;
}
