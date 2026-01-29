-- Migration: 003_add_session_snapshots
-- Description: Add session persistence with auto-save snapshots
-- Author: AI Agent Workbench Team
-- Date: 2026-01-28

BEGIN;

-- ============================================================================
-- Free Agent Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS free_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'error')),
  model TEXT NOT NULL, -- AI model being used (e.g., 'gpt-4', 'claude-3')

  -- Session state tracking
  current_state TEXT DEFAULT 'idle', -- Current agent state
  last_snapshot_at TIMESTAMPTZ,
  snapshot_count INTEGER DEFAULT 0,

  -- Memory storage (lightweight, main data in snapshots)
  memory_summary JSONB, -- Summary of agent memory

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Visibility
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'organization', 'public'))
);

COMMENT ON TABLE free_agent_sessions IS 'Agent execution sessions with persistence';
COMMENT ON COLUMN free_agent_sessions.status IS 'Session lifecycle: active, paused, completed, error';
COMMENT ON COLUMN free_agent_sessions.model IS 'AI model identifier';
COMMENT ON COLUMN free_agent_sessions.last_snapshot_at IS 'Timestamp of last auto-save';
COMMENT ON COLUMN free_agent_sessions.memory_summary IS 'Lightweight summary of agent memory';

-- ============================================================================
-- Session Snapshots Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_agent_sessions(id) ON DELETE CASCADE,
  snapshot_number INTEGER NOT NULL,

  -- Snapshot data (full session state)
  snapshot_data JSONB NOT NULL,

  -- Snapshot metadata
  snapshot_size INTEGER, -- Size in bytes for monitoring
  compression_enabled BOOLEAN DEFAULT false,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint: one snapshot per number per session
  UNIQUE(session_id, snapshot_number)
);

COMMENT ON TABLE session_snapshots IS 'Auto-save snapshots of session state';
COMMENT ON COLUMN session_snapshots.snapshot_data IS 'Full session state as JSONB';
COMMENT ON COLUMN session_snapshots.snapshot_number IS 'Sequential snapshot number (1, 2, 3...)';
COMMENT ON COLUMN session_snapshots.snapshot_size IS 'Size in bytes for monitoring large sessions';

-- ============================================================================
-- Session Messages Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS session_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES free_agent_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  metadata JSONB, -- Additional message data (tool calls, etc.)
  message_order INTEGER NOT NULL, -- Ordering within session
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE session_messages IS 'Message history for sessions (for display/export)';
COMMENT ON COLUMN session_messages.role IS 'Message sender: user, assistant, system, tool';
COMMENT ON COLUMN session_messages.message_order IS 'Order of message in conversation';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Free Agent Sessions
CREATE INDEX idx_sessions_user_id ON free_agent_sessions(user_id);
CREATE INDEX idx_sessions_organization_id ON free_agent_sessions(organization_id);
CREATE INDEX idx_sessions_status ON free_agent_sessions(status);
CREATE INDEX idx_sessions_created_at ON free_agent_sessions(created_at DESC);
CREATE INDEX idx_sessions_last_snapshot ON free_agent_sessions(last_snapshot_at DESC);

-- Session Snapshots
CREATE INDEX idx_snapshots_session_id ON session_snapshots(session_id);
CREATE INDEX idx_snapshots_created_at ON session_snapshots(created_at DESC);
CREATE INDEX idx_snapshots_number ON session_snapshots(session_id, snapshot_number DESC);

-- Session Messages
CREATE INDEX idx_messages_session_id ON session_messages(session_id);
CREATE INDEX idx_messages_order ON session_messages(session_id, message_order);
CREATE INDEX idx_messages_created_at ON session_messages(created_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE free_agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;

-- Free Agent Sessions: Users can read their own sessions
CREATE POLICY "Users can read their own sessions"
  ON free_agent_sessions
  FOR SELECT
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Free Agent Sessions: Users can create their own sessions
CREATE POLICY "Users can create their own sessions"
  ON free_agent_sessions
  FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Free Agent Sessions: Users can update their own sessions
CREATE POLICY "Users can update their own sessions"
  ON free_agent_sessions
  FOR UPDATE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Free Agent Sessions: Users can delete their own sessions
CREATE POLICY "Users can delete their own sessions"
  ON free_agent_sessions
  FOR DELETE
  USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
  );

-- Session Snapshots: Users can read snapshots of their sessions
CREATE POLICY "Users can read their session snapshots"
  ON session_snapshots
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Snapshots: Users can create snapshots for their sessions
CREATE POLICY "Users can create snapshots for their sessions"
  ON session_snapshots
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Messages: Users can read messages from their sessions
CREATE POLICY "Users can read their session messages"
  ON session_messages
  FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- Session Messages: Users can create messages in their sessions
