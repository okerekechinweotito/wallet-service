-- Migration: ensure `api_keys` table matches local schema expectations
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS api_keys (
	id TEXT PRIMARY KEY,
	user_id TEXT,
	key TEXT,
	key_fingerprint TEXT,
	name TEXT,
	permissions TEXT[],
	expires_at TIMESTAMP WITH TIME ZONE,
	revoked BOOLEAN DEFAULT false,
	created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
-- Add foreign key constraint only if the `users` table exists in the public schema
DO $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'
	) THEN
		IF NOT EXISTS (
			SELECT 1 FROM pg_constraint WHERE conname = 'api_keys_user_id_users_id_fk'
		) THEN
			BEGIN
				ALTER TABLE api_keys ADD CONSTRAINT api_keys_user_id_users_id_fk
					FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
			EXCEPTION WHEN duplicate_object THEN
				NULL;
			END;
		END IF;
	END IF;
END
$$;

-- Ensure `name` and `key_fingerprint` columns exist (safe no-op if present)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS key_fingerprint TEXT;

-- Ensure `permissions` column exists before any indexes that reference it
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS permissions TEXT[];

-- Ensure `revoked` and `created_at` defaults are set before indexes
ALTER TABLE api_keys ALTER COLUMN revoked SET DEFAULT false;
ALTER TABLE api_keys ALTER COLUMN created_at SET DEFAULT now();

-- Ensure unique constraint on `key` (use index to be idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS api_keys_key_unique ON api_keys(key);

-- Ensure indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_fingerprint ON api_keys(key_fingerprint);

-- Ensure `permissions` column exists as text[]; if it exists as plain text, convert values
DO $$
DECLARE
	_udt_name TEXT;
BEGIN
	SELECT udt_name INTO _udt_name
	FROM information_schema.columns
	WHERE table_name = 'api_keys' AND column_name = 'permissions'
	LIMIT 1;

	IF _udt_name IS NULL THEN
		ALTER TABLE api_keys ADD COLUMN permissions TEXT[];
	ELSIF _udt_name = 'text' THEN
		BEGIN
			-- convert from text representation to text[]
			ALTER TABLE api_keys ALTER COLUMN permissions TYPE text[] USING (
				CASE
					WHEN permissions IS NULL THEN NULL
					ELSE string_to_array(trim(both '{}' FROM permissions), ',')
				END
			);
		EXCEPTION WHEN others THEN
			RAISE NOTICE 'Could not convert permissions column from text: %', SQLERRM;
		END;
	ELSIF _udt_name <> '_text' THEN
		-- if it's some other type, attempt a cast (best-effort)
		BEGIN
			ALTER TABLE api_keys ALTER COLUMN permissions TYPE text[] USING (permissions::text[]);
		EXCEPTION WHEN others THEN
			RAISE NOTICE 'Could not coerce permissions column to text[]: %', SQLERRM;
		END;
	END IF;
END
$$ LANGUAGE plpgsql;

-- Ensure `revoked` and `created_at` defaults
ALTER TABLE api_keys ALTER COLUMN revoked SET DEFAULT false;
ALTER TABLE api_keys ALTER COLUMN created_at SET DEFAULT now();

