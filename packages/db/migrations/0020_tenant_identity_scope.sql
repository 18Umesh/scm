BEGIN;
CREATE OR REPLACE FUNCTION disable_student_membership(student_record uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;actor uuid;person uuid;
BEGIN
 tenant:=nullif(current_setting('app.school_id',true),'')::uuid;actor:=nullif(current_setting('app.actor_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM memberships WHERE school_id=tenant AND user_id=actor AND role IN ('principal','admin') AND active=true) THEN RAISE EXCEPTION 'Permission denied';END IF;
 SELECT owner_id INTO person FROM students WHERE id=student_record AND school_id=tenant AND status='withdrawn';
 IF person IS NULL THEN RETURN;END IF;
 UPDATE sessions SET revoked_at=now(),version=version+1 WHERE school_id=tenant AND membership_id IN (SELECT id FROM memberships WHERE school_id=tenant AND user_id=person AND role='student' AND scope->>'studentId'=student_record::text);
 UPDATE memberships SET active=false,version=version+1 WHERE school_id=tenant AND user_id=person AND role='student' AND scope->>'studentId'=student_record::text;

END $$;
REVOKE ALL ON FUNCTION disable_student_membership(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION disable_student_membership(uuid) TO campus_app;
COMMIT;
