BEGIN;
CREATE OR REPLACE FUNCTION provision_staff_account(account_email text,account_name text,credential_hash text,assigned_role text,second_factor text,assigned_scope jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;actor uuid;person uuid;
BEGIN
 tenant:=nullif(current_setting('app.school_id',true),'')::uuid;actor:=nullif(current_setting('app.actor_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM memberships WHERE school_id=tenant AND user_id=actor AND role IN ('principal','admin') AND active=true) THEN RAISE EXCEPTION 'Permission denied';END IF;
 IF assigned_role NOT IN ('management','principal','hod','teacher','accounts','admin','vicePrincipal','incharge','driver','examCoordinator','admissionsOfficer','hr','librarian','transportManager','driver','busAttendant','hostelWarden','inventoryManager','nurse','counsellor','security','auditor','groupAdmin') THEN RAISE EXCEPTION 'Invalid staff role';END IF;
 SELECT id INTO person FROM users WHERE email=account_email;
 IF person IS NULL THEN
  person:=campus_uuid_v7();INSERT INTO users(id,email,display_name,password_hash,totp_secret) VALUES(person,account_email,account_name,credential_hash,second_factor);
 END IF;
 IF assigned_role IN ('principal','management','accounts','hr','auditor') AND NOT EXISTS(SELECT 1 FROM users WHERE id=person AND totp_secret IS NOT NULL) THEN RAISE EXCEPTION 'Second factor required';END IF;
 INSERT INTO memberships(id,school_id,user_id,role,scope,created_by) VALUES(campus_uuid_v7(),tenant,person,assigned_role,assigned_scope,actor);
 RETURN person;
END $$;
REVOKE ALL ON FUNCTION provision_staff_account(text,text,text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_staff_account(text,text,text,text,text,jsonb) TO campus_app;
COMMIT;
