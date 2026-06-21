-- ════════════════════════════════════════════════════════════════
-- SDR IA Enterprise — DADOS DEMO (seed)
-- Cole no Supabase SQL Editor DEPOIS de rodar o schema_completo.sql
-- ════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────
-- LIMPA (ordem respeita FKs)
-- ────────────────────────────────────────────────────────────────
TRUNCATE broadcast_contacts, broadcast_campaigns, custom_apis,
         lead_stage_history, templates, ai_configs, usage_events,
         appointments, messages, leads, integrations, users, tenants
CASCADE;

-- ────────────────────────────────────────────────────────────────
-- TENANTS
-- ────────────────────────────────────────────────────────────────
INSERT INTO tenants (id, name, slug, status, plan, feat_meta_api, feat_evolution_api, feat_google_cal, feat_broadcast, max_leads, notes) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Viva Imóveis',        'viva-imoveis',  'active',    'pro',        true,  false, true,  true,  5000,  'Cliente flagship — imobiliária premium SP'),
  ('11111111-0000-0000-0000-000000000002', 'Clínica OdontoCare',  'odonto-care',   'active',    'starter',    false, true,  true,  false, 1000,  NULL),
  ('11111111-0000-0000-0000-000000000003', 'FastCred Financeira', 'fastcred',      'active',    'enterprise', true,  true,  true,  true,  20000, 'Maior cliente — 4 operadores'),
  ('11111111-0000-0000-0000-000000000004', 'Escola DevUp',        'devup',         'trial',     'trial',      false, false, true,  false, 200,   'Trial iniciado há 5 dias'),
  ('11111111-0000-0000-0000-000000000005', 'MotoFácil Motos',     'motofacil',     'suspended', 'starter',    false, true,  false, false, 500,   'Inadimplente — suspensa em 10/06');

-- ────────────────────────────────────────────────────────────────
-- USERS  (senha "demo123" para todos)
-- ────────────────────────────────────────────────────────────────
INSERT INTO users (id, tenant_id, email, password_hash, name, role, active) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL,
   'owner@sdr.ai',
   '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Carlos Admin', 'owner', true);

-- Viva Imóveis
INSERT INTO users (id, tenant_id, email, password_hash, name, role, active, last_login_at) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'ana@vivaimoveis.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Ana Beatriz Souza', 'admin', true, now() - interval '2 hours'),
  ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'pedro@vivaimoveis.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Pedro Henrique Lima', 'agent', true, now() - interval '1 day');

-- OdontoCare
INSERT INTO users (id, tenant_id, email, password_hash, name, role, active, last_login_at) VALUES
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
   'dra.julia@odonto.care', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Dra. Júlia Ferreira', 'admin', true, now() - interval '30 minutes');

-- FastCred
INSERT INTO users (id, tenant_id, email, password_hash, name, role, active, last_login_at) VALUES
  ('cccccccc-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'rodrigo@fastcred.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Rodrigo Alves', 'admin', true, now() - interval '10 minutes'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'mariana@fastcred.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Mariana Costa', 'agent', true, now() - interval '3 hours'),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003',
   'thiago@fastcred.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Thiago Nascimento', 'agent', true, now() - interval '5 hours');

-- DevUp
INSERT INTO users (id, tenant_id, email, password_hash, name, role, active) VALUES
  ('dddddddd-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000004',
   'lucas@devup.com.br', '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uMe2P1LL2',
   'Lucas Martins', 'admin', true);

-- ────────────────────────────────────────────────────────────────
-- INTEGRATIONS
-- ────────────────────────────────────────────────────────────────
INSERT INTO integrations (tenant_id, provider, status, meta, connected_at) VALUES
  ('11111111-0000-0000-0000-000000000001', 'google_calendar', 'connected',
   '{"email":"ana@vivaimoveis.com.br","setup":{"client_id":"123456789-abc.apps.googleusercontent.com"}}',
   now() - interval '10 days'),
  ('11111111-0000-0000-0000-000000000001', 'meta_whatsapp', 'connected',
   '{"phoneNumberId":"120364573890123","wabaId":"120364573890124","displayPhone":"+55 11 94000-1234"}',
   now() - interval '8 days'),
  ('11111111-0000-0000-0000-000000000002', 'evolution', 'connected',
   '{"baseUrl":"https://evo.odonto.care","instance":"odonto-main"}',
   now() - interval '15 days'),
  ('11111111-0000-0000-0000-000000000002', 'google_calendar', 'connected',
   '{"email":"dra.julia@gmail.com"}',
   now() - interval '14 days'),
  ('11111111-0000-0000-0000-000000000003', 'meta_whatsapp', 'connected',
   '{"phoneNumberId":"120364999000001","wabaId":"120364999000002","displayPhone":"+55 11 95000-9999"}',
   now() - interval '30 days'),
  ('11111111-0000-0000-0000-000000000003', 'google_calendar', 'connected',
   '{"email":"agenda@fastcred.com.br"}',
   now() - interval '30 days');

