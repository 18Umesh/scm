BEGIN;
ALTER TABLE bus_live_state ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'gps' CHECK(source IN ('gps','demo'));
COMMIT;
