-- ─── ALTER BROADCAST_CAMPAIGNS: intervalo aleatório entre envios ───
-- Execute no Supabase SQL Editor ou via psql
ALTER TABLE broadcast_campaigns
  ADD COLUMN IF NOT EXISTS min_interval_seconds INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS max_interval_seconds INTEGER NOT NULL DEFAULT 5;