-- ────────────────────────────────────────────────────────────────
-- AI CONFIGS
-- ────────────────────────────────────────────────────────────────
INSERT INTO ai_configs (tenant_id, name, model, system_prompt, main_prompt, temperature, max_tokens) VALUES
  ('11111111-0000-0000-0000-000000000001', 'SDR Imóveis Premium', 'gpt-4o',
   'Você é a Ana, assistente virtual da Viva Imóveis. Seu objetivo é qualificar leads interessados em comprar ou alugar imóveis em São Paulo. Seja cordial, profissional e sempre pergunte o bairro de interesse, faixa de preço e tipo de imóvel. Quando o lead estiver qualificado, ofereça agendar uma visita com um corretor.',
   'Analise o histórico de conversa e responda de forma natural, avançando na qualificação do lead. Foco em descobrir: bairro desejado, valor disponível, tipo (apto/casa/comercial) e prazo de decisão.',
   0.70, 1200),
  ('11111111-0000-0000-0000-000000000002', 'SDR Clínica', 'gpt-4o-mini',
   'Você é a Lara, recepcionista virtual da Clínica OdontoCare. Ajude pacientes a agendar consultas, esclareça dúvidas sobre tratamentos e planos aceitos. Seja acolhedora e empática.',
   'Responda ao paciente de forma acolhedora. Identifique o tipo de consulta desejado e ofereça horários disponíveis.',
   0.60, 800),
  ('11111111-0000-0000-0000-000000000003', 'SDR Crédito', 'gpt-4o',
   'Você é o Max, consultor virtual da FastCred. Ajude clientes a entender as modalidades de crédito: pessoal, consignado, refinanciamento e MEI. Qualifique perguntando valor, finalidade e restrições no CPF. Seja direto e objetivo.',
   'Avance a conversa para identificar perfil de crédito e qualificar o lead. Se qualificado, agende uma ligação com um consultor.',
   0.50, 1000);

-- ────────────────────────────────────────────────────────────────
-- TEMPLATES
-- ────────────────────────────────────────────────────────────────
INSERT INTO templates (tenant_id, name, category, content) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Boas-vindas Imóveis', 'abordagem',
   'Olá, {{nome}}! 👋 Sou a Ana, da Viva Imóveis. Vi que você demonstrou interesse em imóveis na nossa plataforma. Posso te ajudar a encontrar o imóvel perfeito! Qual região de São Paulo você está buscando?'),
  ('11111111-0000-0000-0000-000000000001', 'Seguimento 24h', 'followup',
   'Oi, {{nome}}! Tudo bem? Passando para saber se você conseguiu pensar melhor sobre o imóvel que conversamos. Temos novas opções em {{bairro}} que podem te interessar. Posso te mandar os detalhes?'),
  ('11111111-0000-0000-0000-000000000001', 'Confirmação de visita', 'agendamento',
   '✅ Visita confirmada, {{nome}}! Você tem agendado para {{data}} às {{hora}} no imóvel em {{endereco}}. Nosso corretor {{corretor}} estará esperando por você. Qualquer dúvida, é só chamar aqui!'),
  ('11111111-0000-0000-0000-000000000001', 'Proposta enviada', 'negociacao',
   'Olá, {{nome}}! A proposta referente ao imóvel em {{endereco}} foi enviada ao proprietário. Em até 48h úteis você terá uma resposta. Enquanto isso, posso te mostrar outras opções similares?'),
  ('11111111-0000-0000-0000-000000000002', 'Boas-vindas Clínica', 'abordagem',
   'Olá, {{nome}}! 😊 Aqui é a Lara, da OdontoCare. Fico feliz em te atender! Qual tipo de consulta você está precisando? (Limpeza, avaliação, clareamento, implante...)'),
  ('11111111-0000-0000-0000-000000000002', 'Lembrete consulta', 'agendamento',
   '⏰ Lembrete, {{nome}}! Sua consulta na OdontoCare está marcada para amanhã, {{data}} às {{hora}}. Confirme presença respondendo SIM ou entre em contato para reagendar. Te esperamos! 🦷'),
  ('11111111-0000-0000-0000-000000000003', 'Boas-vindas Crédito', 'abordagem',
   'Olá, {{nome}}! 💰 Aqui é o Max, da FastCred. Vi que você tem interesse em crédito. Posso te apresentar as melhores condições do mercado! Qual o valor que você precisa e qual a finalidade?'),
  ('11111111-0000-0000-0000-000000000003', 'Proposta de crédito', 'negociacao',
   '🎉 Boa notícia, {{nome}}! Sua análise foi aprovada. Valor: R$ {{valor}} | Taxa: {{taxa}}% a.m. | Parcelas: {{parcelas}}x de R$ {{parcela}}. Quer prosseguir?'),
  ('11111111-0000-0000-0000-000000000003', 'Documentação pendente', 'followup',
   'Oi, {{nome}}! Para finalizar sua proposta de crédito, ainda precisamos de: {{documentos}}. Você consegue enviar ainda hoje? Quanto antes, mais rápida a liberação! 📄');

