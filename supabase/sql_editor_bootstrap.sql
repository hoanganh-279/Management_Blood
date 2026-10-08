-- =============================================================================
-- Management Blood — bootstrap facility coordination (hospital ↔ blood bank)
-- Paste into: Dashboard → SQL Editor → New query → Run (once) on EMPTY project
-- Synthetic demo data only.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('staff_hospital', 'staff_bank', 'admin');
CREATE TYPE blood_unit_status AS ENUM (
  'ready', 'reserved', 'transferred', 'used', 'expired', 'critical', 'quarantine', 'discarded'
);
CREATE TYPE transaction_type AS ENUM ('in', 'out', 'transfer');
CREATE TYPE request_priority AS ENUM ('normal', 'urgent', 'flash');
CREATE TYPE request_status AS ENUM ('open', 'matching', 'fulfilled', 'cancelled');
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');
CREATE TYPE alert_status AS ENUM ('open', 'processing', 'resolved');
CREATE TYPE notification_status AS ENUM ('draft', 'sent', 'read', 'failed');

CREATE TABLE donation_centers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT DEFAULT '',
  lat DOUBLE PRECISION DEFAULT 21.0285,
  lng DOUBLE PRECISION DEFAULT 105.8542,
  capacity INT DEFAULT 50,
  hours TEXT DEFAULT '07:30-17:00',
  facility_type TEXT DEFAULT 'hospital',
  transfer_success_rate DOUBLE PRECISION DEFAULT 0.85,
  allowed_to_supply_others BOOLEAN DEFAULT FALSE,
  has_supply_contract BOOLEAN DEFAULT FALSE
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  hashed_password TEXT NOT NULL,
  role user_role NOT NULL,
  center_id TEXT REFERENCES donation_centers(id),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE blood_units (
  id TEXT PRIMARY KEY,
  barcode TEXT UNIQUE NOT NULL,
  blood_type TEXT NOT NULL,
  product_type TEXT DEFAULT 'PRBC',
  volume_ml INT DEFAULT 350,
  collected_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  status blood_unit_status DEFAULT 'ready',
  center_id TEXT NOT NULL REFERENCES donation_centers(id),
  location_label TEXT DEFAULT '',
  dss_status TEXT DEFAULT 'Ready'
);

CREATE TABLE blood_requests (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  facility_name TEXT NOT NULL,
  center_id TEXT REFERENCES donation_centers(id),
  blood_type TEXT NOT NULL,
  product_type TEXT DEFAULT 'PRBC',
  qty_needed INT NOT NULL,
  qty_fulfilled INT DEFAULT 0,
  priority request_priority DEFAULT 'urgent',
  deadline TIMESTAMPTZ NOT NULL,
  status request_status DEFAULT 'open',
  department TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  cancel_reason TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES blood_units(id),
  type transaction_type NOT NULL,
  from_center_id TEXT REFERENCES donation_centers(id),
  to_center_id TEXT REFERENCES donation_centers(id),
  blood_request_id TEXT REFERENCES blood_requests(id),
  transfer_id TEXT,
  actor_id TEXT REFERENCES users(id),
  reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE transfer_status AS ENUM (
  'proposed', 'source_confirmed', 'exported', 'in_transit',
  'inbound_pending', 'received', 'rejected', 'cancelled'
);

CREATE TABLE blood_transfers (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT REFERENCES blood_requests(id),
  blood_unit_id TEXT NOT NULL REFERENCES blood_units(id),
  source_center_id TEXT NOT NULL REFERENCES donation_centers(id),
  dest_center_id TEXT NOT NULL REFERENCES donation_centers(id),
  status transfer_status DEFAULT 'proposed',
  leadership_confirmed_by TEXT REFERENCES users(id),
  leadership_confirmed_at TIMESTAMPTZ,
  leadership_reason TEXT DEFAULT '',
  handed_over_by TEXT REFERENCES users(id),
  carrier_name TEXT DEFAULT '',
  arrived_at TIMESTAMPTZ,
  received_by TEXT REFERENCES users(id),
  transport_checklist JSONB DEFAULT '{}',
  inbound_checklist JSONB DEFAULT '{}',
  cancel_reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_transactions
  ADD CONSTRAINT inventory_transactions_transfer_id_fkey
  FOREIGN KEY (transfer_id) REFERENCES blood_transfers(id);

CREATE TABLE transfer_events (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES blood_transfers(id),
  actor_id TEXT REFERENCES users(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE alerts (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'shortage',
  severity alert_severity DEFAULT 'warning',
  title TEXT NOT NULL,
  blood_type TEXT DEFAULT '',
  center_id TEXT REFERENCES donation_centers(id),
  request_id TEXT REFERENCES blood_requests(id),
  metrics JSONB DEFAULT '{}',
  status alert_status DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id),
  center_id TEXT REFERENCES donation_centers(id),
  request_id TEXT REFERENCES blood_requests(id),
  channel TEXT DEFAULT 'in_app',
  template TEXT DEFAULT '',
  body TEXT DEFAULT '',
  status notification_status DEFAULT 'sent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT REFERENCES users(id)
);

CREATE TABLE matching_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES blood_requests(id),
  actor_id TEXT REFERENCES users(id),
  weights JSONB DEFAULT '{}',
  candidates JSONB DEFAULT '[]',
  top_k INT DEFAULT 20,
  radius_km DOUBLE PRECISION DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_events ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Seed (bcrypt hashes match backend seed: Admin@123 / Hospital@123 / Bank@123)
-- Prefer running backend seed on empty DB; optional inserts below for Dashboard-only demo.
-- ---------------------------------------------------------------------------

INSERT INTO donation_centers (id, name, address, lat, lng, capacity, hours, facility_type, transfer_success_rate, allowed_to_supply_others, has_supply_contract) VALUES
('c-dong-da', 'BV Đa khoa Đống Đa', 'Đống Đa, Hà Nội', 21.0167, 105.8310, 40, '00:00-24:00', 'hospital', 0.78, FALSE, FALSE),
('c-bach-mai', 'Bệnh viện Bạch Mai', 'Đống Đa, Hà Nội', 21.0020, 105.8400, 80, '00:00-24:00', 'hospital', 0.82, TRUE, TRUE),
('c-huyet-hoc', 'Viện Huyết học TW', 'Phạm Văn Bạch, Hà Nội', 21.0400, 105.7850, 120, '00:00-24:00', 'bank', 0.95, TRUE, TRUE),
('c-viet-duc', 'BV Việt Đức', 'Hoàn Kiếm, Hà Nội', 21.0288, 105.8470, 60, '00:00-24:00', 'hospital', 0.80, TRUE, FALSE);

-- Passwords are set by FastAPI seed when using backend. Placeholder rows omitted here
-- to avoid mismatched hashes; use: uvicorn seed on empty DATABASE_URL.
