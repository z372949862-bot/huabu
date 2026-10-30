CREATE TABLE licenses (
 id TEXT PRIMARY KEY, label TEXT NOT NULL, code_hash TEXT UNIQUE NOT NULL,
 suffix TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','disabled')),
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
 fingerprint TEXT, public_key TEXT, bound_at INTEGER, last_seen INTEGER
);
CREATE TABLE challenges (nonce_hash TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, public_key TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX challenges_expiry ON challenges(expires_at);
CREATE TABLE admin_sessions (token_hash TEXT PRIMARY KEY, csrf TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX rate_limits_expiry ON rate_limits(expires_at);
CREATE TABLE audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, license_id TEXT NOT NULL, at INTEGER NOT NULL);
CREATE INDEX audit_time ON audit(at DESC);
