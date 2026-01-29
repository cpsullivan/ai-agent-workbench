-- Migration: 005_add_collaboration_tables
-- Description: Add real-time collaboration infrastructure for sessions and workflows
-- Author: AI Agent Workbench Team
-- Date: 2026-01-28

BEGIN;

-- ============================================================================
-- Session Collaborators Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_agent_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Collaboration role
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),

  -- Invite metadata
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Activity tracking
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT false,

  -- Unique constraint: one role per user per session
  UNIQUE(session_id, user_id)
);

COMMENT ON TABLE session_collaborators IS 'Users who can access and collaborate on sessions';
COMMENT ON COLUMN session_collaborators.role IS 'owner: full control, editor: can edit, viewer: read-only';
COMMENT ON COLUMN session_collaborators.is_active IS 'True if user is currently viewing the session (presence)';

-- ============================================================================
-- Workflow Collaborators Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Collaboration role
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),

  -- Invite metadata
  invited_by UUID REFERENCES users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Activity tracking
  last_seen_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT false,

  -- Unique constraint: one role per user per workflow
  UNIQUE(workflow_id, user_id)
);

COMMENT ON TABLE workflow_collaborators IS 'Users who can access and collaborate on workflows';
COMMENT ON COLUMN workflow_collaborators.role IS 'owner: full control, editor: can edit, viewer: read-only';

-- ============================================================================
-- Session Comments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_agent_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Comment content
  content TEXT NOT NULL,

  -- Threading support
  parent_comment_id UUID REFERENCES session_comments(id) ON DELETE CASCADE,

  -- Metadata
  edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE session_comments IS 'Comments and discussions on sessions';
COMMENT ON COLUMN session_comments.parent_comment_id IS 'For threaded replies';

-- ============================================================================
-- Workflow Comments Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Comment content
  content TEXT NOT NULL,

  -- Threading support
  parent_comment_id UUID REFERENCES workflow_comments(id) ON DELETE CASCADE,

  -- Metadata
  edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE workflow_comments IS 'Comments and discussions on workflows';

-- ============================================================================
-- Presence Tracking Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- What they're viewing
  resource_type TEXT NOT NULL CHECK (resource_type IN ('session', 'workflow')),
  resource_id UUID NOT NULL,

  -- Presence data (cursor position, status, etc.)
  presence_data JSONB DEFAULT '{}'::jsonb,

  -- Timestamps
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique: one presence record per user per resource
  UNIQUE(user_id, resource_type, resource_id)
);

COMMENT ON TABLE user_presence IS 'Real-time presence tracking for collaborative editing';
COMMENT ON COLUMN user_presence.presence_data IS 'Cursor position, status, custom data (JSONB)';
COMMENT ON COLUMN user_presence.last_heartbeat_at IS 'Updated every 30s, used to detect stale connections';

-- ============================================================================
-- Operational Transform (OT) Log Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS collaboration_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What resource is being edited
  resource_type TEXT NOT NULL CHECK (resource_type IN ('session', 'workflow')),
  resource_id UUID NOT NULL,

  -- Who made the change
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Operation details
  operation_type TEXT NOT NULL, -- 'insert', 'delete', 'update', 'move'
  operation_data JSONB NOT NULL,

  -- OT metadata
  vector_clock JSONB NOT NULL, -- Lamport timestamp for ordering
  parent_operation_id UUID REFERENCES collaboration_operations(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Index for querying recent operations
  INDEX idx_operations_resource (resource_type, resource_id, created_at DESC)
);

COMMENT ON TABLE collaboration_operations IS 'Operational Transform log for conflict resolution';
COMMENT ON COLUMN collaboration_operations.vector_clock IS 'Lamport timestamps for operation ordering';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Session Collaborators
CREATE INDEX idx_session_collaborators_session ON session_collaborators(session_id);
CREATE INDEX idx_session_collaborators_user ON session_collaborators(user_id);
CREATE INDEX idx_session_collaborators_active ON session_collaborators(session_id, is_active) WHERE is_active = true;

-- Workflow Collaborators
CREATE INDEX idx_workflow_collaborators_workflow ON workflow_collaborators(workflow_id);
CREATE INDEX idx_workflow_collaborators_user ON workflow_collaborators(user_id);
CREATE INDEX idx_workflow_collaborators_active ON workflow_collaborators(workflow_id, is_active) WHERE is_active = true;

