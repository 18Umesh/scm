BEGIN;
CREATE UNIQUE INDEX bank_import_line_once ON bank_statement_lines(school_id,(payload->>'date'),(payload->>'reference'),(payload->>'amountPaise'),(payload->>'direction')) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX bank_journal_reconciled_once ON bank_statement_lines(school_id,(payload->>'journalId')) WHERE status='matched' AND deleted_at IS NULL;
CREATE FUNCTION protect_reconciled_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='matched' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.status IS DISTINCT FROM OLD.status OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at) THEN RAISE EXCEPTION 'Reconciled bank lines are immutable';END IF;RETURN NEW;
END $$;
CREATE TRIGGER protect_match BEFORE UPDATE ON bank_statement_lines FOR EACH ROW EXECUTE FUNCTION protect_reconciled_line();
COMMIT;
