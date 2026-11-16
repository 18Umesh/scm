BEGIN;
ALTER TABLE payments DROP CONSTRAINT payments_mode_check;
ALTER TABLE payments ADD CONSTRAINT payments_mode_check CHECK(mode IN ('cash','cheque','dd','upi','card','bankTransfer','gateway','demo'));
COMMIT;
