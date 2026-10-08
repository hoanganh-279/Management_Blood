-- TT26 strict compliance (P2d): quarantine/discarded units, named handover/receiver,
-- separate arrival step, leadership reason, demand cancel reason, general audit log.
-- Apply after 20260924000000_tt26_transfer_lifecycle.sql.

ALTER TYPE blood_unit_status ADD VALUE IF NOT EXISTS 'quarantine';
ALTER TYPE blood_unit_status ADD VALUE IF NOT EXISTS 'discarded';

ALTER TABLE blood_transfers
  ADD COLUMN IF NOT EXISTS leadership_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS leadership_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS handed_over_by TEXT REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS carrier_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS received_by TEXT REFERENCES users(id);

ALTER TABLE inventory_transactions
  ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT '';

ALTER TABLE blood_requests
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT DEFAULT '',
  entity_id TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- Accessed only through FastAPI (service role); no client policies.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE donation_centers ENABLE ROW LEVEL SECURITY;
