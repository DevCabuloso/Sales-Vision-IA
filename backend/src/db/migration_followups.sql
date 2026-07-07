-- ═══════════════════════════════════════════════════════
-- SDR IA Enterprise — Migration: Acompanhamentos
-- Sequências de mensagens automáticas por contato (follow-up).
-- Execute no Supabase SQL Editor ou via psql.
-- ═══════════════════════════════════════════════════════

-- Template reutilizável de sequência.
CREATE TABLE IF NOT EXISTS followup_sequences (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  description TEXT,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_sequences_tenant ON followup_sequences(tenant_id);

-- Etapas do template (ordem + intervalo em dias a partir do início).
CREATE TABLE IF NOT EXISTS followup_steps (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id    UUID        NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_index    INT         NOT NULL,
  delay_days     INT         NOT NULL DEFAULT 0,
  text           TEXT        NOT NULL,
  media_url      TEXT,
  media_type     TEXT,
  media_mimetype TEXT,
  media_filename TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_steps_sequence ON followup_steps(sequence_id, order_index);

-- Instância de "contato X rodando a sequência Y" (status: active | completed | cancelled).
-- Apenas um enrollment ativo por lead, garantido pelo índice único parcial abaixo.
CREATE TABLE IF NOT EXISTS followup_enrollments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id UUID        NOT NULL REFERENCES followup_sequences(id) ON DELETE CASCADE,
  lead_id     UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  status      TEXT        NOT NULL DEFAULT 'active',
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_followup_enrollments_active_lead
  ON followup_enrollments(lead_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_followup_enrollments_lead ON followup_enrollments(lead_id, status);

-- Mensagens materializadas (cópia do texto/mídia da etapa) com data de envio já calculada.
-- status: 'pending' | 'sent' | 'cancelled' | 'failed'
CREATE TABLE IF NOT EXISTS followup_enrollment_messages (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrollment_id  UUID        NOT NULL REFERENCES followup_enrollments(id) ON DELETE CASCADE,
  lead_id        UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  step_id        UUID        REFERENCES followup_steps(id) ON DELETE SET NULL,
  order_index    INT         NOT NULL,
  text           TEXT        NOT NULL,
  media_url      TEXT,
  media_type     TEXT,
  media_mimetype TEXT,
  media_filename TEXT,
  send_at        TIMESTAMPTZ NOT NULL,
  status         TEXT        NOT NULL DEFAULT 'pending',
  error          TEXT,
  sent_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_followup_msgs_due ON followup_enrollment_messages(status, send_at);
CREATE INDEX IF NOT EXISTS idx_followup_msgs_enr ON followup_enrollment_messages(enrollment_id, status);
