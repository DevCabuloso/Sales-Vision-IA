-- ─── ALTER AI_CONFIGS: base de conhecimento (catálogo de produtos/serviços) ───
ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS knowledge_base            TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_base_filename   TEXT,
  ADD COLUMN IF NOT EXISTS knowledge_base_updated_at TIMESTAMPTZ;
