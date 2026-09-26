-- MVP core schema — facility coordination (hospital ↔ blood bank)
-- Prefer sql_editor_bootstrap.sql for empty Supabase projects (schema + notes).
-- Local prototype uses SQLAlchemy create_all from backend models.

CREATE TYPE user_role AS ENUM ('staff_hospital', 'staff_bank', 'admin');
CREATE TYPE blood_unit_status AS ENUM ('ready', 'reserved', 'transferred', 'used', 'expired', 'critical');
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
  transfer_success_rate DOUBLE PRECISION DEFAULT 0.85
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
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transactions (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES blood_units(id),
  type transaction_type NOT NULL,
  from_center_id TEXT REFERENCES donation_centers(id),
  to_center_id TEXT REFERENCES donation_centers(id),
  blood_request_id TEXT REFERENCES blood_requests(id),
  actor_id TEXT REFERENCES users(id),
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

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE blood_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE matching_logs ENABLE ROW LEVEL SECURITY;
