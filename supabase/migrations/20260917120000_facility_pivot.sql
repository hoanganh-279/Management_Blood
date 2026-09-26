-- Pivot MVP: facility coordination (hospital ↔ blood bank)
-- Apply after 20260917000000_mvp_core.sql on existing Postgres, OR use sql_editor_bootstrap.sql on empty project.

-- 1) Drop donor-centric tables
DROP TABLE IF EXISTS donations CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS donors CASCADE;

DROP TYPE IF EXISTS appointment_status CASCADE;

-- 2) Rebuild notifications for staff
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  center_id TEXT REFERENCES donation_centers(id),
  request_id TEXT REFERENCES blood_requests(id),
  channel TEXT DEFAULT 'in_app',
  template TEXT DEFAULT '',
  body TEXT DEFAULT '',
  status TEXT DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT REFERENCES users(id)
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 3) Transfer ↔ demand link
ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS blood_request_id TEXT REFERENCES blood_requests(id);

-- 4) Facility reliability proxy for matching R component
ALTER TABLE donation_centers
  ADD COLUMN IF NOT EXISTS transfer_success_rate DOUBLE PRECISION DEFAULT 0.85;

UPDATE donation_centers SET facility_type = 'hospital' WHERE facility_type = 'center';

-- 5) Role enum: donor/staff_center → staff_hospital
ALTER TABLE users ALTER COLUMN role TYPE TEXT USING role::text;
DROP TYPE IF EXISTS user_role CASCADE;
CREATE TYPE user_role AS ENUM ('staff_hospital', 'staff_bank', 'admin');
UPDATE users SET role = 'staff_hospital' WHERE role IN ('staff_center', 'donor');
ALTER TABLE users ALTER COLUMN role TYPE user_role USING role::user_role;

-- 6) Notification status enum cleanup (optional text above; recreate enum if used elsewhere)
DROP TYPE IF EXISTS notification_status CASCADE;
CREATE TYPE notification_status AS ENUM ('draft', 'sent', 'read', 'failed');
