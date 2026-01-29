/**
 * Migration 007: Comprehensive Database Indexes
 *
 * Phase 2.3: Performance Optimization
 *
 * Creates indexes for all frequently queried tables to improve performance
 * Target: 50%+ reduction in query time for common operations
 */

-- ============================================================================
-- API Usage Logs Indexes
-- ============================================================================

-- Index for querying by organization and time range (most common query)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_org_time
ON api_usage_logs(organization_id, created_at DESC);

-- Index for querying by user and time range
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_user_time
ON api_usage_logs(user_id, created_at DESC);

-- Index for querying by provider
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider
ON api_usage_logs(provider, created_at DESC);

-- Index for querying by model
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_model
ON api_usage_logs(model, created_at DESC);

-- Composite index for provider + model queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_provider_model
ON api_usage_logs(provider, model, created_at DESC);

-- Index for cost-based queries (find expensive calls)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_cost
ON api_usage_logs(cost_usd DESC, created_at DESC);

-- Index for session-based queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_session
ON api_usage_logs(session_id, created_at DESC)
WHERE session_id IS NOT NULL;

-- Index for workflow-based queries
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_workflow
ON api_usage_logs(workflow_id, created_at DESC)
WHERE workflow_id IS NOT NULL;

-- Composite index for organization + provider + time (analytics queries)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_org_provider_time
ON api_usage_logs(organization_id, provider, created_at DESC);

-- Composite index for organization + model + time (analytics queries)
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_org_model_time
ON api_usage_logs(organization_id, model, created_at DESC);

-- ============================================================================
-- Free Agent Sessions Indexes
-- ============================================================================

-- Index for querying user's sessions
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_user
ON free_agent_sessions(user_id, updated_at DESC);

-- Index for querying organization's sessions
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_org
ON free_agent_sessions(organization_id, updated_at DESC);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_status
ON free_agent_sessions(status, updated_at DESC);

-- Index for querying active sessions
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_active
ON free_agent_sessions(user_id, status, updated_at DESC)
WHERE status IN ('active', 'running');

-- Composite index for user + status queries
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_user_status
ON free_agent_sessions(user_id, status, updated_at DESC);

-- Index for created_at queries
CREATE INDEX IF NOT EXISTS idx_free_agent_sessions_created
ON free_agent_sessions(created_at DESC);

-- ============================================================================
-- Session Snapshots Indexes
-- ============================================================================

-- Index for querying snapshots by session
CREATE INDEX IF NOT EXISTS idx_session_snapshots_session
ON session_snapshots(session_id, snapshot_number DESC);

-- Index for querying latest snapshots
CREATE INDEX IF NOT EXISTS idx_session_snapshots_latest
ON session_snapshots(session_id, created_at DESC);

-- Index for cleanup queries (old snapshots)
CREATE INDEX IF NOT EXISTS idx_session_snapshots_cleanup
ON session_snapshots(created_at)
WHERE created_at < NOW() - INTERVAL '90 days';

-- ============================================================================
-- Workflows Indexes
-- ============================================================================

-- Index for querying user's workflows
CREATE INDEX IF NOT EXISTS idx_workflows_user
ON workflows(user_id, updated_at DESC);

-- Index for querying organization's workflows
CREATE INDEX IF NOT EXISTS idx_workflows_org
ON workflows(organization_id, updated_at DESC);

-- Index for querying by visibility
CREATE INDEX IF NOT EXISTS idx_workflows_visibility
ON workflows(visibility, updated_at DESC);

-- Index for public workflows (marketplace)
CREATE INDEX IF NOT EXISTS idx_workflows_public
ON workflows(visibility, updated_at DESC)
WHERE visibility = 'public';

-- Index for searching by name
CREATE INDEX IF NOT EXISTS idx_workflows_name
ON workflows USING gin(to_tsvector('english', name));

-- Index for searching by description
CREATE INDEX IF NOT EXISTS idx_workflows_description
ON workflows USING gin(to_tsvector('english', description));

-- ============================================================================
-- Workflow Versions Indexes
-- ============================================================================

-- Index for querying versions by workflow
CREATE INDEX IF NOT EXISTS idx_workflow_versions_workflow
ON workflow_versions(workflow_id, version_number DESC);

-- Index for querying latest version
CREATE INDEX IF NOT EXISTS idx_workflow_versions_latest
ON workflow_versions(workflow_id, created_at DESC);

-- ============================================================================
-- Workflow Executions Indexes
-- ============================================================================

-- Index for querying executions by workflow
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow
ON workflow_executions(workflow_id, created_at DESC);

-- Index for querying by status
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
ON workflow_executions(status, created_at DESC);

-- Index for querying running executions
CREATE INDEX IF NOT EXISTS idx_workflow_executions_running
ON workflow_executions(workflow_id, status, created_at DESC)
WHERE status = 'running';

-- Composite index for workflow + status
CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_status
ON workflow_executions(workflow_id, status, created_at DESC);

-- ============================================================================
-- Usage Quotas Indexes
-- ============================================================================

-- Index for querying quotas by organization
CREATE INDEX IF NOT EXISTS idx_usage_quotas_org
ON usage_quotas(organization_id, quota_type);

-- Index for querying active quotas (not expired)
CREATE INDEX IF NOT EXISTS idx_usage_quotas_active
ON usage_quotas(organization_id, reset_at DESC)
WHERE reset_at > NOW();

