-- Migration: 001_add_auth_tables
-- Description: Create authentication and authorization tables for RBAC
-- Author: AI Agent Workbench Team
-- Date: 2026-01-28

BEGIN;

-- ============================================================================
-- Organizations Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  plan_tier TEXT NOT NULL DEFAULT 'free' CHECK (plan_tier IN ('free', 'pro', 'enterprise')),
  max_users INTEGER NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE organizations IS 'Organizations for multi-tenancy support';
COMMENT ON COLUMN organizations.slug IS 'URL-safe organization identifier';
COMMENT ON COLUMN organizations.plan_tier IS 'Subscription tier: free, pro, or enterprise';
COMMENT ON COLUMN organizations.max_users IS 'Maximum number of users allowed';

-- ============================================================================
-- Users Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  auth_user_id UUID UNIQUE, -- References auth.users(id) in Supabase Auth
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

COMMENT ON TABLE users IS 'Application users linked to Supabase Auth';
COMMENT ON COLUMN users.auth_user_id IS 'Links to Supabase auth.users table';
COMMENT ON COLUMN users.organization_id IS 'Primary organization (users can belong to multiple via user_roles)';

-- ============================================================================
-- User Roles Table (RBAC)
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(user_id, organization_id)
);

COMMENT ON TABLE user_roles IS 'Role assignments for users within organizations';
COMMENT ON COLUMN user_roles.role IS 'admin: full access, member: read/write, viewer: read-only';

-- ============================================================================
-- Permissions Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  resource TEXT NOT NULL, -- e.g., 'sessions', 'workflows', 'secrets'
  action TEXT NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'execute', 'share')),
  allowed BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, resource, action)
);

COMMENT ON TABLE permissions IS 'Permission matrix for RBAC';
COMMENT ON COLUMN permissions.resource IS 'Resource type (e.g., sessions, workflows)';
COMMENT ON COLUMN permissions.action IS 'CRUD + execute/share actions';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- Organizations
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_organization_id ON users(organization_id);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);

-- User Roles
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_organization_id ON user_roles(organization_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Permissions
CREATE INDEX idx_permissions_role ON permissions(role);
CREATE INDEX idx_permissions_resource_action ON permissions(resource, action);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can read their own organization
CREATE POLICY "Users can read their organization"
  ON organizations
  FOR SELECT
  USING (
    id IN (
      SELECT organization_id
      FROM users
      WHERE auth_user_id = auth.uid()
    )
  );

-- Organizations: Admins can update their organization
CREATE POLICY "Admins can update their organization"
  ON organizations
  FOR UPDATE
  USING (
    id IN (
      SELECT ur.organization_id
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Users: Users can read users in their organization
CREATE POLICY "Users can read organization members"
  ON users
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_user_id = auth.uid()
    )
  );

-- Users: Users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON users
  FOR UPDATE
  USING (auth_user_id = auth.uid());

-- User Roles: Users can read roles in their organization
CREATE POLICY "Users can read organization roles"
  ON user_roles
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM users
      WHERE auth_user_id = auth.uid()
    )
  );

-- User Roles: Only admins can manage roles
CREATE POLICY "Admins can manage roles"
  ON user_roles
  FOR ALL
  USING (
    organization_id IN (
      SELECT ur.organization_id
      FROM user_roles ur
      JOIN users u ON ur.user_id = u.id
      WHERE u.auth_user_id = auth.uid()
      AND ur.role = 'admin'
    )
  );

