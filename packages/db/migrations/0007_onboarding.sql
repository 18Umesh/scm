BEGIN;
CREATE TABLE school_verifications(
 id uuid PRIMARY KEY,school_id uuid NOT NULL UNIQUE REFERENCES schools(id),status text NOT NULL DEFAULT 'pending',payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1
);
ALTER TABLE school_verifications ENABLE ROW LEVEL SECURITY;ALTER TABLE school_verifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_verifications USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
CREATE TRIGGER log_change AFTER INSERT OR UPDATE ON school_verifications FOR EACH ROW EXECUTE FUNCTION audit_record_change();
GRANT SELECT ON school_verifications TO campus_app;
CREATE FUNCTION register_school(school_record uuid,person_record uuid,account_email text,account_name text,credential_hash text,school_name text,short_name text,city_name text,state_name text,host_name text,verification jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM set_config('app.school_id',school_record::text,true);
 PERFORM set_config('app.actor_id',person_record::text,true);
 IF EXISTS(SELECT 1 FROM users WHERE email=account_email) THEN RAISE EXCEPTION 'Account already exists';END IF;
 IF EXISTS(SELECT 1 FROM school_domains WHERE host=host_name) THEN RAISE EXCEPTION 'Domain already exists';END IF;
 INSERT INTO users(id,email,display_name,password_hash) VALUES(person_record,account_email,account_name,credential_hash);
 INSERT INTO schools(id,name,short_name,city,state,verified,created_by) VALUES(school_record,school_name,short_name,city_name,state_name,false,person_record);
 INSERT INTO memberships(id,school_id,user_id,role,created_by) VALUES(campus_uuid_v7(),school_record,person_record,'admin',person_record);
 INSERT INTO school_settings(id,school_id,created_by) VALUES(campus_uuid_v7(),school_record,person_record);
 INSERT INTO school_branding(id,school_id,accent,created_by) VALUES(campus_uuid_v7(),school_record,'#0c6b77',person_record);
 INSERT INTO school_domains(host,school_id,verified,school_verified,active) VALUES(host_name,school_record,false,false,false);
 INSERT INTO school_verifications(id,school_id,status,payload,created_by) VALUES(campus_uuid_v7(),school_record,'pending',verification,person_record);
 RETURN school_record;
END $$;
REVOKE ALL ON FUNCTION register_school(uuid,uuid,text,text,text,text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_school(uuid,uuid,text,text,text,text,text,text,text,text,jsonb) TO campus_app;
COMMIT;
