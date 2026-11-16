BEGIN;
CREATE UNIQUE INDEX fee_plan_student_invoice_once ON fee_invoices(school_id,student_id,(payload->>'feePlanId')) WHERE payload ? 'feePlanId' AND deleted_at IS NULL;
COMMIT;
