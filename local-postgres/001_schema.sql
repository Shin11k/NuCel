-- NuCel: banco PostgreSQL local. Execute como usuario nucel_app em nucel_db.
-- Instala em paralelo ao Supabase: nao apaga tabelas nem dados existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS nucel_members (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    name text NOT NULL,
    auth_user_id uuid UNIQUE,
    role text NOT NULL DEFAULT 'collaborator' CHECK (role IN ('admin', 'collaborator')),
    password_hash text,
    invite_hash text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT nucel_members_email_lower CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS nucel_bridges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL UNIQUE,
    url text NOT NULL,
    secret text NOT NULL CHECK (char_length(secret) >= 60),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nucel_devices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    serial text NOT NULL,
    model text NOT NULL,
    bridge_id uuid NOT NULL REFERENCES nucel_bridges(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (bridge_id, serial)
);

CREATE TABLE IF NOT EXISTS nucel_grants (
    member_id uuid NOT NULL REFERENCES nucel_members(id) ON DELETE CASCADE,
    device_id uuid NOT NULL REFERENCES nucel_devices(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (member_id, device_id)
);

CREATE INDEX IF NOT EXISTS nucel_grants_device_idx ON nucel_grants(device_id);

CREATE TABLE IF NOT EXISTS nucel_sessions (
    token_hash text PRIMARY KEY,
    member_id uuid NOT NULL REFERENCES nucel_members(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nucel_sessions_expiry_idx ON nucel_sessions(expires_at);

CREATE TABLE IF NOT EXISTS nucel_login_attempts (
    email text PRIMARY KEY,
    attempts integer NOT NULL DEFAULT 0,
    first_attempt_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
