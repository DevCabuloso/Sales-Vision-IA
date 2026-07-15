# SDR IA Enterprise — Plataforma multi-tenant de SDR com IA

Plataforma SaaS multi-tenant que qualifica leads automaticamente por IA, conversa pelo WhatsApp (Meta Cloud API e Evolution API) e agenda reuniões reais no Google Calendar. Inclui painel do cliente (operação diária) e painel do dono (gestão de todos os tenants, billing, suporte), com atualização ao vivo via Supabase Realtime.

**Stack:** Vue 3 + Vuetify 3 + Pinia (frontend) · Node/Express (backend) · PostgreSQL via Supabase, com **RLS real** (Row-Level Security por tenant, cliente `pg` dedicado) · OpenAI (function-calling) · Zod (validação) · PM2 em produção (Hetzner).

## O que a plataforma faz

- **Qualificação de leads por IA** — a IA conversa no WhatsApp, qualifica o lead via function-calling e agenda reunião direto no Google Calendar do cliente.
- **WhatsApp** — dois canais: Meta Cloud API oficial e Evolution API (self-hosted), roteados por feature flag; credenciais por tenant criptografadas com AES-256-GCM.
- **Pipeline / CRM Kanban** — funil de vendas visual por estágio, com integração via webhook e importação de estágios de CRMs externos ([backend/src/services/pipelineCrm.js](backend/src/services/pipelineCrm.js), [backend/src/routes/pipelineStages.js](backend/src/routes/pipelineStages.js)).
- **Disparo em massa (broadcast)** com status de entrega real, agenda/horário de acompanhamento (follow-up) geral ou por mensagem.
- **Integrações** — webhooks de entrada/saída e APIs customizadas por tenant ([backend/src/routes/integrations.js](backend/src/routes/integrations.js), [backend/src/routes/webhooks.js](backend/src/routes/webhooks.js), [backend/src/routes/custom-apis.js](backend/src/routes/custom-apis.js)).
- **Painel do dono (admin)** — lista/detalhe de clientes, monitoramento, suporte, configurações globais, lembrete de vencimento de mensalidade (sino + destinatário configurável).
- **Onboarding self-service** — landing de teste grátis com pagamento real via PIX (InfinitePay, R$1 de validação) e fluxo de criação de tenant.
- **Multi-tenant com isolamento real** — todas as rotas tenant-scoped passam por `withTenant`, que roda as queries sob o papel `app_rls` (sem `BYPASSRLS`) no Postgres — isolamento garantido no banco, não só na aplicação.
- **Realtime** — Leads, Agenda, Dashboard (cliente) e Visão Geral (dono) atualizam sozinhos quando os dados mudam (ex: a IA cria um lead via WhatsApp e ele aparece na hora, sem refresh).

## Arquitetura de dados

- O **backend** acessa o Postgres via `pg`, usando o papel `app_rls` (RLS real habilitado) para rotas tenant-scoped — ver `backend/src/db/withTenant.js`. Toda escrita passa por aqui.
- O **frontend** usa a `anon key` do Supabase só para **Realtime** (escutar mudanças). Nunca escreve direto no banco — sempre chama a API do backend.
- Consultas analíticas do painel do dono (lista de clientes, overview) são **funções RPC** no Postgres (`backend/src/db/functions.sql`), `SECURITY DEFINER`, chamadas só pelo backend em rotas protegidas por `requireOwner`.

## Rodar em desenvolvimento

**Tudo de uma vez (raiz do monorepo):**
```bash
npm run dev
```
Sobe backend (nodemon, porta 5000/3000 conforme `.env`) e frontend (Vite) juntos.

**Ou separado:**
```bash
cd backend && npm install && cp .env.example .env && npm run dev
cd frontend && npm install && cp .env.example .env && npm run dev
```

Preencha no `.env` do backend: credenciais do Supabase/Postgres (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATABASE_URL`), `OPENAI_API_KEY`, credenciais do Google Calendar, `JWT_SECRET`, `ENCRYPTION_KEY`, credenciais do Meta/Evolution. No `.env` do frontend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_BASE`.

Também é possível subir via `docker compose up --build` para um ambiente containerizado local (front em `:8080`, API em `:3000`) — não é o método usado em produção.

## Criar seu usuário dono (owner)

```bash
cd backend && npm run create-owner
```

## Testes

- Backend: `npm run test --prefix backend` (Vitest)
- Frontend: `npm run test --prefix frontend` (Vitest + @vue/test-utils)
- Ambos: `npm run test:all` (raiz)
- E2E: `npm run test:e2e` (Playwright, sobe o frontend automaticamente)

## Produção

Deploy via `deploy.ps1`: empacota backend/frontend (sem `node_modules`/`.env`), envia por `scp` para o servidor (Hetzner) e reinicia o backend via **PM2** (`ecosystem.config.cjs`, modo `fork`, instância única — os caches em memória do orquestrador não são compartilhados entre instâncias, então não escale horizontalmente sem migrar isso para um store externo primeiro). O frontend é rebuildado (`vite build`) direto no servidor.

## Segurança

- RLS real no Postgres por tenant (papel `app_rls`, sem bypass) para todas as rotas tenant-scoped.
- Credenciais de canal (WhatsApp etc.) por tenant, criptografadas com AES-256-GCM.
- Validação de entrada com Zod em todas as rotas; sanitização de HTML com DOMPurify no frontend.
- Webhooks (Meta/Evolution) validados por HMAC/verify token, fail-closed em produção.
