BEGIN;
CREATE OR REPLACE FUNCTION provision_student_login(student_record uuid,username text,credential_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;actor uuid;person uuid;class_enabled boolean;
BEGIN
 tenant:=nullif(current_setting('app.school_id',true),'')::uuid;actor:=nullif(current_setting('app.actor_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM memberships WHERE school_id=tenant AND user_id=actor AND role IN ('principal','admin') AND active=true) THEN RAISE EXCEPTION 'Permission denied';END IF;
 SELECT (c.payload->>'studentLoginEnabled')::boolean INTO class_enabled FROM students s JOIN classes c ON c.id=s.class_id AND c.school_id=s.school_id WHERE s.id=student_record AND s.school_id=tenant AND s.deleted_at IS NULL AND s.status='active' AND c.deleted_at IS NULL;
 IF class_enabled IS DISTINCT FROM true THEN RAISE EXCEPTION 'Student login disabled';END IF;
 IF username !~ '^[a-zA-Z0-9._-]{3,40}$' OR length(credential_hash)<100 THEN RAISE EXCEPTION 'Invalid student credentials';END IF;
 SELECT m.user_id INTO person FROM memberships m JOIN students s ON s.owner_id=m.user_id AND s.id=student_record AND s.school_id=m.school_id WHERE m.school_id=tenant AND m.role='student' AND m.active=true AND m.scope->>'studentId'=student_record::text;
 IF person IS NULL THEN
  person:=campus_uuid_v7();
  INSERT INTO users(id,email,display_name,password_hash) SELECT person,lower(username)||'@'||tenant::text||'.student.local',payload->>'name',credential_hash FROM students WHERE id=student_record AND school_id=tenant;
  INSERT INTO memberships(id,school_id,user_id,role,scope,created_by) VALUES(campus_uuid_v7(),tenant,person,'student',jsonb_build_object('studentId',student_record,'username',lower(username)),actor);
 ELSE
  UPDATE users SET password_hash=credential_hash,email=lower(username)||'@'||tenant::text||'.student.local' WHERE id=person;
  UPDATE memberships SET scope=scope||jsonb_build_object('username',lower(username)),version=version+1 WHERE school_id=tenant AND user_id=person AND role='student';
  UPDATE sessions SET revoked_at=now(),version=version+1 WHERE school_id=tenant AND user_id=person AND revoked_at IS NULL;
 END IF;
 UPDATE students SET owner_id=person,payload=payload||jsonb_build_object('loginUsername',lower(username)),version=version+1 WHERE school_id=tenant AND id=student_record;
 RETURN person;
END $$;
COMMIT;