-- Index for cleanup queries (expired quotas)
CREATE INDEX IF NOT EXISTS idx_usage_quotas_expired
ON usage_quotas(reset_at)
WHERE reset_at <= NOW();

-- Composite index for provider-specific quotas
CREATE INDEX IF NOT EXISTS idx_usage_quotas_provider
ON usage_quotas(organization_id, provider, quota_type)
WHERE provider IS NOT NULL;

-- Composite index for model-specific quotas
CREATE INDEX IF NOT EXISTS idx_usage_quotas_model
ON usage_quotas(organization_id, model, quota_type)
WHERE model IS NOT NULL;

-- ============================================================================
-- Cost Estimates Indexes
-- ============================================================================

-- Index for querying by provider and model
CREATE INDEX IF NOT EXISTS idx_cost_estimates_provider_model
ON cost_estimates(provider, model, effective_date DESC);

-- Index for latest estimates
CREATE INDEX IF NOT EXISTS idx_cost_estimates_latest
ON cost_estimates(provider, model, effective_date DESC);

-- ============================================================================
-- Users Indexes
-- ============================================================================

-- Index for querying by organization
CREATE INDEX IF NOT EXISTS idx_users_org
ON users(organization_id, created_at DESC);

-- Index for querying by email (if not already primary key)
CREATE INDEX IF NOT EXISTS idx_users_email
ON users(email);

-- ============================================================================
-- Organizations Indexes
-- ============================================================================

-- Index for querying by slug (if used for routing)
CREATE INDEX IF NOT EXISTS idx_organizations_slug
ON organizations(slug);

-- Index for querying by plan tier
CREATE INDEX IF NOT EXISTS idx_organizations_plan
ON organizations(plan_tier);

-- ============================================================================
-- Session Collaborators Indexes
-- ============================================================================

-- Index for querying collaborators by session
CREATE INDEX IF NOT EXISTS idx_session_collaborators_session
ON session_collaborators(session_id, role);

-- Index for querying sessions by user
CREATE INDEX IF NOT EXISTS idx_session_collaborators_user
ON session_collaborators(user_id, session_id);

-- ============================================================================
-- Workflow Collaborators Indexes
-- ============================================================================

-- Index for querying collaborators by workflow
CREATE INDEX IF NOT EXISTS idx_workflow_collaborators_workflow
ON workflow_collaborators(workflow_id, role);

-- Index for querying workflows by user
CREATE INDEX IF NOT EXISTS idx_workflow_collaborators_user
ON workflow_collaborators(user_id, workflow_id);

-- ============================================================================
-- Session Comments Indexes
-- ============================================================================

-- Index for querying comments by session
CREATE INDEX IF NOT EXISTS idx_session_comments_session
ON session_comments(session_id, created_at DESC);

-- Index for querying comments by user
CREATE INDEX IF NOT EXISTS idx_session_comments_user
ON session_comments(user_id, created_at DESC);

-- ============================================================================
-- Analyze Tables for Optimal Query Planning
-- ============================================================================

ANALYZE api_usage_logs;
ANALYZE free_agent_sessions;
ANALYZE session_snapshots;
ANALYZE workflows;
ANALYZE workflow_versions;
ANALYZE workflow_executions;
ANALYZE usage_quotas;
ANALYZE cost_estimates;
ANALYZE users;
ANALYZE organizations;
ANALYZE session_collaborators;
ANALYZE workflow_collaborators;
ANALYZE session_comments;

-- ============================================================================
-- Add Comments for Documentation
-- ============================================================================

COMMENT ON INDEX idx_api_usage_logs_org_time IS 'Optimizes organization usage queries with time filtering';
COMMENT ON INDEX idx_api_usage_logs_cost IS 'Optimizes queries for most expensive API calls';
COMMENT ON INDEX idx_free_agent_sessions_active IS 'Optimizes queries for active user sessions';
COMMENT ON INDEX idx_session_snapshots_session IS 'Optimizes snapshot retrieval by session';
COMMENT ON INDEX idx_workflows_public IS 'Optimizes marketplace workflow browsing';
COMMENT ON INDEX idx_workflow_executions_running IS 'Optimizes monitoring of running workflows';
COMMENT ON INDEX idx_usage_quotas_active IS 'Optimizes active quota lookups';

-- ============================================================================
-- Performance Notes
-- ============================================================================

/**
 * Index Strategy:
 *
 * 1. Most Common Queries:
 *    - User's sessions (idx_free_agent_sessions_user)
 *    - Organization usage (idx_api_usage_logs_org_time)
 *    - Active sessions (idx_free_agent_sessions_active)
 *    - Quota checks (idx_usage_quotas_active)
 *
 * 2. Time-Series Queries:
 *    - All time-based indexes use DESC for recent-first ordering
 *    - Composite indexes include created_at/updated_at for efficient filtering
 *
 * 3. Full-Text Search:
 *    - GIN indexes on workflow name/description for fast search
 *
 * 4. Partial Indexes:
 *    - Only index relevant rows (e.g., WHERE status = 'active')
 *    - Reduces index size and improves performance
 *
 * Expected Performance Improvements:
 * - Session queries: 100ms → 20ms (80% faster)
 * - Usage analytics: 500ms → 100ms (80% faster)
 * - Quota checks: 50ms → 10ms (80% faster)
 * - Workflow browsing: 200ms → 40ms (80% faster)
 *
 * Maintenance:
 * - Run ANALYZE monthly to update statistics
 * - Monitor index usage with pg_stat_user_indexes
 * - Consider REINDEX for heavily updated tables
 */
