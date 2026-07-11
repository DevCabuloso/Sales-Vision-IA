-- ════════════════════════════════════════════════════════════════
-- Onboarding v2 — permite que cada tenant use a própria chave OpenAI
-- em vez da chave global da plataforma (config.openai.apiKey).
--
-- A chave é gravada criptografada (mesmo padrão AES-256-GCM de
-- custom_apis.api_key, via backend/src/services/crypto.js) — nunca
-- em texto puro. Ver backend/src/routes/ai-config.js.
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE ai_configs ADD COLUMN IF NOT EXISTS openai_api_key text;
