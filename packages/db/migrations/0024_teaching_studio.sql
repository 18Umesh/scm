BEGIN;
CREATE TABLE teaching_plans (
 id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), owner_id uuid NOT NULL REFERENCES users(id),
 class_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft', payload jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(school_id,class_id) REFERENCES classes(school_id,id)
);
ALTER TABLE teaching_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teaching_plans USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON teaching_plans FOR EACH ROW EXECUTE FUNCTION audit_record_change();
CREATE INDEX ON teaching_plans(school_id,owner_id,class_id);
GRANT SELECT,INSERT,UPDATE ON teaching_plans TO campus_app;
CREATE TABLE teaching_generations (
 id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id), owner_id uuid NOT NULL REFERENCES users(id),
 status text NOT NULL DEFAULT 'requested', model text, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE teaching_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teaching_generations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON teaching_generations USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
CREATE INDEX ON teaching_generations(school_id,created_at);
GRANT SELECT,INSERT,UPDATE ON teaching_generations TO campus_app;
COMMIT;
