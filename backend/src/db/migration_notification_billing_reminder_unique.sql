-- Fecha a corrida (SELECT-then-INSERT, não atômico) em
-- createBillingReminderNotification: duas chamadas quase simultâneas (ticks
-- do scheduler + clique manual, por exemplo) podiam passar as duas pelo
-- SELECT de "já existe aviso hoje?" antes de qualquer INSERT confirmar,
-- duplicando o aviso no sino. Este índice único parcial garante, no próprio
-- banco, no máximo um aviso de billing_reminder por tenant por dia.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_notifications_billing_reminder_per_day
  ON notifications (tenant_id, ((created_at AT TIME ZONE 'America/Sao_Paulo')::date))
  WHERE type = 'billing_reminder';

INSERT INTO schema_migrations (filename) VALUES ('migration_notification_billing_reminder_unique.sql')
ON CONFLICT DO NOTHING;
