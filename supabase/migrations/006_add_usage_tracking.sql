/**
 * Migration: Add Cost Tracking and Usage Monitoring Tables
 *
 * This migration creates the infrastructure for tracking AI API usage,
 * calculating costs, and enforcing quotas.
 *
 * Tables:
 * - api_usage_logs: Log every AI API call with tokens and cost
 * - usage_quotas: Define and track quota limits per organization
 * - cost_estimates: Store pricing data for all AI models
 *
 * @version 006
 * @created 2026-01-28
 */

-- ============================================================================
-- COST ESTIMATES TABLE
-- ============================================================================

-- Store pricing information for all AI models
CREATE TABLE IF NOT EXISTS cost_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'xai'
  model TEXT NOT NULL,
  input_cost_per_1k_tokens DECIMAL(10, 6) NOT NULL, -- Cost per 1000 input tokens
  output_cost_per_1k_tokens DECIMAL(10, 6) NOT NULL, -- Cost per 1000 output tokens
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider, model, effective_date)
);

COMMENT ON TABLE cost_estimates IS 'Pricing data for AI models from various providers';
COMMENT ON COLUMN cost_estimates.provider IS 'AI provider name (openai, anthropic, google, xai)';
COMMENT ON COLUMN cost_estimates.model IS 'Model identifier (e.g., gpt-4, claude-3-5-sonnet)';
COMMENT ON COLUMN cost_estimates.input_cost_per_1k_tokens IS 'Cost in USD per 1000 input tokens';
COMMENT ON COLUMN cost_estimates.output_cost_per_1k_tokens IS 'Cost in USD per 1000 output tokens';

-- Index for fast lookups
CREATE INDEX idx_cost_estimates_provider_model ON cost_estimates(provider, model, effective_date DESC);

-- ============================================================================
-- API USAGE LOGS TABLE
-- ============================================================================

-- Log every AI API call with detailed metrics
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID REFERENCES free_agent_sessions(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', 'google', 'xai'
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
  cost_usd DECIMAL(10, 6) NOT NULL DEFAULT 0.0,
  request_data JSONB DEFAULT '{}'::jsonb, -- Optional: request metadata
  response_data JSONB DEFAULT '{}'::jsonb, -- Optional: response metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE api_usage_logs IS 'Comprehensive log of all AI API calls with cost tracking';
COMMENT ON COLUMN api_usage_logs.user_id IS 'User who made the API call';
COMMENT ON COLUMN api_usage_logs.organization_id IS 'Organization the user belongs to';
COMMENT ON COLUMN api_usage_logs.session_id IS 'Optional: associated agent session';
COMMENT ON COLUMN api_usage_logs.workflow_id IS 'Optional: associated workflow';
COMMENT ON COLUMN api_usage_logs.provider IS 'AI provider (openai, anthropic, google, xai)';
COMMENT ON COLUMN api_usage_logs.model IS 'Model used for the API call';
COMMENT ON COLUMN api_usage_logs.cost_usd IS 'Calculated cost in USD';

-- Indexes for common queries
CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id, created_at DESC);
CREATE INDEX idx_api_usage_logs_org_id ON api_usage_logs(organization_id, created_at DESC);
CREATE INDEX idx_api_usage_logs_session_id ON api_usage_logs(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_api_usage_logs_workflow_id ON api_usage_logs(workflow_id) WHERE workflow_id IS NOT NULL;
CREATE INDEX idx_api_usage_logs_provider_model ON api_usage_logs(provider, model, created_at DESC);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at DESC);

-- Partial index for expensive queries (cost > $1)
CREATE INDEX idx_api_usage_logs_expensive ON api_usage_logs(cost_usd DESC, created_at DESC) WHERE cost_usd > 1.0;

-- ============================================================================
-- USAGE QUOTAS TABLE
-- ============================================================================

