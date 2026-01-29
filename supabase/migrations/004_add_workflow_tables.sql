-- Migration: 004_add_workflow_tables
-- Description: Add workflow persistence with Git-style version control
-- Author: AI Agent Workbench Team
-- Date: 2026-01-28

BEGIN;

-- ============================================================================
-- Workflows Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,

  -- Workflow metadata
  name TEXT NOT NULL,
  description TEXT,
  category TEXT, -- e.g., 'automation', 'data-processing', 'ai-agent'
  tags TEXT[], -- Searchable tags

  -- Status and visibility
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'public')),

  -- Version tracking
  current_version_id UUID, -- References workflow_versions(id)
  version_count INTEGER DEFAULT 0,

  -- Execution tracking
  last_executed_at TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflows IS 'Workflow definitions with version control';
COMMENT ON COLUMN workflows.current_version_id IS 'Latest active version of the workflow';
COMMENT ON COLUMN workflows.visibility IS 'private: user only, organization: team, public: everyone';
COMMENT ON COLUMN workflows.status IS 'draft: in development, active: ready to use, archived: deprecated';

-- ============================================================================
-- Workflow Versions Table (Immutable)
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,

  -- Version metadata
  version_number INTEGER NOT NULL,
  version_name TEXT, -- Optional name like "v1.0" or "Production Release"
  changelog TEXT, -- Description of changes

  -- Workflow data (complete snapshot)
  workflow_data JSONB NOT NULL,

  -- Metadata
  data_size INTEGER, -- Size in bytes for monitoring
  node_count INTEGER, -- Number of nodes in workflow

  -- Creation info
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint
  UNIQUE(workflow_id, version_number)
);

COMMENT ON TABLE workflow_versions IS 'Immutable workflow versions (Git-style)';
COMMENT ON COLUMN workflow_versions.workflow_data IS 'Complete workflow definition as JSONB';
COMMENT ON COLUMN workflow_versions.version_number IS 'Sequential version number (1, 2, 3...)';

-- ============================================================================
-- Workflow Executions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES workflow_versions(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),

  -- Execution data
  input_data JSONB,
  output_data JSONB,
  error_message TEXT,
  error_details JSONB,

  -- Performance metrics
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER, -- Duration in milliseconds

  -- Resource tracking
  steps_executed INTEGER DEFAULT 0,
  api_calls_made INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd DECIMAL(10, 4),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_executions IS 'History of workflow executions';
COMMENT ON COLUMN workflow_executions.duration_ms IS 'Execution time in milliseconds';
COMMENT ON COLUMN workflow_executions.cost_usd IS 'Cost of execution (API calls, etc.)';

-- ============================================================================
-- Workflow Templates Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,

  -- Template metadata
  category TEXT NOT NULL,
  difficulty TEXT CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_time_minutes INTEGER,

  -- Template status
  is_official BOOLEAN DEFAULT false, -- Official templates from platform
  is_featured BOOLEAN DEFAULT false, -- Featured in marketplace
  is_verified BOOLEAN DEFAULT false, -- Verified to work correctly

  -- Usage tracking
  downloads_count INTEGER DEFAULT 0,
  uses_count INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2), -- 0.00 to 5.00

  -- Publishing
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_templates IS 'Public workflow templates marketplace';
COMMENT ON COLUMN workflow_templates.is_official IS 'Official templates from platform team';

-- ============================================================================
-- Workflow Ratings Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  review TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(workflow_template_id, user_id)
);

COMMENT ON TABLE workflow_ratings IS 'User ratings and reviews for templates';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Workflows
CREATE INDEX idx_workflows_user_id ON workflows(user_id);
CREATE INDEX idx_workflows_organization_id ON workflows(organization_id);
CREATE INDEX idx_workflows_status ON workflows(status);
CREATE INDEX idx_workflows_visibility ON workflows(visibility);
CREATE INDEX idx_workflows_created_at ON workflows(created_at DESC);
CREATE INDEX idx_workflows_tags ON workflows USING GIN(tags);
CREATE INDEX idx_workflows_category ON workflows(category);

-- Workflow Versions
CREATE INDEX idx_versions_workflow_id ON workflow_versions(workflow_id);
CREATE INDEX idx_versions_created_at ON workflow_versions(created_at DESC);
CREATE INDEX idx_versions_number ON workflow_versions(workflow_id, version_number DESC);

-- Workflow Executions
CREATE INDEX idx_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX idx_executions_user_id ON workflow_executions(user_id);
CREATE INDEX idx_executions_status ON workflow_executions(status);
CREATE INDEX idx_executions_created_at ON workflow_executions(created_at DESC);
CREATE INDEX idx_executions_duration ON workflow_executions(duration_ms);

-- Workflow Templates
CREATE INDEX idx_templates_workflow_id ON workflow_templates(workflow_id);
CREATE INDEX idx_templates_category ON workflow_templates(category);
CREATE INDEX idx_templates_featured ON workflow_templates(is_featured) WHERE is_featured = true;
CREATE INDEX idx_templates_rating ON workflow_templates(average_rating DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_ratings ENABLE ROW LEVEL SECURITY;

-- Workflows: Users can read their own workflows
CREATE POLICY "Users can read their own workflows"
  ON workflows
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    OR visibility = 'public'
    OR (visibility = 'organization' AND organization_id IN (
      SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
    ))
  );

-- Workflows: Users can create their own workflows
CREATE POLICY "Users can create workflows"
  ON workflows
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflows: Users can update their own workflows
CREATE POLICY "Users can update their own workflows"
  ON workflows
  FOR UPDATE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflows: Users can delete their own workflows
