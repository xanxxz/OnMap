CREATE TABLE owner_admin_sessions (
 owner_telegram_id VARCHAR(64) PRIMARY KEY,
 token_hash CHAR(64) NOT NULL UNIQUE,
 expires_at TIMESTAMPTZ(3) NOT NULL,
 updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE owner_admin_mutations (
 owner_telegram_id VARCHAR(64) NOT NULL,
 request_key UUID NOT NULL,
 request_hash CHAR(64) NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (owner_telegram_id, request_key)
);
CREATE INDEX owner_admin_mutations_created_idx ON owner_admin_mutations(created_at);
CREATE TABLE owner_admin_audit (
 id UUID PRIMARY KEY,
 owner_telegram_id VARCHAR(64) NOT NULL,
 action VARCHAR(40) NOT NULL,
 entity_id VARCHAR(64) NOT NULL,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX owner_admin_audit_created_idx ON owner_admin_audit(created_at);
