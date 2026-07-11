-- ════════════════════════════════════════════════════════════════
-- Cobrança de teste grátis (7 dias) via InfinitePay Checkout Integrado.
--
-- Contexto: a landing page pública (/teste-gratis) cria um tenant
-- em status 'pending_payment' e gera um link de checkout na InfinitePay.
-- Quando o pagamento é confirmado (webhook), o tenant vira 'trial' com
-- prazo em trial_ends_at. checkout_orders guarda cada pedido pra validar
-- o webhook por order_nsu + valor pago (a InfinitePay não documenta
-- assinatura de webhook, então essa é a validação disponível).
--
-- Rode este arquivo no SQL Editor do Supabase. Idempotente — pode
-- rodar de novo sem problema (IF NOT EXISTS em tudo).
-- ════════════════════════════════════════════════════════════════

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
-- default true: só o fluxo de trial-signup (backend/src/routes/billing.js) marca
-- explicitamente onboarding_completed=false — clientes já existentes ou criados
-- pelo painel admin não devem ser jogados no wizard de onboarding sem querer.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT true;

CREATE TABLE IF NOT EXISTS checkout_orders (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references tenants(id) on delete cascade,
  user_id          uuid references users(id) on delete set null,
  order_nsu        text not null unique,
  plan             text not null,
  amount_cents     int not null,
  status           text not null default 'pending', -- pending | paid | mismatched
  infinitepay_slug text,
  checkout_url     text,
  transaction_nsu  text,
  receipt_url      text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_checkout_orders_tenant_id ON checkout_orders(tenant_id);