-- Define quota limits per organization
CREATE TABLE IF NOT EXISTS usage_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  quota_type TEXT NOT NULL CHECK (quota_type IN ('daily', 'monthly', 'per_model', 'total')),
  provider TEXT, -- Optional: limit specific provider
  model TEXT, -- Optional: limit specific model
  quota_limit DECIMAL(10, 2) NOT NULL, -- Limit in USD
  current_usage DECIMAL(10, 2) NOT NULL DEFAULT 0.0,
  reset_at TIMESTAMPTZ NOT NULL,
  last_reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, quota_type, provider, model)
);

COMMENT ON TABLE usage_quotas IS 'Quota limits and current usage tracking per organization';
COMMENT ON COLUMN usage_quotas.quota_type IS 'Type of quota: daily, monthly, per_model, total';
COMMENT ON COLUMN usage_quotas.provider IS 'Optional: specific provider for quota';
COMMENT ON COLUMN usage_quotas.model IS 'Optional: specific model for quota';
COMMENT ON COLUMN usage_quotas.quota_limit IS 'Maximum allowed cost in USD';
COMMENT ON COLUMN usage_quotas.current_usage IS 'Current accumulated cost in USD';
COMMENT ON COLUMN usage_quotas.reset_at IS 'When the quota resets (next midnight for daily, etc.)';

-- Index for fast quota checks
CREATE INDEX idx_usage_quotas_org_id ON usage_quotas(organization_id, quota_type);
CREATE INDEX idx_usage_quotas_reset_at ON usage_quotas(reset_at) WHERE current_usage > 0;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

/**
 * Log API Usage
 *
 * Inserts a usage log and updates quota tracking
 */
CREATE OR REPLACE FUNCTION log_api_usage(
  p_user_id UUID,
  p_organization_id UUID,
  p_session_id UUID,
  p_workflow_id UUID,
  p_provider TEXT,
  p_model TEXT,
  p_input_tokens INTEGER,
  p_output_tokens INTEGER,
  p_cost_usd DECIMAL,
  p_request_data JSONB DEFAULT '{}'::jsonb,
  p_response_data JSONB DEFAULT '{}'::jsonb
) RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  -- Insert usage log
  INSERT INTO api_usage_logs (
    user_id,
    organization_id,
    session_id,
    workflow_id,
    provider,
    model,
    input_tokens,
    output_tokens,
    cost_usd,
    request_data,
    response_data
  ) VALUES (
    p_user_id,
    p_organization_id,
    p_session_id,
    p_workflow_id,
    p_provider,
    p_model,
    p_input_tokens,
    p_output_tokens,
    p_cost_usd,
    p_request_data,
    p_response_data
  ) RETURNING id INTO v_log_id;

  -- Update quota usage
  UPDATE usage_quotas
  SET
    current_usage = current_usage + p_cost_usd,
    updated_at = NOW()
  WHERE
    organization_id = p_organization_id
    AND (provider IS NULL OR provider = p_provider)
    AND (model IS NULL OR model = p_model)
    AND reset_at > NOW();

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION log_api_usage IS 'Log AI API usage and update quota tracking';

/**
 * Check Quota
 *
 * Returns whether the organization has remaining quota
 */
