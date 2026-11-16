BEGIN;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['report_cards'] LOOP
  EXECUTE format('CREATE TABLE %I(id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),owner_id uuid REFERENCES users(id),class_id uuid,student_id uuid,staff_id uuid,status text NOT NULL DEFAULT ''active'',payload jsonb NOT NULL,audience jsonb,published boolean NOT NULL DEFAULT false,deleted_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES users(id),version integer NOT NULL DEFAULT 1,UNIQUE(school_id,id),FOREIGN KEY(school_id,class_id) REFERENCES classes(school_id,id),FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,id),FOREIGN KEY(school_id,staff_id) REFERENCES staff(school_id,id))',t);
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid) WITH CHECK(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid)',t);
  EXECUTE format('CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',t);
  EXECUTE format('CREATE INDEX ON %I(school_id,created_at DESC,id)',t);EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO campus_app',t);
 END LOOP;
END $$;
CREATE UNIQUE INDEX report_card_student_period ON report_cards(school_id,student_id,(payload->>'academicYearId'),(COALESCE(payload->>'termId','year'))) WHERE deleted_at IS NULL;
CREATE FUNCTION protect_report_card() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status IN ('approved','published') AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN RAISE EXCEPTION 'Approved report cards are immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_snapshot BEFORE UPDATE ON report_cards FOR EACH ROW EXECUTE FUNCTION protect_report_card();
COMMIT;