-- Session Comments
CREATE INDEX idx_session_comments_session ON session_comments(session_id, created_at DESC);
CREATE INDEX idx_session_comments_user ON session_comments(user_id);
CREATE INDEX idx_session_comments_parent ON session_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- Workflow Comments
CREATE INDEX idx_workflow_comments_workflow ON workflow_comments(workflow_id, created_at DESC);
CREATE INDEX idx_workflow_comments_user ON workflow_comments(user_id);
CREATE INDEX idx_workflow_comments_parent ON workflow_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;

-- User Presence
CREATE INDEX idx_user_presence_resource ON user_presence(resource_type, resource_id);
CREATE INDEX idx_user_presence_user ON user_presence(user_id);
CREATE INDEX idx_user_presence_heartbeat ON user_presence(last_heartbeat_at) WHERE last_heartbeat_at > NOW() - INTERVAL '2 minutes';

-- ============================================================================
-- Enable Supabase Realtime
-- ============================================================================

-- Enable realtime for collaboration tables
ALTER PUBLICATION supabase_realtime ADD TABLE session_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE session_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE workflow_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE user_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE collaboration_operations;

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE session_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE collaboration_operations ENABLE ROW LEVEL SECURITY;

-- Session Collaborators: Users can see collaborators on sessions they have access to
CREATE POLICY "Users can read session collaborators"
  ON session_collaborators
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
      OR visibility = 'public'
      OR (visibility = 'organization' AND organization_id IN (
        SELECT organization_id FROM users WHERE auth_user_id = auth.uid()
      ))
    )
    OR session_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Collaborators: Owners can add/remove collaborators
CREATE POLICY "Owners can manage session collaborators"
  ON session_collaborators
  FOR ALL
  USING (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
    OR session_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND role = 'owner'
    )
  );

-- Workflow Collaborators: Users can see collaborators on workflows they have access to
CREATE POLICY "Users can read workflow collaborators"
  ON workflow_collaborators
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
    OR workflow_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Workflow Collaborators: Owners can manage collaborators
CREATE POLICY "Owners can manage workflow collaborators"
  ON workflow_collaborators
  FOR ALL
  USING (
    workflow_id IN (
      SELECT id FROM workflows
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
    OR workflow_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
      AND role = 'owner'
    )
  );

-- Session Comments: Collaborators can read comments
CREATE POLICY "Collaborators can read session comments"
  ON session_comments
  FOR SELECT
  USING (
    session_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Comments: Collaborators can create comments
CREATE POLICY "Collaborators can create session comments"
  ON session_comments
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    AND session_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Comments: Users can update their own comments
CREATE POLICY "Users can update their own session comments"
  ON session_comments
  FOR UPDATE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Session Comments: Users can delete their own comments
CREATE POLICY "Users can delete their own session comments"
  ON session_comments
  FOR DELETE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Workflow Comments: Similar policies
CREATE POLICY "Collaborators can read workflow comments"
  ON workflow_comments
  FOR SELECT
  USING (
    workflow_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Collaborators can create workflow comments"
  ON workflow_comments
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    AND workflow_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

CREATE POLICY "Users can update their own workflow comments"
  ON workflow_comments
  FOR UPDATE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Users can delete their own workflow comments"
  ON workflow_comments
  FOR DELETE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- User Presence: Users can see presence on resources they have access to
CREATE POLICY "Users can read presence"
  ON user_presence
  FOR SELECT
  USING (
    (resource_type = 'session' AND resource_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    ))
    OR (resource_type = 'workflow' AND resource_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    ))
  );

-- User Presence: Users can manage their own presence
CREATE POLICY "Users can manage their own presence"
  ON user_presence
  FOR ALL
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Collaboration Operations: Users can read operations on resources they have access to
CREATE POLICY "Collaborators can read operations"
  ON collaboration_operations
  FOR SELECT
  USING (
    (resource_type = 'session' AND resource_id IN (
      SELECT session_id FROM session_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    ))
    OR (resource_type = 'workflow' AND resource_id IN (
      SELECT workflow_id FROM workflow_collaborators
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    ))
  );

-- Collaboration Operations: Users can create operations
CREATE POLICY "Collaborators can create operations"
  ON collaboration_operations
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Trigger for updated_at
CREATE TRIGGER update_session_comments_updated_at
  BEFORE UPDATE ON session_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_comments_updated_at
  BEFORE UPDATE ON workflow_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to add collaborator
CREATE OR REPLACE FUNCTION add_collaborator(
  p_resource_type TEXT,
  p_resource_id UUID,
  p_user_id UUID,
  p_role TEXT,
  p_invited_by UUID
)
RETURNS UUID AS $$
DECLARE
  v_collaborator_id UUID;