CREATE OR REPLACE FUNCTION check_quota(
  p_organization_id UUID,
  p_provider TEXT DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_estimated_cost DECIMAL DEFAULT 0.0
) RETURNS TABLE (
  allowed BOOLEAN,
  quota_limit DECIMAL,
  current_usage DECIMAL,
  remaining DECIMAL,
  quota_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (uq.current_usage + p_estimated_cost <= uq.quota_limit) AS allowed,
    uq.quota_limit,
    uq.current_usage,
    (uq.quota_limit - uq.current_usage) AS remaining,
    uq.quota_type
  FROM usage_quotas uq
  WHERE
    uq.organization_id = p_organization_id
    AND (uq.provider IS NULL OR uq.provider = p_provider)
    AND (uq.model IS NULL OR uq.model = p_model)
    AND uq.reset_at > NOW()
  ORDER BY
    -- Prioritize most restrictive quota
    CASE WHEN uq.model IS NOT NULL THEN 1
         WHEN uq.provider IS NOT NULL THEN 2
         ELSE 3
    END,
    uq.quota_type;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_quota IS 'Check if organization has remaining quota for estimated cost';

/**
 * Reset Expired Quotas
 *
 * Called by cron job to reset quotas that have expired
 */
CREATE OR REPLACE FUNCTION reset_expired_quotas() RETURNS INTEGER AS $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE usage_quotas
  SET
    current_usage = 0.0,
    last_reset_at = reset_at,
    reset_at = CASE
      WHEN quota_type = 'daily' THEN reset_at + INTERVAL '1 day'
      WHEN quota_type = 'monthly' THEN reset_at + INTERVAL '1 month'
      ELSE reset_at
    END,
    updated_at = NOW()
  WHERE reset_at <= NOW();

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;
  RETURN v_reset_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_expired_quotas IS 'Reset quotas that have passed their reset_at timestamp';

/**
 * Get Usage Summary
 *
 * Returns aggregated usage statistics for an organization
 */
CREATE OR REPLACE FUNCTION get_usage_summary(
  p_organization_id UUID,
  p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
  p_end_date TIMESTAMPTZ DEFAULT NOW()
) RETURNS TABLE (
  total_cost DECIMAL,
  total_tokens BIGINT,
  total_calls BIGINT,
  by_provider JSONB,
  by_model JSONB,
  by_day JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(cost_usd), 0)::DECIMAL AS total_cost,
    COALESCE(SUM(total_tokens), 0)::BIGINT AS total_tokens,
    COUNT(*)::BIGINT AS total_calls,
    -- Group by provider
    COALESCE(
      jsonb_object_agg(
        provider_group.provider,
        jsonb_build_object(
          'cost', provider_group.cost,
          'tokens', provider_group.tokens,
          'calls', provider_group.calls
        )
      ) FILTER (WHERE provider_group.provider IS NOT NULL),
      '{}'::jsonb
    ) AS by_provider,
    -- Group by model
    COALESCE(
      jsonb_object_agg(
        model_group.model,
        jsonb_build_object(
          'cost', model_group.cost,
          'tokens', model_group.tokens,
          'calls', model_group.calls
        )
      ) FILTER (WHERE model_group.model IS NOT NULL),
      '{}'::jsonb
    ) AS by_model,
    -- Group by day
    COALESCE(
      jsonb_object_agg(
        day_group.day,
        jsonb_build_object(
          'cost', day_group.cost,
          'tokens', day_group.tokens,
          'calls', day_group.calls
        )
      ) FILTER (WHERE day_group.day IS NOT NULL),
      '{}'::jsonb
    ) AS by_day
  FROM api_usage_logs logs
  LEFT JOIN LATERAL (
    SELECT
      logs.provider,
      SUM(logs.cost_usd) AS cost,
      SUM(logs.total_tokens) AS tokens,
      COUNT(*) AS calls
    FROM api_usage_logs
    WHERE organization_id = p_organization_id
      AND created_at BETWEEN p_start_date AND p_end_date
    GROUP BY logs.provider
  ) provider_group ON true
  LEFT JOIN LATERAL (
    SELECT
      logs.model,
      SUM(logs.cost_usd) AS cost,
      SUM(logs.total_tokens) AS tokens,
      COUNT(*) AS calls
    FROM api_usage_logs
    WHERE organization_id = p_organization_id
      AND created_at BETWEEN p_start_date AND p_end_date
    GROUP BY logs.model
  ) model_group ON true
  LEFT JOIN LATERAL (
    SELECT
      DATE(logs.created_at) AS day,
      SUM(logs.cost_usd) AS cost,
      SUM(logs.total_tokens) AS tokens,
      COUNT(*) AS calls
    FROM api_usage_logs
    WHERE organization_id = p_organization_id
      AND created_at BETWEEN p_start_date AND p_end_date
    GROUP BY DATE(logs.created_at)
  ) day_group ON true
  WHERE logs.organization_id = p_organization_id
    AND logs.created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_usage_summary IS 'Get aggregated usage statistics for an organization';

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS
ALTER TABLE cost_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_quotas ENABLE ROW LEVEL SECURITY;

-- Cost Estimates: Read-only for all authenticated users
CREATE POLICY cost_estimates_read ON cost_estimates
  FOR SELECT
  TO authenticated
  USING (true);

-- API Usage Logs: Users can read their own logs, admins can read all
CREATE POLICY api_usage_logs_read_own ON api_usage_logs
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- API Usage Logs: Only system can insert (via functions)
CREATE POLICY api_usage_logs_insert_system ON api_usage_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Usage Quotas: Users can read their organization's quotas
CREATE POLICY usage_quotas_read ON usage_quotas
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Usage Quotas: Only admins can modify quotas
CREATE POLICY usage_quotas_modify_admin ON usage_quotas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role = 'admin'
        AND organization_id = usage_quotas.organization_id
    )
  );