-- ────────────────────────────────────────────────────────────────
-- LEADS — Viva Imóveis
-- UUIDs: e1 a e8 (hex válido: e = 14)
-- ────────────────────────────────────────────────────────────────
INSERT INTO leads (id, tenant_id, name, phone, stage, score, intention, interests, human_takeover, created_at) VALUES
  ('e1000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'Fernanda Oliveira', '5511987654001', 'Reunião Agendada', 92,
   'Compra', '["Apartamento", "Pinheiros", "2 quartos"]', false, now() - interval '3 days'),
  ('e1000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000001',
   'Ricardo Mendes', '5511987654002', 'Em Qualificação', 58,
   'Aluguel', '["Casa", "Moema", "com garagem"]', false, now() - interval '1 day'),
  ('e1000001-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000001',
   'Camila Rocha', '5511987654003', 'Qualificado', 75,
   'Compra', '["Cobertura", "Jardins", "alto padrão"]', false, now() - interval '5 days'),
  ('e1000001-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'Bruno Cavalcanti', '5511987654004', 'Novo Lead', 15,
   NULL, '[]', false, now() - interval '2 hours'),
  ('e1000001-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000001',
   'Isabela Teixeira', '5511987654005', 'Perdido', 30,
   'Compra', '["Apartamento", "Vila Madalena"]', false, now() - interval '10 days'),
  ('e1000001-0000-0000-0000-000000000006', '11111111-0000-0000-0000-000000000001',
   'Marcelo Santos', '5511987654006', 'Em Qualificação', 45,
   'Compra', '["Studio", "Centro", "para investimento"]', true, now() - interval '6 hours'),
  ('e1000001-0000-0000-0000-000000000007', '11111111-0000-0000-0000-000000000001',
   'Larissa Gomes', '5511987654007', 'Novo Lead', 10,
   NULL, '[]', false, now() - interval '30 minutes'),
  ('e1000001-0000-0000-0000-000000000008', '11111111-0000-0000-0000-000000000001',
   'Felipe Duarte', '5511987654008', 'Qualificado', 80,
   'Aluguel', '["Flat", "Itaim Bibi", "mobiliado"]', false, now() - interval '4 days');

-- ────────────────────────────────────────────────────────────────
-- LEADS — FastCred
-- ────────────────────────────────────────────────────────────────
INSERT INTO leads (id, tenant_id, name, phone, stage, score, intention, interests, human_takeover, created_at) VALUES
  ('e3000003-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'João Paulo Ferreira', '5511976543001', 'Reunião Agendada', 88,
   'Crédito Pessoal', '["R$ 15.000", "reforma"]', false, now() - interval '2 days'),
  ('e3000003-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'Patrícia Almeida', '5511976543002', 'Em Qualificação', 62,
   'Consignado', '["R$ 8.000", "aposentada INSS"]', false, now() - interval '1 day'),
  ('e3000003-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003',
   'Sérgio Nunes', '5511976543003', 'Novo Lead', 5,
   NULL, '[]', false, now() - interval '15 minutes'),
  ('e3000003-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000003',
   'Vanessa Ribeiro', '5511976543004', 'Qualificado', 71,
   'MEI', '["R$ 30.000", "capital de giro"]', false, now() - interval '3 days'),
  ('e3000003-0000-0000-0000-000000000005', '11111111-0000-0000-0000-000000000003',
   'Anderson Lima', '5511976543005', 'Em Qualificação', 40,
   'Refinanciamento', '["quitação de dívidas"]', true, now() - interval '8 hours');

