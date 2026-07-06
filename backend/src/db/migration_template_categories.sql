-- ═══════════════════════════════════════════════════════
-- SDR IA Enterprise — Migration: Categorias de Templates
-- Permite ao cliente criar/gerenciar suas próprias categorias
-- de templates de mensagem (além das padrão: Marketing, Utilidade).
-- Execute no Supabase SQL Editor ou via psql.
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS template_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX IF NOT EXISTS idx_template_categories_tenant ON template_categories(tenant_id);

-- Semeia Marketing e Utilidade para todos os tenants já existentes
INSERT INTO template_categories (tenant_id, name)
SELECT id, 'Marketing' FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;

INSERT INTO template_categories (tenant_id, name)
SELECT id, 'Utilidade' FROM tenants
ON CONFLICT (tenant_id, name) DO NOTHING;
