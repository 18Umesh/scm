-- The migration owner is separate from campus_app. Run only with an admin URL.
BEGIN;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='campus_app') THEN
    CREATE ROLE campus_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
END $$;
CREATE FUNCTION campus_uuid_v7() RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT (lpad(to_hex((extract(epoch FROM clock_timestamp())*1000)::bigint),12,'0') || '7' || substr(md5(random()::text),1,3) || '8' || substr(md5(random()::text),1,15))::uuid
$$;
CREATE TABLE school_domains (
  host text PRIMARY KEY CHECK (host = lower(host)), school_id uuid NOT NULL,
  verified boolean NOT NULL DEFAULT false, school_verified boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
-- These two platform tables contain identity/routing data; they are not tenant records.
CREATE TABLE users (
  id uuid PRIMARY KEY, email text UNIQUE NOT NULL, display_name text NOT NULL,
  password_hash text NOT NULL, totp_secret text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE schools (
  id uuid PRIMARY KEY, school_id uuid GENERATED ALWAYS AS (id) STORED,
  name text NOT NULL, short_name text NOT NULL, city text NOT NULL, state text NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1
);
CREATE TABLE memberships (
  id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), user_id uuid NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('management','principal','hod','teacher','accounts','admin','parent','student')),
  scope jsonb NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1,
  UNIQUE(school_id,id), UNIQUE(school_id,user_id,role)
);
CREATE TABLE school_settings (
  id uuid PRIMARY KEY, school_id uuid NOT NULL UNIQUE REFERENCES schools(id),
  ai_enabled boolean NOT NULL DEFAULT false,
  ai_monthly_cap_paise bigint NOT NULL DEFAULT 10000 CHECK(ai_monthly_cap_paise >= 0),
  student_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1
);
CREATE TABLE school_branding (
  id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), accent text NOT NULL,
  published boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1, UNIQUE(school_id,version)
);
CREATE TABLE sessions (
  id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), user_id uuid NOT NULL REFERENCES users(id),
  membership_id uuid NOT NULL, token_hash text NOT NULL UNIQUE, csrf_hash text NOT NULL,
  host text NOT NULL, mfa_verified boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1,
  FOREIGN KEY (school_id,membership_id) REFERENCES memberships(school_id,id)
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT campus_uuid_v7(), school_id uuid NOT NULL REFERENCES schools(id),
  actor_id uuid, action text NOT NULL, resource text NOT NULL, resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_requests (
  id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), user_id uuid NOT NULL REFERENCES users(id),
  task text NOT NULL, data_tier text NOT NULL, status text NOT NULL,
  model text, cost_paise bigint NOT NULL DEFAULT 0 CHECK(cost_paise >= 0),
  -- No prompt or response content is retained in the foundation.
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid, version integer NOT NULL DEFAULT 1
);
CREATE INDEX memberships_school_user ON memberships(school_id,user_id);
CREATE INDEX audit_school_date ON audit_logs(school_id,created_at DESC);
CREATE INDEX ai_school_date ON ai_requests(school_id,created_at);
CREATE INDEX sessions_school_token ON sessions(school_id,token_hash);

CREATE FUNCTION deny_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit logs are append-only'; END $$;
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

CREATE FUNCTION audit_record_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE record_json jsonb; actor uuid;
BEGIN
  record_json := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  actor := NULLIF(current_setting('app.actor_id',true),'')::uuid;
  INSERT INTO audit_logs(id,school_id,actor_id,action,resource,resource_id,metadata)
  VALUES (
    campus_uuid_v7(),
    (record_json->>'school_id')::uuid, actor, lower(TG_OP), TG_TABLE_NAME, record_json->>'id',
    jsonb_build_object('version',record_json->'version')
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;
REVOKE ALL ON FUNCTION audit_record_change() FROM PUBLIC;

DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['schools','memberships','school_settings','school_branding','sessions','audit_logs','ai_requests'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (school_id = nullif(current_setting(''app.school_id'',true),'''')::uuid) WITH CHECK (school_id = nullif(current_setting(''app.school_id'',true),'''')::uuid)', table_name);
    IF table_name <> 'audit_logs' THEN
      EXECUTE format('CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',table_name);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO campus_app;
GRANT SELECT ON school_domains,users,schools,memberships,school_settings,school_branding,sessions,audit_logs,ai_requests TO campus_app;
GRANT INSERT,UPDATE ON sessions,school_settings,school_branding,ai_requests TO campus_app;
GRANT INSERT ON audit_logs TO campus_app;
-- No UPDATE/DELETE/TRUNCATE permission on audit logs, even if a trigger is bypassed.
COMMIT;