-- ────────────────────────────────────────────────────────────────
-- LEAD STAGE HISTORY
-- ────────────────────────────────────────────────────────────────
INSERT INTO lead_stage_history (tenant_id, lead_id, from_stage, to_stage, changed_by, changed_at) VALUES
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   NULL, 'Novo Lead', NULL, now() - interval '3 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'Novo Lead', 'Em Qualificação', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '3 days' + interval '2 hours'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'Em Qualificação', 'Qualificado', 'aaaaaaaa-0000-0000-0000-000000000002', now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'Qualificado', 'Reunião Agendada', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000003',
   NULL, 'Novo Lead', NULL, now() - interval '5 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000003',
   'Novo Lead', 'Em Qualificação', NULL, now() - interval '4 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000003',
   'Em Qualificação', 'Qualificado', 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '2 days');

-- ────────────────────────────────────────────────────────────────
-- MESSAGES — Fernanda (conversa completa com IA)
-- ────────────────────────────────────────────────────────────────
INSERT INTO messages (tenant_id, lead_id, role, text, provider, is_human_takeover, created_at) VALUES
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'lead', 'Oi, vi o anúncio de vocês e gostaria de saber mais sobre apartamentos em Pinheiros', 'meta_whatsapp', false, now() - interval '3 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'ai', 'Olá, Fernanda! Fico feliz em te atender 😊 Pinheiros é uma ótima escolha! Você prefere apartamento para compra ou aluguel? E tem preferência de número de quartos?', 'meta_whatsapp', false, now() - interval '3 days' + interval '5 seconds'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'lead', 'Compra! Quero 2 quartos, tenho até uns 800 mil pra investir', 'meta_whatsapp', false, now() - interval '3 days' + interval '3 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'ai', 'Perfeito! Com R$ 800 mil em Pinheiros você tem ótimas opções. Tenho apartamentos de 2 quartos (65-85m²) na faixa de 700 a 800 mil, alguns com vaga e sacada. Tem preferência por alguma rua?', 'meta_whatsapp', false, now() - interval '3 days' + interval '4 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'lead', 'Prefiro perto do metrô Fradique Coutinho', 'meta_whatsapp', false, now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'ai', 'Excelente! Tenho um apartamento na Rua Teodoro Sampaio, 3 minutos a pé do metrô, 72m², 2 quartos com suíte, 1 vaga, por R$ 785.000. Tem interesse em agendar uma visita?', 'meta_whatsapp', false, now() - interval '2 days' + interval '10 seconds'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'lead', 'Sim! Tenho disponibilidade amanhã ou sexta-feira', 'meta_whatsapp', false, now() - interval '1 day' + interval '2 hours'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000001',
   'ai', '✅ Visita agendada para amanhã às 15h na Rua Teodoro Sampaio, 234, apto 82. Nosso corretor Pedro estará esperando. Você receberá um lembrete 1h antes!', 'meta_whatsapp', false, now() - interval '1 day' + interval '2 minutes'),

-- Marcelo — takeover humano ativo
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'lead', 'Bom dia! Tenho interesse em studios para investimento no centro', 'meta_whatsapp', false, now() - interval '6 hours'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'ai', 'Bom dia, Marcelo! Studios para investimento no Centro são uma excelente estratégia. Qual faixa de valor você está considerando?', 'meta_whatsapp', false, now() - interval '5 hours' + interval '58 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'lead', 'Tenho 5 studios e quero mais 3. Budget de 1.2mi. Mas quero falar com alguém sênior', 'meta_whatsapp', false, now() - interval '5 hours'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'ai', 'Entendido, Marcelo! Com esse perfil vou te conectar diretamente com nossa diretora de investimentos. Um momento!', 'meta_whatsapp', false, now() - interval '4 hours' + interval '59 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'agent', '🔄 Atendimento transferido para humano', 'meta_whatsapp', false, now() - interval '4 hours' + interval '55 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'e1000001-0000-0000-0000-000000000006',
   'agent', 'Olá Marcelo! Aqui é a Ana, diretora de investimentos. Que portfólio impressionante! Vou te apresentar 3 opções incríveis em regiões com alta valorização. Posso te ligar em 10 minutos?', 'meta_whatsapp', true, now() - interval '4 hours' + interval '50 minutes'),

