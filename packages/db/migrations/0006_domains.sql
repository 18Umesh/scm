BEGIN;
CREATE TABLE school_domain_requests(
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),host text NOT NULL UNIQUE,
 verification_token text NOT NULL,status text NOT NULL DEFAULT 'pending',last_check timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1
);
ALTER TABLE school_domain_requests ENABLE ROW LEVEL SECURITY;ALTER TABLE school_domain_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_domain_requests USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
CREATE TRIGGER log_change AFTER INSERT OR UPDATE ON school_domain_requests FOR EACH ROW EXECUTE FUNCTION audit_record_change();
GRANT SELECT,INSERT,UPDATE ON school_domain_requests TO campus_app;
CREATE FUNCTION publish_school_domain(request_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE request school_domain_requests;tenant uuid;
BEGIN
 tenant:=nullif(current_setting('app.school_id',true),'')::uuid;
 SELECT * INTO request FROM school_domain_requests WHERE id=request_id AND school_id=tenant;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM schools WHERE id=tenant AND verified=true) THEN RAISE EXCEPTION 'School is not verified';END IF;
 IF EXISTS(SELECT 1 FROM school_domains WHERE host=request.host AND school_id<>tenant) THEN RAISE EXCEPTION 'Domain belongs to another school';END IF;
 INSERT INTO school_domains(host,school_id,verified,school_verified,active) VALUES(request.host,tenant,request.status='verified',true,request.status='verified') ON CONFLICT(host) DO UPDATE SET verified=EXCLUDED.verified,active=EXCLUDED.active;
END $$;
REVOKE ALL ON FUNCTION publish_school_domain(uuid) FROM PUBLIC;GRANT EXECUTE ON FUNCTION publish_school_domain(uuid) TO campus_app;
COMMIT;
