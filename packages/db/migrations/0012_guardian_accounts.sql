BEGIN;
CREATE FUNCTION provision_guardian_account(identity_email text,account_name text,credential_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE tenant uuid;actor uuid;person uuid;
BEGIN
 tenant:=nullif(current_setting('app.school_id',true),'')::uuid;
 actor:=nullif(current_setting('app.actor_id',true),'')::uuid;
 IF NOT EXISTS(SELECT 1 FROM memberships WHERE school_id=tenant AND user_id=actor AND role IN ('principal','admin') AND active=true) THEN RAISE EXCEPTION 'Permission denied';END IF;
 IF identity_email !~ '^[a-f0-9]{64}@phone[.]identity[.]campus[.]invalid$' THEN RAISE EXCEPTION 'Invalid identity';END IF;
 INSERT INTO users(id,email,display_name,password_hash) VALUES(campus_uuid_v7(),identity_email,account_name,credential_hash) ON CONFLICT(email) DO NOTHING;
 SELECT id INTO person FROM users WHERE email=identity_email;
 INSERT INTO memberships(id,school_id,user_id,role,created_by) VALUES(campus_uuid_v7(),tenant,person,'parent',actor) ON CONFLICT(school_id,user_id,role) DO UPDATE SET active=true,version=memberships.version+1;
 RETURN person;
END $$;
REVOKE ALL ON FUNCTION provision_guardian_account(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_guardian_account(text,text,text) TO campus_app;
COMMIT;
