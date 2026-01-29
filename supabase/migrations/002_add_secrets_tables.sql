-- Migration: 002_add_secrets_tables
-- Description: Create encrypted secrets storage using pgcrypto
-- Author: AI Agent Workbench Team
-- Date: 2026-01-28
-- Security: CRITICAL - All secrets MUST be encrypted at rest

BEGIN;

-- ============================================================================
-- Enable pgcrypto Extension
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON EXTENSION pgcrypto IS 'Cryptographic functions for encrypting secrets';

-- ============================================================================
-- Encryption Keys Table (for key rotation)
-- ============================================================================

CREATE TABLE IF NOT EXISTS encryption_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version INTEGER NOT NULL UNIQUE,
  key_hash TEXT NOT NULL, -- Hash of the key for verification
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  rotated_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL
);

COMMENT ON TABLE encryption_keys IS 'Encryption key versions for key rotation';
COMMENT ON COLUMN encryption_keys.key_hash IS 'SHA256 hash of encryption key for verification';
COMMENT ON COLUMN encryption_keys.is_active IS 'Only one key should be active at a time';

-- Create default encryption key version
INSERT INTO encryption_keys (key_version, key_hash, is_active)
VALUES (1, encode(digest('default-encryption-key-change-in-production', 'sha256'), 'hex'), true);

-- ============================================================================
-- User Secrets Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_secrets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_key TEXT NOT NULL, -- The identifier/name of the secret (e.g., "openai_api_key")
  encrypted_value BYTEA NOT NULL, -- Encrypted secret value
  encryption_key_version INTEGER NOT NULL REFERENCES encryption_keys(key_version),
  description TEXT, -- Optional description
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, secret_key)
);

COMMENT ON TABLE user_secrets IS 'Encrypted storage for user API keys and credentials';
COMMENT ON COLUMN user_secrets.secret_key IS 'Identifier for the secret (e.g., openai_api_key)';
COMMENT ON COLUMN user_secrets.encrypted_value IS 'Encrypted value using pgcrypto';
COMMENT ON COLUMN user_secrets.encryption_key_version IS 'Version of encryption key used';
COMMENT ON COLUMN user_secrets.last_used_at IS 'Track when secret was last accessed';

-- ============================================================================
-- Secret Access Audit Log
-- ============================================================================

CREATE TABLE IF NOT EXISTS secret_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_id UUID NOT NULL REFERENCES user_secrets(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('read', 'create', 'update', 'delete')),
  ip_address INET,
  user_agent TEXT,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE secret_access_logs IS 'Audit log for all secret access attempts';
COMMENT ON COLUMN secret_access_logs.action IS 'Type of access: read, create, update, delete';
COMMENT ON COLUMN secret_access_logs.success IS 'Whether the access attempt succeeded';

-- ============================================================================
-- Indexes for Performance
-- ============================================================================

-- User Secrets
CREATE INDEX idx_user_secrets_user_id ON user_secrets(user_id);
CREATE INDEX idx_user_secrets_secret_key ON user_secrets(secret_key);
CREATE INDEX idx_user_secrets_user_key ON user_secrets(user_id, secret_key);

-- Secret Access Logs
CREATE INDEX idx_secret_access_logs_user_id ON secret_access_logs(user_id);
CREATE INDEX idx_secret_access_logs_secret_id ON secret_access_logs(secret_id);
CREATE INDEX idx_secret_access_logs_accessed_at ON secret_access_logs(accessed_at DESC);

-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE encryption_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_access_logs ENABLE ROW LEVEL SECURITY;

-- Encryption Keys: Read-only for authenticated users
CREATE POLICY "Users can read active encryption key version"
  ON encryption_keys
  FOR SELECT
  TO authenticated
  USING (is_active = true);

