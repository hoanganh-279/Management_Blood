-- TT26-min: facility supply flags + blood transfer lifecycle + audit events
-- Apply after 20260917120000_facility_pivot.sql (or on empty DB after mvp_core).

ALTER TABLE donation_centers
  ADD COLUMN IF NOT EXISTS allowed_to_supply_others BOOLEAN DEFAULT FALSE;

ALTER TABLE donation_centers
  ADD COLUMN IF NOT EXISTS has_supply_contract BOOLEAN DEFAULT FALSE;

-- Banks typically supply others in prototype config (not a BYT license claim)
UPDATE donation_centers
SET allowed_to_supply_others = TRUE
WHERE facility_type = 'bank' AND allowed_to_supply_others IS DISTINCT FROM TRUE;

CREATE TYPE transfer_status AS ENUM (
  'proposed',
  'source_confirmed',
  'exported',
  'in_transit',
  'inbound_pending',
  'received',
  'rejected',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS blood_transfers (
  id TEXT PRIMARY KEY,
  blood_request_id TEXT REFERENCES blood_requests(id),
  blood_unit_id TEXT NOT NULL REFERENCES blood_units(id),
  source_center_id TEXT NOT NULL REFERENCES donation_centers(id),
  dest_center_id TEXT NOT NULL REFERENCES donation_centers(id),
  status transfer_status DEFAULT 'proposed',
  leadership_confirmed_by TEXT REFERENCES users(id),
  transport_checklist JSONB DEFAULT '{}',
  inbound_checklist JSONB DEFAULT '{}',
  cancel_reason TEXT DEFAULT '',
  note TEXT DEFAULT '',
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transfer_events (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES blood_transfers(id),
  actor_id TEXT REFERENCES users(id),
  from_status TEXT,
  to_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS transfer_id TEXT REFERENCES blood_transfers(id);

CREATE INDEX IF NOT EXISTS idx_blood_transfers_status ON blood_transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfer_events_transfer ON transfer_events(transfer_id);