-- Permissions: Everyone can read permissions (they're not secret)
CREATE POLICY "Everyone can read permissions"
  ON permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Seed Default Permissions
-- ============================================================================

-- Admin permissions (full access)
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('admin', 'sessions', 'create', true),
  ('admin', 'sessions', 'read', true),
  ('admin', 'sessions', 'update', true),
  ('admin', 'sessions', 'delete', true),
  ('admin', 'sessions', 'execute', true),
  ('admin', 'sessions', 'share', true),

  ('admin', 'workflows', 'create', true),
  ('admin', 'workflows', 'read', true),
  ('admin', 'workflows', 'update', true),
  ('admin', 'workflows', 'delete', true),
  ('admin', 'workflows', 'execute', true),
  ('admin', 'workflows', 'share', true),

  ('admin', 'secrets', 'create', true),
  ('admin', 'secrets', 'read', true),
  ('admin', 'secrets', 'update', true),
  ('admin', 'secrets', 'delete', true),

  ('admin', 'users', 'create', true),
  ('admin', 'users', 'read', true),
  ('admin', 'users', 'update', true),
  ('admin', 'users', 'delete', true);

-- Member permissions (read/write, no admin actions)
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('member', 'sessions', 'create', true),
  ('member', 'sessions', 'read', true),
  ('member', 'sessions', 'update', true),
  ('member', 'sessions', 'delete', false),
  ('member', 'sessions', 'execute', true),
  ('member', 'sessions', 'share', true),

  ('member', 'workflows', 'create', true),
  ('member', 'workflows', 'read', true),
  ('member', 'workflows', 'update', true),
  ('member', 'workflows', 'delete', false),
  ('member', 'workflows', 'execute', true),
  ('member', 'workflows', 'share', false),

  ('member', 'secrets', 'create', true),
  ('member', 'secrets', 'read', true),
  ('member', 'secrets', 'update', true),
  ('member', 'secrets', 'delete', true),

  ('member', 'users', 'create', false),
  ('member', 'users', 'read', true),
  ('member', 'users', 'update', false),
  ('member', 'users', 'delete', false);

-- Viewer permissions (read-only)
INSERT INTO permissions (role, resource, action, allowed) VALUES
  ('viewer', 'sessions', 'create', false),
  ('viewer', 'sessions', 'read', true),
  ('viewer', 'sessions', 'update', false),
  ('viewer', 'sessions', 'delete', false),
  ('viewer', 'sessions', 'execute', false),
  ('viewer', 'sessions', 'share', false),

  ('viewer', 'workflows', 'create', false),
  ('viewer', 'workflows', 'read', true),
  ('viewer', 'workflows', 'update', false),
  ('viewer', 'workflows', 'delete', false),
  ('viewer', 'workflows', 'execute', false),
  ('viewer', 'workflows', 'share', false),

  ('viewer', 'secrets', 'create', false),
  ('viewer', 'secrets', 'read', false),
  ('viewer', 'secrets', 'update', false),
  ('viewer', 'secrets', 'delete', false),

  ('viewer', 'users', 'create', false),
  ('viewer', 'users', 'read', true),
  ('viewer', 'users', 'update', false),
  ('viewer', 'users', 'delete', false);

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to check if user has permission
CREATE OR REPLACE FUNCTION user_has_permission(
  p_user_id UUID,
  p_organization_id UUID,
  p_resource TEXT,
  p_action TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
  user_role TEXT;
  has_permission BOOLEAN;
BEGIN
  -- Get user's role in the organization
  SELECT role INTO user_role
  FROM user_roles
  WHERE user_id = p_user_id
  AND organization_id = p_organization_id;

  -- If no role found, return false
  IF user_role IS NULL THEN
    RETURN false;
  END IF;

  -- Check permission
  SELECT allowed INTO has_permission
  FROM permissions
  WHERE role = user_role
  AND resource = p_resource
  AND action = p_action;

  RETURN COALESCE(has_permission, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION user_has_permission IS 'Check if user has specific permission in organization';

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP FUNCTION IF EXISTS user_has_permission(UUID, UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
-- DROP TABLE IF EXISTS permissions CASCADE;
-- DROP TABLE IF EXISTS user_roles CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;
-- DROP TABLE IF EXISTS organizations CASCADE;
-- COMMIT;
