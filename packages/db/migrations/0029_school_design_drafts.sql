BEGIN;
CREATE TABLE school_design_drafts (
 school_id uuid PRIMARY KEY REFERENCES schools(id),payload jsonb NOT NULL,version integer NOT NULL DEFAULT 1,
 created_by uuid NOT NULL REFERENCES users(id),updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE school_design_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_design_drafts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON school_design_drafts USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON school_design_drafts TO campus_app;
COMMIT;
