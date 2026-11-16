BEGIN;
CREATE TABLE otp_challenges(
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),user_id uuid REFERENCES users(id),purpose text NOT NULL,code_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1
);
CREATE TABLE auth_devices(
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),user_id uuid NOT NULL REFERENCES users(id),device_hash text NOT NULL,expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,user_id,device_hash)
);
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['otp_challenges','auth_devices'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid) WITH CHECK(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid)',t);
  EXECUTE format('CREATE TRIGGER log_change AFTER INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO campus_app',t);
 END LOOP;
END $$;
COMMIT;