-- ============================================================================
-- INITIAL DATA SEEDING
-- ============================================================================

-- Seed cost estimates with current pricing (as of January 2026)
-- OpenAI Models
INSERT INTO cost_estimates (provider, model, input_cost_per_1k_tokens, output_cost_per_1k_tokens) VALUES
  ('openai', 'gpt-4', 0.03, 0.06),
  ('openai', 'gpt-4-32k', 0.06, 0.12),
  ('openai', 'gpt-4-turbo', 0.01, 0.03),
  ('openai', 'gpt-3.5-turbo', 0.0015, 0.002),
  ('openai', 'gpt-3.5-turbo-16k', 0.003, 0.004)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- Anthropic Models
INSERT INTO cost_estimates (provider, model, input_cost_per_1k_tokens, output_cost_per_1k_tokens) VALUES
  ('anthropic', 'claude-3-5-sonnet-20241022', 0.003, 0.015),
  ('anthropic', 'claude-3-opus-20240229', 0.015, 0.075),
  ('anthropic', 'claude-3-sonnet-20240229', 0.003, 0.015),
  ('anthropic', 'claude-3-haiku-20240307', 0.00025, 0.00125)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- Google Models
INSERT INTO cost_estimates (provider, model, input_cost_per_1k_tokens, output_cost_per_1k_tokens) VALUES
  ('google', 'gemini-pro', 0.00025, 0.0005),
  ('google', 'gemini-pro-vision', 0.00025, 0.0005),
  ('google', 'gemini-1.5-pro', 0.0035, 0.0105),
  ('google', 'gemini-1.5-flash', 0.00035, 0.00105)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- xAI Models
INSERT INTO cost_estimates (provider, model, input_cost_per_1k_tokens, output_cost_per_1k_tokens) VALUES
  ('xai', 'grok-beta', 0.005, 0.015)
ON CONFLICT (provider, model, effective_date) DO NOTHING;

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Composite index for quota checks (most common query)
CREATE INDEX idx_usage_quotas_check ON usage_quotas(organization_id, reset_at) WHERE current_usage > 0;

-- Index for cost analysis queries
CREATE INDEX idx_api_usage_logs_cost_analysis ON api_usage_logs(organization_id, created_at DESC, cost_usd DESC);

-- Partial index for recent usage (last 30 days)
CREATE INDEX idx_api_usage_logs_recent ON api_usage_logs(organization_id, created_at DESC)
  WHERE created_at > NOW() - INTERVAL '30 days';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update updated_at timestamp automatically
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER cost_estimates_updated_at
  BEFORE UPDATE ON cost_estimates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER usage_quotas_updated_at
  BEFORE UPDATE ON usage_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON SCHEMA public IS 'Phase 2.2: Cost Tracking and Usage Monitoring System';