-- FastCred — João Paulo
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'lead', 'Olá, preciso de um crédito de 15 mil para reforma da minha casa', 'meta_whatsapp', false, now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'ai', 'Oi João Paulo! Posso te ajudar com isso 💰 Para crédito pessoal de R$ 15.000, você é CLT, autônomo ou MEI? E tem alguma restrição no CPF?', 'meta_whatsapp', false, now() - interval '2 days' + interval '8 seconds'),
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'lead', 'Sou CLT, trabalho numa empresa há 4 anos. CPF limpo', 'meta_whatsapp', false, now() - interval '2 days' + interval '5 minutes'),
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'ai', 'Ótimo perfil! Com CLT e CPF limpo suas chances são altas. Qual sua renda mensal aproximada?', 'meta_whatsapp', false, now() - interval '2 days' + interval '6 minutes'),
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'lead', 'Ganho 4500 por mês', 'meta_whatsapp', false, now() - interval '1 day' + interval '3 hours'),
  ('11111111-0000-0000-0000-000000000003', 'e3000003-0000-0000-0000-000000000001',
   'ai', '🎉 Pré-aprovado! Posso te oferecer R$ 15.000 em até 36x de R$ 558 (taxa 2,9% a.m.). Quer agendar uma ligação com nosso consultor para formalizar?', 'meta_whatsapp', false, now() - interval '1 day' + interval '3 minutes');

