-- ═══════════════════════════════════════════════════════
-- SDR IA Enterprise — Migration: Mensagens Agendadas
-- Agendamento de mensagem avulsa por lead (conversa individual).
-- Execute no Supabase SQL Editor ou via psql.
-- ═══════════════════════════════════════════════════════

-- status: 'pending' | 'sent' | 'cancelled' | 'failed'
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id    UUID        NOT NULL REFERENCES leads(id)   ON DELETE CASCADE,
  created_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  text       TEXT        NOT NULL,
  send_at    TIMESTAMPTZ NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'pending',
  error      TEXT,
  sent_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due  ON scheduled_messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_lead ON scheduled_messages(lead_id, status);