CREATE POLICY "Users can create messages in their sessions"
  ON session_messages
  FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT id FROM free_agent_sessions
      WHERE user_id IN (SELECT id FROM users WHERE auth_user_id = auth.uid())
    )
  );

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Trigger for updated_at on free_agent_sessions
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON free_agent_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to create a snapshot
CREATE OR REPLACE FUNCTION create_session_snapshot(
  p_session_id UUID,
  p_snapshot_data JSONB
)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_snapshot_number INTEGER;
  v_data_size INTEGER;
BEGIN
  -- Get next snapshot number
  SELECT COALESCE(MAX(snapshot_number), 0) + 1
  INTO v_snapshot_number
  FROM session_snapshots
  WHERE session_id = p_session_id;

  -- Calculate data size
  v_data_size := length(p_snapshot_data::text);

  -- Create snapshot
  INSERT INTO session_snapshots (
    session_id,
    snapshot_number,
    snapshot_data,
    snapshot_size
  ) VALUES (
    p_session_id,
    v_snapshot_number,
    p_snapshot_data,
    v_data_size
  )
  RETURNING id INTO v_snapshot_id;

  -- Update session metadata
  UPDATE free_agent_sessions
  SET
    last_snapshot_at = NOW(),
    snapshot_count = v_snapshot_number,
    updated_at = NOW()
  WHERE id = p_session_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION create_session_snapshot IS 'Create a new snapshot for a session';

-- Function to get latest snapshot
CREATE OR REPLACE FUNCTION get_latest_snapshot(p_session_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_snapshot_data JSONB;
BEGIN
  SELECT snapshot_data INTO v_snapshot_data
  FROM session_snapshots
  WHERE session_id = p_session_id
  ORDER BY snapshot_number DESC
  LIMIT 1;

  RETURN v_snapshot_data;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_latest_snapshot IS 'Get the most recent snapshot for a session';

-- Function to clean old snapshots (keep last N)
CREATE OR REPLACE FUNCTION cleanup_old_snapshots(
  p_session_id UUID,
  p_keep_count INTEGER DEFAULT 10
)
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Delete all but the most recent N snapshots
  WITH snapshots_to_keep AS (
    SELECT id
    FROM session_snapshots
    WHERE session_id = p_session_id
    ORDER BY snapshot_number DESC
    LIMIT p_keep_count
  )
  DELETE FROM session_snapshots
  WHERE session_id = p_session_id
    AND id NOT IN (SELECT id FROM snapshots_to_keep);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_old_snapshots IS 'Remove old snapshots, keeping only the most recent N';

-- Function to get session summary
CREATE OR REPLACE FUNCTION get_session_summary(p_session_id UUID)
RETURNS TABLE (
  session_id UUID,
  name TEXT,
  status TEXT,
  model TEXT,
  message_count BIGINT,
  snapshot_count INTEGER,
  last_snapshot_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.name,
    s.status,
    s.model,
    COUNT(m.id) as message_count,
    s.snapshot_count,
    s.last_snapshot_at,
    s.created_at,
    s.updated_at
  FROM free_agent_sessions s
  LEFT JOIN session_messages m ON s.id = m.session_id
  WHERE s.id = p_session_id
  GROUP BY s.id, s.name, s.status, s.model, s.snapshot_count,
           s.last_snapshot_at, s.created_at, s.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_session_summary IS 'Get comprehensive summary of a session';

-- ============================================================================
-- Views
-- ============================================================================

-- View for session list with metadata
CREATE OR REPLACE VIEW sessions_list AS
SELECT
  s.id,
  s.user_id,
  s.organization_id,
  s.name,
  s.description,
  s.status,
  s.model,
  s.current_state,
  s.snapshot_count,
  s.last_snapshot_at,
  s.created_at,
  s.updated_at,
  COUNT(DISTINCT m.id) as message_count,
  MAX(m.created_at) as last_message_at
FROM free_agent_sessions s
LEFT JOIN session_messages m ON s.id = m.session_id
GROUP BY s.id, s.user_id, s.organization_id, s.name, s.description,
         s.status, s.model, s.current_state, s.snapshot_count,
         s.last_snapshot_at, s.created_at, s.updated_at;

COMMENT ON VIEW sessions_list IS 'Session list with message counts';

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP VIEW IF EXISTS sessions_list;
-- DROP FUNCTION IF EXISTS get_session_summary(UUID);
-- DROP FUNCTION IF EXISTS cleanup_old_snapshots(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS get_latest_snapshot(UUID);
-- DROP FUNCTION IF EXISTS create_session_snapshot(UUID, JSONB);
-- DROP TABLE IF EXISTS session_messages CASCADE;
-- DROP TABLE IF EXISTS session_snapshots CASCADE;
-- DROP TABLE IF EXISTS free_agent_sessions CASCADE;
-- COMMIT;