-- ────────────────────────────────────────────────────────────────
-- APPOINTMENTS
-- ────────────────────────────────────────────────────────────────
INSERT INTO appointments (id, tenant_id, lead_id, lead_name, title, provider, external_id, start_time, end_time, meeting_link, status, assignee_id, notes) VALUES
  ('a0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
   'e1000001-0000-0000-0000-000000000001', 'Fernanda Oliveira',
   'Visita — Rua Teodoro Sampaio 234, apto 82',
   'google', 'google_event_abc123',
   now() + interval '1 day' + interval '15 hours',
   now() + interval '1 day' + interval '16 hours',
   'https://meet.google.com/abc-defg-hij',
   'scheduled', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Cliente quer apartamento com vaga. Levar proposta de financiamento.'),

  ('a0000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'e3000003-0000-0000-0000-000000000001', 'João Paulo Ferreira',
   'Ligação — Análise crédito pessoal R$ 15.000',
   'google', 'google_event_def456',
   now() + interval '4 hours',
   now() + interval '4 hours' + interval '30 minutes',
   'https://meet.google.com/xyz-uvwx-yz1',
   'confirmed', 'cccccccc-0000-0000-0000-000000000002',
   'CLT, 4 anos de empresa, renda R$ 4.500. Pré-aprovado 36x R$ 558.'),

  ('a0000001-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000002',
   NULL, 'Maria Helena Souza',
   'Consulta — Avaliação implante dentário',
   'google', 'google_event_ghi789',
   now() - interval '1 day' + interval '10 hours',
   now() - interval '1 day' + interval '11 hours',
   NULL,
   'completed', 'bbbbbbbb-0000-0000-0000-000000000001',
   'Paciente tem 3 dentes para implante. Orçamento enviado R$ 4.200.'),

  ('a0000001-0000-0000-0000-000000000004', '11111111-0000-0000-0000-000000000001',
   'e1000001-0000-0000-0000-000000000005', 'Isabela Teixeira',
   'Visita — Aptos Vila Madalena (cancelado)',
   'google', NULL,
   now() - interval '3 days' + interval '14 hours',
   now() - interval '3 days' + interval '15 hours',
   NULL,
   'cancelled', 'aaaaaaaa-0000-0000-0000-000000000002',
   'Lead desistiu — viajou para o exterior.');

-- ────────────────────────────────────────────────────────────────
-- BROADCAST CAMPAIGNS
-- ────────────────────────────────────────────────────────────────
INSERT INTO broadcast_campaigns (id, tenant_id, name, status, content, sent_count, delivered_count, read_count, replied_count, created_at, updated_at) VALUES
  ('c0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'Feirão de Crédito — Junho 2026', 'completed',
   '💰 Olá, {{nome}}! A FastCred está com taxas especiais de crédito pessoal neste mês: a partir de 1,99% a.m. Aprovação em até 24h! Quer saber mais? Responda SIM.',
   847, 821, 634, 127, now() - interval '7 days', now() - interval '5 days'),

  ('c0000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'Reengajamento — Leads inativos', 'sending',
   '👋 Oi, {{nome}}! Faz um tempo que não conversamos. A FastCred tem novas condições de crédito que podem ser perfeitas para você. Taxa especial de volta!',
   312, 298, 201, 43, now() - interval '1 day', now() - interval '2 hours'),

  ('c0000001-0000-0000-0000-000000000003', '11111111-0000-0000-0000-000000000003',
   'Crédito MEI — Julho 2026', 'draft',
   '🚀 MEI, chegou a hora de expandir! FastCred oferece crédito de até R$ 50.000 com taxas a partir de 2,5% a.m. em até 48x. Sem burocracia!',
   0, 0, 0, 0, now() - interval '2 hours', now() - interval '2 hours');

-- ────────────────────────────────────────────────────────────────
-- BROADCAST CONTACTS
-- ────────────────────────────────────────────────────────────────
INSERT INTO broadcast_contacts (campaign_id, tenant_id, name, phone, status, sent_at) VALUES
  ('c0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'Roberto Fonseca', '5511900000001', 'replied', now() - interval '6 days'),
  ('c0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'Simone Prado', '5511900000002', 'read', now() - interval '6 days'),
  ('c0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'Gustavo Henrique', '5511900000003', 'delivered', now() - interval '6 days'),
  ('c0000001-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000003',
   'Renata Carvalho', '5511900000004', 'failed', now() - interval '6 days'),
  ('c0000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'Diego Meireles', '5511900000010', 'sent', now() - interval '3 hours'),
  ('c0000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'Aline Freitas', '5511900000011', 'sent', now() - interval '3 hours'),
  ('c0000001-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000003',
   'Flávio Barbosa', '5511900000012', 'pending', NULL);

-- ────────────────────────────────────────────────────────────────
-- CUSTOM APIS
-- ────────────────────────────────────────────────────────────────
INSERT INTO custom_apis (tenant_id, name, base_url, model, provider, active) VALUES
  ('11111111-0000-0000-0000-000000000003',
   'Claude Anthropic (backup)', 'https://api.anthropic.com/v1',
   'claude-sonnet-4-6', 'claude', true),
  ('11111111-0000-0000-0000-000000000001',
   'Gemini Flash (análise docs)', 'https://generativelanguage.googleapis.com/v1beta',
   'gemini-1.5-flash', 'gemini', false);

-- ────────────────────────────────────────────────────────────────
-- USAGE EVENTS
-- ────────────────────────────────────────────────────────────────
INSERT INTO usage_events (tenant_id, user_id, event_type, meta, created_at) VALUES
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e1000001-0000-0000-0000-000000000001"}', now() - interval '3 days'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'lead_qualified', '{"lead_id":"e1000001-0000-0000-0000-000000000001"}', now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'appointment_created', '{"appt_id":"a0000001-0000-0000-0000-000000000001"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
   'human_takeover', '{"lead_id":"e1000001-0000-0000-0000-000000000006"}', now() - interval '4 hours' + interval '55 minutes'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e1000001-0000-0000-0000-000000000002"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e1000001-0000-0000-0000-000000000003"}', now() - interval '4 days'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e1000001-0000-0000-0000-000000000003"}', now() - interval '3 days'),
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000002',
   'lead_qualified', '{"lead_id":"e1000001-0000-0000-0000-000000000003"}', now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e3000003-0000-0000-0000-000000000001"}', now() - interval '2 days'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   'message_sent', '{"lead_id":"e3000003-0000-0000-0000-000000000001"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   'lead_qualified', '{"lead_id":"e3000003-0000-0000-0000-000000000001"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   'appointment_created', '{"appt_id":"a0000001-0000-0000-0000-000000000002"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003',
   'human_takeover', '{"lead_id":"e3000003-0000-0000-0000-000000000005"}', now() - interval '8 hours'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003',
   'message_sent', '{"lead_id":"e3000003-0000-0000-0000-000000000002"}', now() - interval '1 day'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003',
   'message_sent', '{"lead_id":"e3000003-0000-0000-0000-000000000004"}', now() - interval '3 days'),
  ('11111111-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002',
   'broadcast_sent', '{"campaign_id":"c0000001-0000-0000-0000-000000000001","count":847}', now() - interval '5 days');
