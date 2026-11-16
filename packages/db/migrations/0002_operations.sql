BEGIN;
-- All operational tables use a common envelope. Validated, versioned module data
-- lives in payload; identity, ownership and school isolation remain relational.
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'academic_years','classes','subjects','departments','students','staff',
    'guardians','timetable_entries','attendance_records','staff_attendance',
    'leave_requests','student_leave_requests','substitutions','homework',
    'homework_submissions','posts','calendar_items','messages','notification_events',
    'exams','marks','certificates','admissions','lesson_plans','ptm_bookings',
    'transport_routes','vehicles','bus_trips','library_books','library_loans',
    'inventory_items','stock_movements','vendors','budgets','purchase_requests',
    'bills','payroll_runs','payslips','bank_statement_lines','grievances',
    'consent_records','data_requests','duty_rosters','teacher_observations',
    'pickup_authorizations','gate_passes','safety_reports','training_records',
    'meeting_minutes','achievements','surveys','albums','supply_lists',
    'hostel_rooms','hostel_allocations','health_records','school_layouts',
    'school_apps','school_app_builds','import_batches','locked_periods',
    'fee_heads','fee_plans','fee_invoices','concessions','refunds',
    'cashier_sessions','outbox_events','knowledge_documents','tax_settings'
  ] LOOP
    EXECUTE format('CREATE TABLE %I (
      id uuid PRIMARY KEY, school_id uuid NOT NULL REFERENCES schools(id),
      owner_id uuid REFERENCES users(id), class_id uuid, student_id uuid, staff_id uuid,
      status text NOT NULL DEFAULT ''active'', payload jsonb NOT NULL,
      audience jsonb, published boolean NOT NULL DEFAULT false,
      deleted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
      created_by uuid REFERENCES users(id),version integer NOT NULL DEFAULT 1,
      UNIQUE(school_id,id)
    )',table_name);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON %I USING (school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid) WITH CHECK (school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid)',table_name);
    EXECUTE format('CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',table_name);
    EXECUTE format('CREATE INDEX ON %I(school_id,created_at DESC,id)',table_name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE ON %I TO campus_app',table_name);
  END LOOP;
END $$;
DO $$ DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'students','staff','guardians','timetable_entries','attendance_records','staff_attendance',
    'leave_requests','student_leave_requests','substitutions','homework','homework_submissions',
    'posts','calendar_items','messages','notification_events','exams','marks','certificates',
    'admissions','lesson_plans','ptm_bookings','bus_trips','library_loans','payslips',
    'grievances','consent_records','data_requests','duty_rosters','teacher_observations',
    'pickup_authorizations','gate_passes','safety_reports','training_records','achievements',
    'surveys','albums','hostel_allocations','health_records','fee_invoices','concessions','refunds'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY(school_id,class_id) REFERENCES classes(school_id,id)',table_name);
    EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,id)',table_name);
    EXECUTE format('ALTER TABLE %I ADD FOREIGN KEY(school_id,staff_id) REFERENCES staff(school_id,id)',table_name);
  END LOOP;
END $$;
CREATE UNIQUE INDEX student_admission_number ON students(school_id,(payload->>'admissionNumber')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX guardian_link ON guardians(school_id,owner_id,student_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX student_attendance_unique ON attendance_records(school_id,student_id,(payload->>'date'),(payload->>'period')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX staff_attendance_unique ON staff_attendance(school_id,staff_id,(payload->>'date')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX exam_mark_unique ON marks(school_id,student_id,(payload->>'examId'),(payload->>'subjectId')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX staff_user_unique ON staff(school_id,owner_id) WHERE owner_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX outbox_pending ON outbox_events(school_id,status,created_at);
COMMIT;
