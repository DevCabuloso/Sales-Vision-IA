-- Lembrete de vencimento de mensalidade para clientes já convertidos (status
-- 'active'), já que requireTenant só olha trial_ends_at quando status='trial'.
-- next_billing_at é puramente informativo: não bloqueia acesso, só alimenta o
-- lembrete visual no painel do dono. A renovação continua manual (o dono
-- cobra o cliente por fora e clica em "Renovar" no painel).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS next_billing_at timestamptz;

-- Backfill: tenants que já tinham trial_ends_at (ex: teste grátis pago)
-- ganham next_billing_at igual, pra já aparecer algo no painel sem esperar
-- a próxima renovação manual.
UPDATE tenants SET next_billing_at = trial_ends_at
WHERE next_billing_at IS NULL AND trial_ends_at IS NOT NULL;

INSERT INTO schema_migrations (filename) VALUES ('migration_billing_reminder.sql')
ON CONFLICT DO NOTHING;
