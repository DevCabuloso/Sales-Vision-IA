# SDR IA Enterprise — Plataforma (Supabase + supabase-js + Realtime)

Plataforma multi-tenant de SDR com IA: qualifica leads, conversa no WhatsApp (Meta API + Evolution) e agenda reuniões reais no Google Calendar. Painel do cliente + painel do dono, com **atualização ao vivo (Realtime)**.

**Stack:** Vue 3 + Vuetify 3 (front) · Node/Express (back) · **Supabase** (`@supabase/supabase-js`) · OpenAI · Docker.

## Arquitetura de dados

- O **backend** acessa o Supabase com a **service_role key** (acesso total, ignora RLS) via `@supabase/supabase-js`. Toda escrita passa por aqui.
- O **frontend** usa a **anon key** só para **Realtime** (escutar mudanças). Ele nunca escreve direto no banco — continua chamando a API do backend.
- As duas queries analíticas do painel do dono (lista de clientes e overview) são **funções RPC** no Postgres (`backend/src/db/functions.sql`).

## 1. Configurar o Supabase

1. Crie um projeto em https://supabase.com.
2. **SQL Editor → New query:** cole TODO o `backend/src/db/schema.sql` e rode. (Cria tabelas + habilita Realtime.)
3. **SQL Editor → New query:** cole TODO o `backend/src/db/functions.sql` e rode. (Cria as funções do painel do dono.)
4. Pegue as chaves em **Project Settings → API**:
   - **Project URL** → vai em `SUPABASE_URL` e `VITE_SUPABASE_URL`
   - **anon public** → vai em `VITE_SUPABASE_ANON_KEY`
   - **service_role** (secret) → vai em `SUPABASE_SERVICE_KEY` (⚠️ só no backend, nunca no front)

## 2. Preencher o .env

Abra o `.env` na raiz e preencha: as 4 variáveis do Supabase acima, `OPENAI_API_KEY` e as credenciais do Google. `JWT_SECRET` e `ENCRYPTION_KEY` já vêm gerados.

## 3. Subir com Docker

```bash
docker compose up --build
```
- Front: http://localhost:8080
- API: http://localhost:3000

> As `VITE_*` entram no bundle em tempo de build — por isso são passadas como build args no `docker-compose.yml`. Se mudar a anon key, rode `docker compose up --build` de novo.

## 4. Criar seu usuário dono (owner)

```bash
docker compose exec backend node scripts/owner-sql.js "voce@email.com" "suaSenha"
```
Copie o `INSERT` impresso, cole no SQL Editor do Supabase e rode. Faça login em http://localhost:8080.

---

## Rodar sem Docker (dev)

**Backend:**
```bash
cd backend && npm install
cp .env.example .env   # preencha SUPABASE_URL, SUPABASE_SERVICE_KEY, etc.
npm run dev
```

**Frontend:**
```bash
cd frontend && npm install
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run dev
```

## Realtime — onde está ligado

As telas **Leads**, **Agenda**, **Dashboard** (cliente) e **Visão Geral** (dono) recarregam sozinhas quando os dados mudam — ex: a IA cria um lead via WhatsApp e ele aparece na hora, sem refresh. Implementado em `frontend/src/composables/useRealtime.js`, escutando as tabelas `leads`, `appointments` e `usage_events`.

Se as `VITE_SUPABASE_*` não estiverem preenchidas, o Realtime simplesmente fica desativado (o app funciona normal, só sem o "ao vivo").

## IA, WhatsApp, integrações e feature flags

(iguais à versão anterior — IA com function-calling responde e agenda; WhatsApp roteia por flag; credenciais por cliente criptografadas com AES-256-GCM; webhooks em `/webhooks/meta` e `/webhooks/evolution/<TENANT_ID>`.)

## Notas sobre o supabase-js

- O backend usa a **service_role**, que ignora RLS. Se você quiser ativar RLS nas tabelas para uma camada extra de segurança, lembre que o backend continuará funcionando (service_role bypassa), mas o Realtime do front (anon) vai precisar de policies de SELECT. Por padrão deixei sem RLS para simplicidade.
- As funções RPC usam `SECURITY DEFINER` para rodar com privilégios do dono — só são chamadas pelo backend, em rotas já protegidas por `requireOwner`.
