-- ════════════════════════════════════════════════════════════════
-- Schema reconstruído por introspecção read-only do Supabase (endpoint
-- OpenAPI do PostgREST, GET /rest/v1/) em 2026-07-12 — NÃO é um dump
-- oficial (pg_dump) e tem limitações conhecidas:
--
--  - Constraints CHECK, UNIQUE (exceto a PK) e índices não-PK NÃO
--    aparecem no OpenAPI do PostgREST e portanto NÃO estão neste arquivo.
--  - Nomes de constraint de FK abaixo são inventados (fk_<tabela>_<coluna>)
--    porque o OpenAPI não expõe o nome real da constraint no Postgres.
--  - RLS (Row Level Security) não é reportado por este endpoint. Ver
--    migration_tenant_safety_triggers.sql para o que hoje protege
--    cross-tenant no nível de banco (só escrita, não leitura).
--  - Triggers, functions e views não aparecem aqui (ver functions.sql
--    do histórico do git, se precisar recuperar as funções antigas).
--
-- Objetivo: ter pelo menos a estrutura de tabelas/colunas/tipos/FKs
-- versionada de novo no repo, já que o commit "SQL REMOVIDO" (2026-07-08)
-- apagou todo o schema.sql anterior. Trate como ponto de partida — o
-- ideal é substituir por um pg_dump --schema-only real na próxima janela
-- de manutenção.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_configs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text DEFAULT 'SDR IA' NOT NULL,
  model text DEFAULT 'gpt-4o-mini' NOT NULL,
  system_prompt text,
  main_prompt text,
  temperature numeric DEFAULT 0.7 NOT NULL,
  max_tokens integer DEFAULT 1000 NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  knowledge_base text,
  knowledge_base_filename text,
  knowledge_base_updated_at timestamptz,
  openai_api_key text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid,
  lead_name text,
  title text NOT NULL,
  provider text DEFAULT 'google' NOT NULL,
  external_id text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  meeting_link text,
  status text DEFAULT 'scheduled' NOT NULL,
  assignee_id uuid,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  content text NOT NULL,
  template_id uuid,
  scheduled_at timestamptz,
  sent_count integer DEFAULT 0 NOT NULL,
  delivered_count integer DEFAULT 0 NOT NULL,
  read_count integer DEFAULT 0 NOT NULL,
  replied_count integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  min_interval_seconds integer DEFAULT 2 NOT NULL,
  max_interval_seconds integer DEFAULT 5 NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS broadcast_contacts (
  id bigint NOT NULL,
  campaign_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  name text,
  phone text NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  sent_at timestamptz,
  error text,
  created_at timestamptz DEFAULT now() NOT NULL,
  wa_message_id text,
  delivered_at timestamptz,
  read_at timestamptz,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS business_hours (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  timezone text DEFAULT 'America/Sao_Paulo' NOT NULL,
  schedule jsonb NOT NULL,
  off_message text DEFAULT 'Estamos fora do horário de atendimento. Retornaremos em breve!' NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS channels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  instance_name text,
  status text DEFAULT 'disconnected' NOT NULL,
  phone text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  goodbye_message text,
  assigned_user_id uuid,
  assigned_queue_id uuid,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS checkout_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  user_id uuid,
  order_nsu text NOT NULL,
  plan text NOT NULL,
  amount_cents integer NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  infinitepay_slug text,
  checkout_url text,
  transaction_nsu text,
  receipt_url text,
  created_at timestamptz DEFAULT now() NOT NULL,
  paid_at timestamptz,
  webhook_token text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS custom_apis (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  base_url text NOT NULL,
  api_key text,
  model text,
  headers jsonb NOT NULL,
  provider text DEFAULT 'custom' NOT NULL,
  active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS flow_sessions (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  flow_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  current_node_id text NOT NULL,
  variables jsonb,
  status text DEFAULT 'active' NOT NULL,
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS flows (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  status text DEFAULT 'inactive' NOT NULL,
  channel_id uuid,
  trigger_keywords text[],
  timeout_minutes integer DEFAULT 30,
  fallback_text text,
  nodes jsonb NOT NULL,
  edges jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS followup_enrollment_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  enrollment_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  step_id uuid,
  order_index integer NOT NULL,
  text text NOT NULL,
  media_url text,
  media_type text,
  media_mimetype text,
  media_filename text,
  send_at timestamptz NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  error text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS followup_enrollments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  sequence_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  created_by uuid,
  status text DEFAULT 'active' NOT NULL,
  started_at timestamptz DEFAULT now() NOT NULL,
  finished_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS followup_sequences (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  time_mode text DEFAULT 'general' NOT NULL,
  default_send_time text DEFAULT '09:00' NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS followup_steps (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  sequence_id uuid NOT NULL,
  tenant_id uuid NOT NULL,
  order_index integer NOT NULL,
  delay_days integer DEFAULT 0 NOT NULL,
  text text NOT NULL,
  media_url text,
  media_type text,
  media_mimetype text,
  media_filename text,
  created_at timestamptz DEFAULT now() NOT NULL,
  send_time text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  provider text NOT NULL,
  status text DEFAULT 'disconnected' NOT NULL,
  credentials text,
  meta jsonb NOT NULL,
  connected_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS internal_group_members (
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS internal_groups (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  created_by uuid,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS internal_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  group_id uuid NOT NULL,
  sender_id uuid,
  text text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  edited_at timestamptz,
  deleted_at timestamptz,
  forwarded_from_id uuid,
  location_lat double precision,
  location_lng double precision,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS labels (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366F1' NOT NULL,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS lead_stage_history (
  id bigint NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  from_stage text,
  to_stage text NOT NULL,
  changed_by uuid,
  notes text,
  changed_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS leads (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text,
  phone text NOT NULL,
  stage text DEFAULT 'Novo Lead' NOT NULL,
  score integer DEFAULT 0 NOT NULL,
  intention text,
  interests jsonb NOT NULL,
  human_takeover boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  conversation_status text DEFAULT 'pending' NOT NULL,
  email text,
  tags text[],
  assigned_to uuid,
  queue_id uuid,
  label_ids uuid[],
  channel_id uuid,
  is_group boolean DEFAULT false NOT NULL,
  group_subject text,
  wa_remote_jid text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS messages (
  id bigint NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  role text NOT NULL,
  text text NOT NULL,
  provider text,
  is_human_takeover boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  media_url text,
  media_type text,
  media_mimetype text,
  media_filename text,
  wa_message_id text,
  reply_to_id bigint,
  sender_jid text,
  sender_name text,
  edited_at timestamptz,
  deleted_at timestamptz,
  forwarded_from_id bigint,
  location_lat double precision,
  location_lng double precision,
  wa_remote_jid text,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS queue_operators (
  queue_id uuid NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (queue_id, user_id)
);

CREATE TABLE IF NOT EXISTS queues (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6366F1' NOT NULL,
  description text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  created_by uuid,
  text text NOT NULL,
  send_at timestamptz NOT NULL,
  status text DEFAULT 'pending' NOT NULL,
  error text,
  sent_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename text NOT NULL,
  applied_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (filename)
);

CREATE TABLE IF NOT EXISTS template_categories (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS templates (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  name text NOT NULL,
  category text DEFAULT 'geral' NOT NULL,
  content text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tenants (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  plan text DEFAULT 'trial' NOT NULL,
  feat_meta_api boolean DEFAULT false NOT NULL,
  feat_evolution_api boolean DEFAULT false NOT NULL,
  feat_hybrid boolean DEFAULT false NOT NULL,
  feat_google_cal boolean DEFAULT true NOT NULL,
  feat_broadcast boolean DEFAULT true NOT NULL,
  max_leads integer DEFAULT 1000 NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  ai_enabled boolean DEFAULT true NOT NULL,
  feat_kanban boolean DEFAULT true NOT NULL,
  feat_agenda boolean DEFAULT true NOT NULL,
  feat_contacts boolean DEFAULT true NOT NULL,
  feat_ia_config boolean DEFAULT true NOT NULL,
  feat_operators boolean DEFAULT true NOT NULL,
  feat_custom_apis boolean DEFAULT false NOT NULL,
  op_settings jsonb NOT NULL,
  payment_status text DEFAULT 'unpaid',
  trial_ends_at timestamptz,
  onboarding_completed boolean DEFAULT true,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS ticket_logs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  user_id uuid,
  user_name text,
  action text NOT NULL,
  to_user_id uuid,
  to_user_name text,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS usage_events (
  id bigint NOT NULL,
  tenant_id uuid,
  user_id uuid,
  event_type text NOT NULL,
  meta jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS users (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid,
  email text NOT NULL,
  password_hash text NOT NULL,
  name text,
  role text DEFAULT 'agent' NOT NULL,
  active boolean DEFAULT true NOT NULL,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  phone text,
  is_restricted boolean DEFAULT false NOT NULL,
  permissions jsonb,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS whatsapp_group_access (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  tenant_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (id)
);

-- ─── Foreign keys ───

ALTER TABLE ai_configs ADD CONSTRAINT fk_ai_configs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE appointments ADD CONSTRAINT fk_appointments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE appointments ADD CONSTRAINT fk_appointments_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE appointments ADD CONSTRAINT fk_appointments_assignee_id FOREIGN KEY (assignee_id) REFERENCES users(id);
ALTER TABLE broadcast_campaigns ADD CONSTRAINT fk_broadcast_campaigns_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE broadcast_campaigns ADD CONSTRAINT fk_broadcast_campaigns_template_id FOREIGN KEY (template_id) REFERENCES templates(id);
ALTER TABLE broadcast_contacts ADD CONSTRAINT fk_broadcast_contacts_campaign_id FOREIGN KEY (campaign_id) REFERENCES broadcast_campaigns(id);
ALTER TABLE broadcast_contacts ADD CONSTRAINT fk_broadcast_contacts_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE business_hours ADD CONSTRAINT fk_business_hours_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE channels ADD CONSTRAINT fk_channels_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE channels ADD CONSTRAINT fk_channels_assigned_user_id FOREIGN KEY (assigned_user_id) REFERENCES users(id);
ALTER TABLE channels ADD CONSTRAINT fk_channels_assigned_queue_id FOREIGN KEY (assigned_queue_id) REFERENCES queues(id);
ALTER TABLE checkout_orders ADD CONSTRAINT fk_checkout_orders_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE checkout_orders ADD CONSTRAINT fk_checkout_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE custom_apis ADD CONSTRAINT fk_custom_apis_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE flow_sessions ADD CONSTRAINT fk_flow_sessions_flow_id FOREIGN KEY (flow_id) REFERENCES flows(id);
ALTER TABLE flow_sessions ADD CONSTRAINT fk_flow_sessions_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE flows ADD CONSTRAINT fk_flows_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE flows ADD CONSTRAINT fk_flows_channel_id FOREIGN KEY (channel_id) REFERENCES channels(id);
ALTER TABLE followup_enrollment_messages ADD CONSTRAINT fk_followup_enrollment_messages_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE followup_enrollment_messages ADD CONSTRAINT fk_followup_enrollment_messages_enrollment_id FOREIGN KEY (enrollment_id) REFERENCES followup_enrollments(id);
ALTER TABLE followup_enrollment_messages ADD CONSTRAINT fk_followup_enrollment_messages_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE followup_enrollment_messages ADD CONSTRAINT fk_followup_enrollment_messages_step_id FOREIGN KEY (step_id) REFERENCES followup_steps(id);
ALTER TABLE followup_enrollments ADD CONSTRAINT fk_followup_enrollments_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE followup_enrollments ADD CONSTRAINT fk_followup_enrollments_sequence_id FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id);
ALTER TABLE followup_enrollments ADD CONSTRAINT fk_followup_enrollments_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE followup_enrollments ADD CONSTRAINT fk_followup_enrollments_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE followup_sequences ADD CONSTRAINT fk_followup_sequences_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE followup_sequences ADD CONSTRAINT fk_followup_sequences_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE followup_steps ADD CONSTRAINT fk_followup_steps_sequence_id FOREIGN KEY (sequence_id) REFERENCES followup_sequences(id);
ALTER TABLE followup_steps ADD CONSTRAINT fk_followup_steps_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE integrations ADD CONSTRAINT fk_integrations_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE internal_group_members ADD CONSTRAINT fk_internal_group_members_group_id FOREIGN KEY (group_id) REFERENCES internal_groups(id);
ALTER TABLE internal_group_members ADD CONSTRAINT fk_internal_group_members_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE internal_groups ADD CONSTRAINT fk_internal_groups_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE internal_groups ADD CONSTRAINT fk_internal_groups_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE internal_messages ADD CONSTRAINT fk_internal_messages_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE internal_messages ADD CONSTRAINT fk_internal_messages_group_id FOREIGN KEY (group_id) REFERENCES internal_groups(id);
ALTER TABLE internal_messages ADD CONSTRAINT fk_internal_messages_sender_id FOREIGN KEY (sender_id) REFERENCES users(id);
ALTER TABLE internal_messages ADD CONSTRAINT fk_internal_messages_forwarded_from_id FOREIGN KEY (forwarded_from_id) REFERENCES internal_messages(id);
ALTER TABLE labels ADD CONSTRAINT fk_labels_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE lead_stage_history ADD CONSTRAINT fk_lead_stage_history_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE lead_stage_history ADD CONSTRAINT fk_lead_stage_history_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE lead_stage_history ADD CONSTRAINT fk_lead_stage_history_changed_by FOREIGN KEY (changed_by) REFERENCES users(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_queue_id FOREIGN KEY (queue_id) REFERENCES queues(id);
ALTER TABLE leads ADD CONSTRAINT fk_leads_channel_id FOREIGN KEY (channel_id) REFERENCES channels(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_reply_to_id FOREIGN KEY (reply_to_id) REFERENCES messages(id);
ALTER TABLE messages ADD CONSTRAINT fk_messages_forwarded_from_id FOREIGN KEY (forwarded_from_id) REFERENCES messages(id);
ALTER TABLE queue_operators ADD CONSTRAINT fk_queue_operators_queue_id FOREIGN KEY (queue_id) REFERENCES queues(id);
ALTER TABLE queue_operators ADD CONSTRAINT fk_queue_operators_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE queues ADD CONSTRAINT fk_queues_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_messages_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_messages_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_messages_created_by FOREIGN KEY (created_by) REFERENCES users(id);
ALTER TABLE template_categories ADD CONSTRAINT fk_template_categories_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE templates ADD CONSTRAINT fk_templates_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE ticket_logs ADD CONSTRAINT fk_ticket_logs_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE ticket_logs ADD CONSTRAINT fk_ticket_logs_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE ticket_logs ADD CONSTRAINT fk_ticket_logs_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE ticket_logs ADD CONSTRAINT fk_ticket_logs_to_user_id FOREIGN KEY (to_user_id) REFERENCES users(id);
ALTER TABLE usage_events ADD CONSTRAINT fk_usage_events_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE usage_events ADD CONSTRAINT fk_usage_events_user_id FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE users ADD CONSTRAINT fk_users_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE whatsapp_group_access ADD CONSTRAINT fk_whatsapp_group_access_tenant_id FOREIGN KEY (tenant_id) REFERENCES tenants(id);
ALTER TABLE whatsapp_group_access ADD CONSTRAINT fk_whatsapp_group_access_lead_id FOREIGN KEY (lead_id) REFERENCES leads(id);
ALTER TABLE whatsapp_group_access ADD CONSTRAINT fk_whatsapp_group_access_user_id FOREIGN KEY (user_id) REFERENCES users(id);
