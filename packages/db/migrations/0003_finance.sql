BEGIN;
CREATE TABLE accounts (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),code text NOT NULL,name text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('asset','liability','income','expense','equity')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,id),UNIQUE(school_id,code)
);
CREATE TABLE journals (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),date date NOT NULL,description text NOT NULL,
 posted boolean NOT NULL DEFAULT false,reversal_of uuid,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,id),FOREIGN KEY(school_id,reversal_of) REFERENCES journals(school_id,id)
);
CREATE UNIQUE INDEX unique_reversal ON journals(school_id,reversal_of) WHERE reversal_of IS NOT NULL;
CREATE TABLE journal_lines (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),journal_id uuid NOT NULL,account_id uuid NOT NULL,
 debit_paise bigint NOT NULL DEFAULT 0,credit_paise bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(school_id,journal_id) REFERENCES journals(school_id,id),FOREIGN KEY(school_id,account_id) REFERENCES accounts(school_id,id),
 CHECK((debit_paise>0 AND credit_paise=0) OR (credit_paise>0 AND debit_paise=0))
);
CREATE TABLE receipt_series (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),financial_year text NOT NULL,series text NOT NULL,last_number bigint NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,financial_year,series)
);
CREATE TABLE payments (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),student_id uuid NOT NULL,invoice_id uuid NOT NULL,
 amount_paise bigint NOT NULL CHECK(amount_paise>0),mode text NOT NULL CHECK(mode IN ('cash','cheque','dd','upi','card','bankTransfer','gateway')),
 reference text NOT NULL,idempotency_key text NOT NULL,status text NOT NULL DEFAULT 'captured',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,id),UNIQUE(school_id,idempotency_key),
 FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,id),FOREIGN KEY(school_id,invoice_id) REFERENCES fee_invoices(school_id,id)
);
CREATE TABLE receipts (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),payment_id uuid NOT NULL,journal_id uuid NOT NULL,
 financial_year text NOT NULL,series text NOT NULL,number bigint NOT NULL,amount_paise bigint NOT NULL CHECK(amount_paise>0),verification_token text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,id),UNIQUE(school_id,payment_id),UNIQUE(school_id,financial_year,series,number),
 FOREIGN KEY(school_id,payment_id) REFERENCES payments(school_id,id),FOREIGN KEY(school_id,journal_id) REFERENCES journals(school_id,id)
);
CREATE TABLE payment_events (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),provider_event_id text NOT NULL,event_type text NOT NULL,payment_reference text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,provider_event_id)
);
CREATE TABLE payment_orders (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),invoice_id uuid NOT NULL,student_id uuid NOT NULL,
 provider_order_id text NOT NULL,amount_paise bigint NOT NULL CHECK(amount_paise>0),status text NOT NULL DEFAULT 'created',
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,version integer NOT NULL DEFAULT 1,
 UNIQUE(school_id,provider_order_id),FOREIGN KEY(school_id,invoice_id) REFERENCES fee_invoices(school_id,id),FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,id)
);
CREATE FUNCTION finance_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME IN ('receipts','payments','payment_events') THEN RAISE EXCEPTION 'Issued financial records are immutable'; END IF;
 IF TG_TABLE_NAME='journals' AND (to_jsonb(OLD)->>'posted')::boolean THEN RAISE EXCEPTION 'Posted journals are immutable'; END IF;
 IF TG_TABLE_NAME='journal_lines' AND EXISTS(SELECT 1 FROM journals WHERE id=(to_jsonb(OLD)->>'journal_id')::uuid AND posted=true) THEN RAISE EXCEPTION 'Posted journal lines are immutable'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION validate_journal_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; posted_state boolean; debit bigint; credit bigint; lines integer;
BEGIN
 target:=CASE WHEN TG_TABLE_NAME='journals' THEN (to_jsonb(NEW)->>'id')::uuid ELSE (to_jsonb(NEW)->>'journal_id')::uuid END;
 SELECT posted INTO posted_state FROM journals WHERE id=target;
 IF posted_state THEN
  SELECT COALESCE(sum(debit_paise),0),COALESCE(sum(credit_paise),0),count(*) INTO debit,credit,lines FROM journal_lines WHERE journal_id=target;
  IF lines<2 OR debit<>credit OR debit=0 THEN RAISE EXCEPTION 'Journal must balance before posting'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE CONSTRAINT TRIGGER balanced_journal AFTER INSERT OR UPDATE ON journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
CREATE CONSTRAINT TRIGGER balanced_lines AFTER INSERT OR UPDATE ON journal_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_journal_balance();
CREATE FUNCTION prevent_posted_line_insert() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN IF EXISTS(SELECT 1 FROM journals WHERE id=NEW.journal_id AND posted=true) THEN RAISE EXCEPTION 'Posted journal lines are immutable';END IF;RETURN NEW;END $$;
CREATE TRIGGER no_posted_line_insert BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION prevent_posted_line_insert();
DO $$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['accounts','journals','journal_lines','receipt_series','payments','receipts','payment_events','payment_orders'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY tenant_isolation ON %I USING(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid) WITH CHECK(school_id=nullif(current_setting(''app.school_id'',true),'''')::uuid)',t);
  EXECUTE format('CREATE TRIGGER log_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_record_change()',t);
  EXECUTE format('GRANT SELECT,INSERT ON %I TO campus_app',t);
  IF t IN ('journals','journal_lines','payments','receipts','payment_events') THEN
   EXECUTE format('CREATE TRIGGER no_financial_edit BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION finance_immutable()',t);
  END IF;
 END LOOP;
END $$;
GRANT UPDATE ON journals,receipt_series,payment_orders TO campus_app;
-- Business documents use reversal/correction workflows once posted or issued.
CREATE FUNCTION immutable_financial_document() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('issued','paid','posted') THEN RAISE EXCEPTION 'Issued financial documents require reversal';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER invoice_no_edit BEFORE UPDATE ON fee_invoices FOR EACH ROW EXECUTE FUNCTION immutable_financial_document();
COMMIT;
