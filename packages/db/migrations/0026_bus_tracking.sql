BEGIN;
CREATE TABLE bus_assignments (
 id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),student_id uuid NOT NULL,vehicle_id uuid NOT NULL,
 stop_name text NOT NULL,active boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,student_id),FOREIGN KEY(school_id,student_id) REFERENCES students(school_id,id),FOREIGN KEY(school_id,vehicle_id) REFERENCES vehicles(school_id,id)
);
CREATE TABLE bus_live_state (
 vehicle_id uuid PRIMARY KEY,school_id uuid NOT NULL REFERENCES schools(id),session_id uuid NOT NULL,active boolean NOT NULL DEFAULT false,
 latitude double precision CHECK(latitude BETWEEN -90 AND 90),longitude double precision CHECK(longitude BETWEEN -180 AND 180),
 accuracy_m double precision CHECK(accuracy_m BETWEEN 0 AND 5000),speed_kmh double precision CHECK(speed_kmh BETWEEN 0 AND 160),recorded_at timestamptz,received_at timestamptz,
 source text NOT NULL DEFAULT 'gps' CHECK(source IN ('gps','demo')),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid NOT NULL REFERENCES users(id),FOREIGN KEY(school_id,vehicle_id) REFERENCES vehicles(school_id,id)
);
ALTER TABLE bus_assignments ENABLE ROW LEVEL SECURITY;ALTER TABLE bus_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bus_assignments USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
ALTER TABLE bus_live_state ENABLE ROW LEVEL SECURITY;ALTER TABLE bus_live_state FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON bus_live_state USING(school_id=nullif(current_setting('app.school_id',true),'')::uuid) WITH CHECK(school_id=nullif(current_setting('app.school_id',true),'')::uuid);
GRANT SELECT,INSERT,UPDATE ON bus_assignments,bus_live_state TO campus_app;
CREATE INDEX ON bus_assignments(school_id,vehicle_id) WHERE active=true;
COMMIT;