BEGIN
  IF p_resource_type = 'session' THEN
    INSERT INTO session_collaborators (session_id, user_id, role, invited_by)
    VALUES (p_resource_id, p_user_id, p_role, p_invited_by)
    ON CONFLICT (session_id, user_id)
    DO UPDATE SET role = p_role, invited_at = NOW()
    RETURNING id INTO v_collaborator_id;
  ELSIF p_resource_type = 'workflow' THEN
    INSERT INTO workflow_collaborators (workflow_id, user_id, role, invited_by)
    VALUES (p_resource_id, p_user_id, p_role, p_invited_by)
    ON CONFLICT (workflow_id, user_id)
    DO UPDATE SET role = p_role, invited_at = NOW()
    RETURNING id INTO v_collaborator_id;
  ELSE
    RAISE EXCEPTION 'Invalid resource_type: %', p_resource_type;
  END IF;

  RETURN v_collaborator_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION add_collaborator IS 'Add or update collaborator on session or workflow';

-- Function to update presence heartbeat
CREATE OR REPLACE FUNCTION update_presence_heartbeat(
  p_user_id UUID,
  p_resource_type TEXT,
  p_resource_id UUID,
  p_presence_data JSONB DEFAULT '{}'::jsonb
)
RETURNS void AS $$
BEGIN
  INSERT INTO user_presence (user_id, resource_type, resource_id, presence_data, last_heartbeat_at)
  VALUES (p_user_id, p_resource_type, p_resource_id, p_presence_data, NOW())
  ON CONFLICT (user_id, resource_type, resource_id)
  DO UPDATE SET
    presence_data = p_presence_data,
    last_heartbeat_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION update_presence_heartbeat IS 'Update user presence with heartbeat (call every 30s)';

-- Function to clean up stale presence records
CREATE OR REPLACE FUNCTION cleanup_stale_presence()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  DELETE FROM user_presence
  WHERE last_heartbeat_at < NOW() - INTERVAL '2 minutes';

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_stale_presence IS 'Remove presence records with no heartbeat for 2+ minutes';

-- Function to get active collaborators
CREATE OR REPLACE FUNCTION get_active_collaborators(
  p_resource_type TEXT,
  p_resource_id UUID
)
RETURNS TABLE (
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  role TEXT,
  presence_data JSONB,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  IF p_resource_type = 'session' THEN
    RETURN QUERY
    SELECT
      u.id,
      u.full_name,
      u.email,
      sc.role,
      COALESCE(up.presence_data, '{}'::jsonb),
      up.last_heartbeat_at
    FROM session_collaborators sc
    JOIN users u ON sc.user_id = u.id
    LEFT JOIN user_presence up ON up.user_id = u.id
      AND up.resource_type = 'session'
      AND up.resource_id = p_resource_id
      AND up.last_heartbeat_at > NOW() - INTERVAL '2 minutes'
    WHERE sc.session_id = p_resource_id;
  ELSIF p_resource_type = 'workflow' THEN
    RETURN QUERY
    SELECT
      u.id,
      u.full_name,
      u.email,
      wc.role,
      COALESCE(up.presence_data, '{}'::jsonb),
      up.last_heartbeat_at
    FROM workflow_collaborators wc
    JOIN users u ON wc.user_id = u.id
    LEFT JOIN user_presence up ON up.user_id = u.id
      AND up.resource_type = 'workflow'
      AND up.resource_id = p_resource_id
      AND up.last_heartbeat_at > NOW() - INTERVAL '2 minutes'
    WHERE wc.workflow_id = p_resource_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_active_collaborators IS 'Get list of collaborators with presence status';

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP FUNCTION IF EXISTS get_active_collaborators(TEXT, UUID);
-- DROP FUNCTION IF EXISTS cleanup_stale_presence();
-- DROP FUNCTION IF EXISTS update_presence_heartbeat(UUID, TEXT, UUID, JSONB);
-- DROP FUNCTION IF EXISTS add_collaborator(TEXT, UUID, UUID, TEXT, UUID);
-- DROP TABLE IF EXISTS collaboration_operations CASCADE;
-- DROP TABLE IF EXISTS user_presence CASCADE;
-- DROP TABLE IF EXISTS workflow_comments CASCADE;
-- DROP TABLE IF EXISTS session_comments CASCADE;
-- DROP TABLE IF EXISTS workflow_collaborators CASCADE;
-- DROP TABLE IF EXISTS session_collaborators CASCADE;
-- COMMIT;