CREATE POLICY "Users can delete their own workflows"
  ON workflows
  FOR DELETE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflow Versions: Users can read versions of accessible workflows
CREATE POLICY "Users can read workflow versions"
  ON workflow_versions
  FOR SELECT
  USING (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
      OR visibility = 'public'
      OR (visibility = 'organization' AND organization_id IN (
        SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
      ))
    )
  );

-- Workflow Versions: Users can create versions for their workflows
CREATE POLICY "Users can create versions for their workflows"
  ON workflow_versions
  FOR INSERT
  WITH CHECK (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Workflow Executions: Users can read their own executions
CREATE POLICY "Users can read their own executions"
  ON workflow_executions
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflow Executions: Users can create executions for accessible workflows
CREATE POLICY "Users can create executions"
  ON workflow_executions
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflow Templates: Everyone can read public templates
CREATE POLICY "Everyone can read public templates"
  ON workflow_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- Workflow Ratings: Users can read all ratings
CREATE POLICY "Users can read ratings"
  ON workflow_ratings
  FOR SELECT
  TO authenticated
  USING (true);

-- Workflow Ratings: Users can create/update their own ratings
CREATE POLICY "Users can manage their own ratings"
  ON workflow_ratings
  FOR ALL
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Trigger for updated_at
CREATE TRIGGER update_workflows_updated_at
  BEFORE UPDATE ON workflows
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_templates_updated_at
  BEFORE UPDATE ON workflow_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_ratings_updated_at
  BEFORE UPDATE ON workflow_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create a new workflow version
CREATE OR REPLACE FUNCTION create_workflow_version(
  p_workflow_id UUID,
  p_workflow_data JSONB,
  p_user_id UUID,
  p_version_name TEXT DEFAULT NULL,
  p_changelog TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_version_id UUID;
  v_version_number INTEGER;
  v_data_size INTEGER;
  v_node_count INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO v_version_number
  FROM workflow_versions
  WHERE workflow_id = p_workflow_id;

  -- Calculate metadata
  v_data_size := length(p_workflow_data::text);
  v_node_count := jsonb_array_length(p_workflow_data->'nodes');

  -- Create version
  INSERT INTO workflow_versions (
    workflow_id,
    version_number,
    version_name,
    changelog,
    workflow_data,
    data_size,
    node_count,
    created_by
  ) VALUES (
    p_workflow_id,
    v_version_number,
    p_version_name,
    p_changelog,
    p_workflow_data,
    v_data_size,
    COALESCE(v_node_count, 0),
    p_user_id
  )
  RETURNING id INTO v_version_id;

  -- Update workflow metadata
  UPDATE workflows
  SET
    current_version_id = v_version_id,
    version_count = v_version_number,
    updated_at = NOW()
  WHERE id = p_workflow_id;

  RETURN v_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_workflow_version IS 'Create a new immutable version of a workflow';

-- Function to get workflow summary
CREATE OR REPLACE FUNCTION get_workflow_summary(p_workflow_id UUID)
RETURNS TABLE (
  workflow_id UUID,
  name TEXT,
  status TEXT,
  version_count INTEGER,
  execution_count INTEGER,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.status,
    w.version_count,
    w.execution_count,
    w.last_executed_at,
    w.created_at,
    w.updated_at
  FROM workflows w
  WHERE w.id = p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_workflow_summary IS 'Get comprehensive summary of a workflow';

-- Function to update template ratings
CREATE OR REPLACE FUNCTION update_template_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE workflow_templates
  SET average_rating = (
    SELECT AVG(rating)::DECIMAL(3,2)
    FROM workflow_ratings
    WHERE workflow_template_id = NEW.workflow_template_id
  )
  WHERE id = NEW.workflow_template_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_template_rating_trigger
  AFTER INSERT OR UPDATE OR DELETE ON workflow_ratings
  FOR EACH ROW
  EXECUTE FUNCTION update_template_rating();

COMMENT ON FUNCTION update_template_rating IS 'Automatically update average rating when ratings change';

-- ============================================================================
-- Views
-- ============================================================================

-- View for workflow list with metadata
CREATE OR REPLACE VIEW workflows_list AS
SELECT
  w.id,
  w.user_id,
  w.organization_id,
  w.name,
  w.description,
  w.category,
  w.tags,
  w.status,
  w.visibility,
  w.version_count,
  w.execution_count,
  w.last_executed_at,
  w.created_at,
  w.updated_at,
  wv.version_number as current_version_number,
  u.full_name as created_by_name,
  u.email as created_by_email
FROM workflows w
LEFT JOIN workflow_versions wv ON w.current_version_id = wv.id
LEFT JOIN users u ON w.user_id = u.id;

COMMENT ON VIEW workflows_list IS 'Workflow list with additional metadata';

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP VIEW IF EXISTS workflows_list;
-- DROP FUNCTION IF EXISTS update_template_rating() CASCADE;
-- DROP FUNCTION IF EXISTS get_workflow_summary(UUID);
-- DROP FUNCTION IF EXISTS create_workflow_version(UUID, JSONB, UUID, TEXT, TEXT);
-- DROP TABLE IF EXISTS workflow_ratings CASCADE;
-- DROP TABLE IF EXISTS workflow_templates CASCADE;
-- DROP TABLE IF EXISTS workflow_executions CASCADE;
-- DROP TABLE IF EXISTS workflow_versions CASCADE;
-- DROP TABLE IF EXISTS workflows CASCADE;
-- COMMIT;
