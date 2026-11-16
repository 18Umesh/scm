BEGIN;
ALTER TABLE school_branding ADD COLUMN config jsonb NOT NULL DEFAULT '{}';
ALTER TABLE school_settings ADD COLUMN operations_config jsonb NOT NULL DEFAULT '{"leaveAllowanceHalfDays":24,"leaveEscalationHalfDays":6,"weeklyOffs":[0],"approvalLimitPaise":"100000"}';
GRANT UPDATE(name,short_name,city,state,updated_at,version) ON schools TO campus_app;
CREATE TABLE school_app_credentials (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),provider text NOT NULL,
 encrypted_value text NOT NULL,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,provider)
);
ALTER TABLE school_app_credentials ENABLE ROW LEVEL SECURITY;ALTER TABLE school_app_credentials FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_app_credentials USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
CREATE TRIGGER log_change AFTER INSERT OR UPDATE ON school_app_credentials FOR EACH ROW EXECUTE FUNCTION audit_record_change();
GRANT SELECT,INSERT,UPDATE ON school_app_credentials TO campus_app;
COMMIT;