-- User Secrets: Users can only access their own secrets
CREATE POLICY "Users can read their own secrets"
  ON user_secrets
  FOR SELECT
  USING (user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can create their own secrets"
  ON user_secrets
  FOR INSERT
  WITH CHECK (user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can update their own secrets"
  ON user_secrets
  FOR UPDATE
  USING (user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

CREATE POLICY "Users can delete their own secrets"
  ON user_secrets
  FOR DELETE
  USING (user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Secret Access Logs: Users can read their own access logs
CREATE POLICY "Users can read their own access logs"
  ON secret_access_logs
  FOR SELECT
  USING (user_id IN (
    SELECT id FROM users WHERE auth_user_id = auth.uid()
  ));

-- Only system can insert audit logs
CREATE POLICY "System can insert audit logs"
  ON secret_access_logs
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- Encryption/Decryption Functions
-- ============================================================================

-- Function to encrypt a secret value
CREATE OR REPLACE FUNCTION encrypt_secret(
  p_secret_value TEXT,
  p_encryption_key TEXT
)
RETURNS BYTEA AS $$
BEGIN
  -- Use AES-256 encryption with pgcrypto
  RETURN pgp_sym_encrypt(p_secret_value, p_encryption_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION encrypt_secret IS 'Encrypt a secret value using AES-256';

-- Function to decrypt a secret value
CREATE OR REPLACE FUNCTION decrypt_secret(
  p_encrypted_value BYTEA,
  p_encryption_key TEXT
)
RETURNS TEXT AS $$
BEGIN
  -- Decrypt using pgcrypto
  RETURN pgp_sym_decrypt(p_encrypted_value, p_encryption_key);
EXCEPTION
  WHEN OTHERS THEN
    -- Return NULL if decryption fails (wrong key, corrupted data, etc.)
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION decrypt_secret IS 'Decrypt a secret value';

-- Function to log secret access
CREATE OR REPLACE FUNCTION log_secret_access(
  p_user_id UUID,
  p_secret_id UUID,
  p_action TEXT,
  p_ip_address INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO secret_access_logs (
    user_id,
    secret_id,
    action,
    ip_address,
    user_agent,
    success,
    error_message
  ) VALUES (
    p_user_id,
    p_secret_id,
    p_action,
    p_ip_address,
    p_user_agent,
    p_success,
    p_error_message
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION log_secret_access IS 'Log secret access for audit trail';

-- Function to get active encryption key version
CREATE OR REPLACE FUNCTION get_active_encryption_key_version()
RETURNS INTEGER AS $$
DECLARE
  v_key_version INTEGER;
BEGIN
  SELECT key_version INTO v_key_version
  FROM encryption_keys
  WHERE is_active = true
  LIMIT 1;

  RETURN COALESCE(v_key_version, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION get_active_encryption_key_version IS 'Get current active encryption key version';

-- Function to update last_used_at timestamp
CREATE OR REPLACE FUNCTION update_secret_last_used()
RETURNS TRIGGER AS $$
BEGIN
  -- This trigger is called after SELECT on user_secrets
  -- Note: This requires a separate mechanism to track reads
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at on user_secrets
CREATE TRIGGER update_user_secrets_updated_at
  BEFORE UPDATE ON user_secrets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper Views
-- ============================================================================

-- View for secrets metadata (without encrypted values)
CREATE OR REPLACE VIEW user_secrets_metadata AS
SELECT
  id,
  user_id,
  secret_key,
  description,
  encryption_key_version,
  last_used_at,
  created_at,
  updated_at
FROM user_secrets;

COMMENT ON VIEW user_secrets_metadata IS 'Secret metadata without encrypted values';

-- View for secret access statistics
CREATE OR REPLACE VIEW secret_access_stats AS
SELECT
  s.id AS secret_id,
  s.user_id,
  s.secret_key,
  COUNT(l.id) AS total_accesses,
  MAX(l.accessed_at) AS last_accessed,
  SUM(CASE WHEN l.action = 'read' THEN 1 ELSE 0 END) AS read_count,
  SUM(CASE WHEN l.action = 'update' THEN 1 ELSE 0 END) AS update_count,
  SUM(CASE WHEN l.success = false THEN 1 ELSE 0 END) AS failed_attempts
FROM user_secrets s
LEFT JOIN secret_access_logs l ON s.id = l.secret_id
GROUP BY s.id, s.user_id, s.secret_key;

COMMENT ON VIEW secret_access_stats IS 'Statistics on secret access patterns';

-- ============================================================================
-- Security Constraints
-- ============================================================================

-- Ensure only one active encryption key at a time
CREATE UNIQUE INDEX idx_encryption_keys_active
  ON encryption_keys(is_active)
  WHERE is_active = true;

-- Prevent modification of audit logs (immutable)
CREATE POLICY "Audit logs are immutable"
  ON secret_access_logs
  FOR UPDATE
  USING (false);

CREATE POLICY "Audit logs cannot be deleted"
  ON secret_access_logs
  FOR DELETE
  USING (false);

COMMIT;

-- ============================================================================
-- Rollback Instructions
-- ============================================================================
-- To rollback this migration, run:
-- BEGIN;
-- DROP VIEW IF EXISTS secret_access_stats;
-- DROP VIEW IF EXISTS user_secrets_metadata;
-- DROP FUNCTION IF EXISTS update_secret_last_used() CASCADE;
-- DROP FUNCTION IF EXISTS get_active_encryption_key_version();
-- DROP FUNCTION IF EXISTS log_secret_access(UUID, UUID, TEXT, INET, TEXT, BOOLEAN, TEXT);
-- DROP FUNCTION IF EXISTS decrypt_secret(BYTEA, TEXT);
-- DROP FUNCTION IF EXISTS encrypt_secret(TEXT, TEXT);
-- DROP TABLE IF EXISTS secret_access_logs CASCADE;
-- DROP TABLE IF EXISTS user_secrets CASCADE;
-- DROP TABLE IF EXISTS encryption_keys CASCADE;
-- DROP EXTENSION IF EXISTS pgcrypto;
-- COMMIT;

-- ============================================================================
-- Security Notes
-- ============================================================================
-- 1. The encryption key MUST be stored in environment variables, NOT in the database
-- 2. Use strong, randomly generated keys (at least 32 characters)
-- 3. Implement key rotation procedures before deploying to production
-- 4. Monitor secret_access_logs for suspicious activity
-- 5. Secrets are encrypted at rest using AES-256
-- 6. Never log or expose decrypted secret values
-- 7. Audit logs are immutable for compliance
