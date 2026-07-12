<template>
  <div class="admin-page">
    <div class="page-header mb-6">
      <div>
        <h1 class="page-title">Documentação da Plataforma</h1>
        <p class="page-sub">Stack, infraestrutura, banco de dados, API e funcionalidades — 100% lido do código-fonte</p>
      </div>
    </div>

    <!-- Sumário -->
    <div class="toc-bar mb-6">
      <a v-for="s in sections" :key="s.id" :href="`#${s.id}`" class="toc-chip">{{ s.label }}</a>
    </div>

    <!-- ── Visão geral ─────────────────────────────────────────── -->
    <section id="visao-geral" class="doc-section">
      <h2>Visão geral</h2>
      <p class="lede">
        SDR IA Enterprise é uma plataforma SaaS multi-tenant de pré-vendas: um agente de IA qualifica leads
        conversando pelo WhatsApp (API oficial Meta ou Evolution/Baileys), agenda reuniões reais no Google
        Calendar e entrega tudo isso num painel operacional completo — Kanban, inbox, disparo em massa,
        fluxos visuais de chatbot e este painel de dono (superadmin) para gerenciar todos os clientes.
      </p>
      <div class="badge-row mb-4">
        <span v-for="b in stackBadges" :key="b" class="stack-badge">{{ b }}</span>
      </div>
      <div class="stats-row">
        <div class="stat-card" v-for="s in headlineStats" :key="s.label">
          <div class="stat-value">{{ s.value }}</div>
          <div class="stat-label">{{ s.label }}</div>
        </div>
      </div>
    </section>

    <!-- ── Stack ────────────────────────────────────────────────── -->
    <section id="stack" class="doc-section">
      <h2>Stack tecnológico</h2>
      <v-row>
        <v-col cols="12" md="6">
          <div class="ztable-wrap">
            <div class="ztable-section-header"><span class="section-label">Frontend</span></div>
            <table class="ztable">
              <tbody>
                <tr v-for="r in stackFrontend" :key="r.name">
                  <td class="mono">{{ r.name }}</td>
                  <td class="ztable-sub mono">{{ r.version }}</td>
                  <td class="ztable-sub">{{ r.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-col>
        <v-col cols="12" md="6">
          <div class="ztable-wrap">
            <div class="ztable-section-header"><span class="section-label">Backend</span></div>
            <table class="ztable">
              <tbody>
                <tr v-for="r in stackBackend" :key="r.name">
                  <td class="mono">{{ r.name }}</td>
                  <td class="ztable-sub mono">{{ r.version }}</td>
                  <td class="ztable-sub">{{ r.desc }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </v-col>
      </v-row>

      <div class="grid-3 mt-4">
        <v-card class="glass pa-4" border v-for="s in externalServices" :key="s.title">
          <div class="text-subtitle-2 font-weight-bold mb-1">{{ s.title }}</div>
          <div class="text-caption" style="color:#9FB0BC">{{ s.desc }}</div>
        </v-card>
      </div>
    </section>

    <!-- ── Infra ────────────────────────────────────────────────── -->
    <section id="infraestrutura" class="doc-section">
      <h2>Infraestrutura & deploy</h2>

      <v-alert type="info" variant="tonal" density="comfortable" class="mb-4">
        <strong>Servidor único (Hetzner) — 167.233.84.42</strong> (hostname <code>ApiPlataformaSdr</code>): 2 vCPU, 4GB RAM,
        80GB disco, €22,99/mês. Uso observado: ~1,1GB RAM de 4GB, load average ~0.05 — bastante folga para crescer.
      </v-alert>

      <h3>Processos (PM2, não Docker)</h3>
      <p class="p-muted">
        A infraestrutura migrou de Docker para <strong>processos nativos via PM2</strong> sem atualizar toda a
        documentação/scripts — <code>docker-compose.yml</code> ainda existe no repositório mas está obsoleto para produção.
      </p>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <thead><tr><th>Processo PM2</th><th>Porta</th><th>Caminho</th></tr></thead>
          <tbody>
            <tr><td class="mono">backend</td><td class="mono">5000</td><td class="mono">/opt/sdr-platform/backend/src/server.js</td></tr>
            <tr><td class="mono">evolution-api</td><td class="mono">8080</td><td class="mono">/root/evolution-api/dist/main.js</td></tr>
          </tbody>
        </table>
      </div>
      <p class="p-muted">
        PM2 startup habilitado (sobrevive a reboot). <code>nginx</code> serve o build estático do frontend na porta 80 e
        faz proxy de <code>/api</code> e <code>/webhooks</code> para <code>localhost:5000</code>. PostgreSQL 18 nativo
        (systemd, porta 5432) atende exclusivamente o schema <code>evolution_api</code> — o banco de <em>produto</em>
        (tenants, leads, mensagens) é o Supabase gerenciado, à parte.
      </p>

      <h3>Deploy</h3>
      <p class="p-muted">
        <code>deploy.ps1</code>, executado localmente no PowerShell: empacota o projeto sem <code>node_modules</code>/<code>.env</code>
        locais, envia para o servidor, roda <code>npm install</code> remotamente e reinicia com <code>pm2 restart backend</code>
        + rebuild do frontend.
      </p>

      <h3>WhatsApp — por que <code>localhost</code> no webhook</h3>
      <p class="p-muted">
        A instância Evolution roda no mesmo servidor que o backend, então o webhook é registrado como
        <code>http://localhost:5000/webhooks/evolution/{tenantId}</code> — chamar o IP externo a partir do próprio
        servidor não funciona de forma confiável.
      </p>
    </section>

    <!-- ── Segurança ────────────────────────────────────────────── -->
    <section id="seguranca" class="doc-section">
      <h2>Segurança & multi-tenancy</h2>

      <h3>Autenticação</h3>
      <p class="p-muted">
        JWT (HS256) entregue como cookie httpOnly <code>sdr_token</code> (7 dias) <em>ou</em> header
        <code>Authorization: Bearer</code> — usado nas sessões de <strong>impersonation</strong>, que sempre tem prioridade
        sobre o cookie. Senhas com <strong>bcrypt</strong> (cost 10).
      </p>

      <h3>Papéis</h3>
      <div class="role-row"><v-chip size="small" color="warning" variant="tonal">owner</v-chip><span>superadmin da plataforma, <code>tenant_id = null</code>, acesso a <code>/api/admin/*</code></span></div>
      <div class="role-row"><v-chip size="small" color="info" variant="tonal">admin</v-chip><span>administrador do tenant — acesso total às rotas do tenant, gerencia operadores</span></div>
      <div class="role-row"><v-chip size="small" color="secondary" variant="tonal">agent</v-chip><span>operador — permissões granulares por menu + flag <code>is_restricted</code></span></div>

      <v-alert type="warning" variant="tonal" density="comfortable" class="my-4">
        <strong>Isolamento entre tenants é 100% aplicado em código, não no banco.</strong> O backend usa a
        <strong>service_role key</strong> do Supabase (ignora RLS) — cada rota precisa filtrar manualmente por
        <code>.eq('tenant_id', ...)</code>. Não existe rede de segurança no nível do banco.
      </v-alert>

      <h3>Criptografia de credenciais</h3>
      <p class="p-muted">
        <strong>AES-256-GCM</strong> (<code>services/crypto.js</code>), chave de 32 bytes em <code>ENCRYPTION_KEY</code>.
        Protege: tokens OAuth do Google Calendar, access token da Meta, API key da Evolution, API keys de LLMs
        customizados e o client secret OAuth do Google quando autoconfigurado por tenant.
      </p>

      <h3>Impersonation</h3>
      <p class="p-muted">
        O <code>owner</code> gera um JWT de curta duração (1h) para qualquer admin de tenant ou usuário específico —
        aberto em nova aba via <code>/impersonate</code>, usado para suporte.
      </p>
    </section>

    <!-- ── Banco de dados ───────────────────────────────────────── -->
    <section id="banco-de-dados" class="doc-section">
      <h2>Banco de dados</h2>
      <v-alert type="warning" variant="tonal" density="comfortable" class="mb-4">
        Os arquivos <code>.sql</code> de schema foram removidos do repositório no commit "SQL REMOVIDO" (2026-07-08) —
        sobrevivem apenas no histórico do git. A referência abaixo foi reconstruída a partir de lá +
        <code>backend/src/db/functions.sql</code> (único arquivo de banco que continua versionado).
      </v-alert>

      <div class="d-flex justify-end ga-2 mb-2">
        <v-btn size="small" variant="tonal" @click="dbPanels = dbTables.map((_, i) => i)">Expandir tudo</v-btn>
        <v-btn size="small" variant="text" @click="dbPanels = []">Recolher tudo</v-btn>
      </div>

      <div class="doc-panels">
        <div v-for="(t, i) in dbTables" :key="t.name" class="doc-acc-item" :class="{ open: dbPanels.includes(i) }">
          <button class="doc-acc-head" @click="toggleDbPanel(i)">
            <span class="doc-acc-head-main">
              <span class="mono font-weight-bold mr-2">{{ t.name }}</span>
              <v-chip v-if="t.realtime" size="x-small" color="success" variant="tonal" class="mr-2">realtime</v-chip>
              <span class="text-caption" style="color:#6B7C88">{{ t.purpose }}</span>
            </span>
            <v-icon icon="mdi-chevron-down" size="18" class="doc-acc-chevron" />
          </button>
          <div class="doc-acc-body-outer">
            <div class="doc-acc-body-inner">
              <div class="doc-acc-body">
                <div class="col-row" v-for="(c, ci) in t.cols" :key="ci">
                  <span class="col-name mono">{{ c.n }}</span>
                  <span class="col-type mono">{{ c.t }}</span>
                  <span class="col-note">{{ c.d }}</span>
                </div>
                <p v-if="t.note" class="doc-footnote">{{ t.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 class="mt-6">Funções RPC</h3>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <tbody>
            <tr><td class="mono" style="white-space:nowrap">admin_clients_overview()</td><td class="ztable-sub">Lista todos os tenants com contadores agregados (usuários, leads, atendimentos, eventos 30 dias) e o array de integrações.</td></tr>
            <tr><td class="mono" style="white-space:nowrap">admin_overview()</td><td class="ztable-sub">KPIs do topo do painel: totais + quantos tenants estão com Evolution/Meta/Google Calendar <strong>realmente conectados</strong> (<code>integrations.status='connected'</code>).</td></tr>
          </tbody>
        </table>
      </div>

      <h3>Realtime</h3>
      <p class="p-muted">
        Publicação <code>supabase_realtime</code> ativa em <code>leads</code>, <code>appointments</code>,
        <code>usage_events</code> e <code>messages</code> — são as tabelas que atualizam Dashboard, Leads, Agenda,
        Kanban e Chat sozinhos, sem F5.
      </p>
    </section>

    <!-- ── API ──────────────────────────────────────────────────── -->
    <section id="api" class="doc-section">
      <h2>API — referência de rotas</h2>
      <p class="p-muted mb-3">
        23 módulos sob <code>/api/*</code> (mais <code>/webhooks/*</code>, público). Salvo indicação, toda rota exige
        sessão válida e é automaticamente restrita ao <code>tenant_id</code> do usuário logado.
      </p>

      <div class="d-flex justify-end ga-2 mb-2">
        <v-btn size="small" variant="tonal" @click="apiPanels = apiModules.map((_, i) => i)">Expandir tudo</v-btn>
        <v-btn size="small" variant="text" @click="apiPanels = []">Recolher tudo</v-btn>
      </div>

      <div class="doc-panels">
        <div v-for="(m, i) in apiModules" :key="m.path" class="doc-acc-item" :class="{ open: apiPanels.includes(i) }">
          <button class="doc-acc-head" @click="toggleApiPanel(i)">
            <span class="doc-acc-head-main">
              <span class="mono font-weight-bold mr-2">{{ m.path }}</span>
              <v-chip v-if="m.access" size="x-small" :color="m.access === 'owner' ? 'warning' : 'success'" variant="tonal" class="mr-2">{{ m.access }}</v-chip>
              <span class="text-caption" style="color:#6B7C88">{{ m.desc }}</span>
            </span>
            <v-icon icon="mdi-chevron-down" size="18" class="doc-acc-chevron" />
          </button>
          <div class="doc-acc-body-outer">
            <div class="doc-acc-body-inner">
              <div class="doc-acc-body">
                <div class="route-row" v-for="(r, ri) in m.routes" :key="ri">
                  <span class="m" :class="methodClass(r.m)">{{ r.m }}</span>
                  <span class="route-path mono">{{ r.p }}</span>
                  <span class="route-desc">{{ r.d }}</span>
                </div>
                <p v-if="m.note" class="doc-footnote">{{ m.note }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Env ──────────────────────────────────────────────────── -->
    <section id="env" class="doc-section">
      <h2>Variáveis de ambiente</h2>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <thead><tr><th>Variável</th><th>Propósito</th></tr></thead>
          <tbody>
            <tr v-for="e in envVars" :key="e.k">
              <td class="mono" style="white-space:nowrap">{{ e.k }}</td>
              <td class="ztable-sub">{{ e.d }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <v-alert type="warning" variant="tonal" density="comfortable">
        <code>backend/.env.example</code> não lista <code>BACKEND_URL</code>, <code>SUPABASE_MEDIA_BUCKET</code>,
        <code>META_APP_SECRET</code> nem as três variáveis <code>EVOLUTION_*</code> — todas lidas de fato por
        <code>config/index.js</code>. Quem clonar o repo seguindo só o <code>.env.example</code> vai esquecer a Evolution
        API e a assinatura de webhook da Meta.
      </v-alert>
    </section>

    <!-- ── IA ───────────────────────────────────────────────────── -->
    <section id="ia-agente" class="doc-section">
      <h2>Agente de IA (SDR)</h2>

      <h3>Function-calling</h3>
      <div class="grid-2">
        <v-card class="glass pa-4" border>
          <div class="mono font-weight-bold mb-1">consultar_horarios_livres(dia_inicio, dia_fim)</div>
          <div class="text-caption" style="color:#9FB0BC">Chama getFreeBusy() no Google Calendar para checar horários ocupados antes de propor um horário.</div>
        </v-card>
        <v-card class="glass pa-4" border>
          <div class="mono font-weight-bold mb-1">agendar_reuniao(titulo, inicio, fim)</div>
          <div class="text-caption" style="color:#9FB0BC">Reconfirma free/busy e cria o evento (Google Meet automático); em conflito, devolve erro ao modelo para sugerir outro horário.</div>
        </v-card>
      </div>

      <h3>Prompt do sistema</h3>
      <p class="p-muted">
        Sem customização, usa o persona padrão em português (SDR objetivo, respostas curtas de WhatsApp, nunca inventar
        horário). Prompts customizados são concatenados; data/hora atual (America/Sao_Paulo) sempre injetada.
      </p>

      <v-alert type="info" variant="tonal" density="comfortable" class="my-4">
        <strong>Como funciona a "leitura de documentos":</strong> não é busca vetorial/RAG — é injeção de texto puro.
        O PDF/XLSX/CSV enviado é extraído e truncado em <strong>15.000 caracteres</strong>, colado direto no prompt do
        sistema em toda chamada.
      </v-alert>

      <h3>Loop de conversa</h3>
      <p class="p-muted">
        Monta o histórico a partir da tabela <code>messages</code> e itera até <strong>4 chamadas de ferramenta</strong>
        por turno (trava contra loop infinito).
      </p>

      <h3>Áudio → texto</h3>
      <p class="p-muted">
        Notas de voz passam por <strong>Whisper-1</strong> antes de qualquer outra coisa — a transcrição vira o próprio
        texto da mensagem salva, alimentando tanto a resposta da IA quanto o score do lead.
      </p>

      <h3>Análise e score do lead</h3>
      <p class="p-muted">
        Chamada separada (temperatura 0, JSON mode): nota 0–100, intenção, estágio e palavras-chave de interesse. Roda
        sob demanda e automaticamente em background após toda resposta da IA.
      </p>
    </section>

    <!-- ── Integrações ──────────────────────────────────────────── -->
    <section id="integracoes" class="doc-section">
      <h2>WhatsApp & Google Calendar</h2>

      <h3>Roteamento WhatsApp</h3>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <thead><tr><th>Configuração do tenant</th><th>Comportamento de envio</th></tr></thead>
          <tbody>
            <tr><td class="mono">feat_hybrid</td><td class="ztable-sub">Tenta Meta primeiro, cai para Evolution em qualquer falha</td></tr>
            <tr><td class="mono">feat_meta_api</td><td class="ztable-sub">Somente Meta (API oficial)</td></tr>
            <tr><td class="mono">feat_evolution_api</td><td class="ztable-sub">Somente Evolution (não-oficial)</td></tr>
            <tr><td class="ztable-sub">Nenhuma flag</td><td class="ztable-sub">Autodetecta por canal conectado e usa Evolution</td></tr>
          </tbody>
        </table>
      </div>

      <div class="grid-2">
        <v-card class="glass pa-4" border>
          <div class="text-subtitle-2 font-weight-bold mb-1">Meta WhatsApp Cloud API (oficial)</div>
          <div class="text-caption" style="color:#9FB0BC">Credenciais por tenant criptografadas. Envio de mídia em duas etapas (upload → media_id → mensagem). Webhook validado por assinatura HMAC-SHA256.</div>
        </v-card>
        <v-card class="glass pa-4" border>
          <div class="text-subtitle-2 font-weight-bold mb-1">Evolution API (Baileys, não-oficial)</div>
          <div class="text-caption" style="color:#9FB0BC">Modelo global multi-tenant via tabela channels (1 instância = 1 número). Download de mídia com timeout de 20s. Mapeia ACKs numéricos (0–5) do Baileys.</div>
        </v-card>
      </div>

      <h3 class="mt-4">Google Calendar</h3>
      <p class="p-muted">
        OAuth2 com credenciais globais ou por tenant (self-service). <code>state</code> do fluxo OAuth é um JWT
        assinado de 10 min (proteção CSRF). Tokens rotacionados são reencriptados e regravados automaticamente.
        Eventos sempre com link de <strong>Google Meet</strong> automático.
      </p>
    </section>

    <!-- ── Código ───────────────────────────────────────────────── -->
    <section id="codigo" class="doc-section">
      <h2>Código — backend ⇄ Evolution API</h2>
      <p class="lede">
        Como o servidor está montado, onde cada variável do <code>.env</code> é efetivamente lida no código e o
        caminho exato de uma mensagem entre a plataforma e o WhatsApp via Evolution API — reconstruído lendo
        <code>backend/src/</code> diretamente, com arquivo e linha.
      </p>

      <h3>Arquitetura do servidor</h3>
      <p class="p-muted">
        Um único processo Express (<code>server.js</code>), sem cluster nem Socket.IO próprio — o tempo real do
        frontend vem do <strong>Supabase Realtime</strong> (pacote <code>ws</code> é só o transporte desse client).
        Nenhuma rota ou serviço lê <code>process.env</code> diretamente: tudo passa por um único objeto de
        configuração central.
      </p>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <thead><tr><th>Arquivo</th><th>Papel</th></tr></thead>
          <tbody>
            <tr v-for="f in serverArch" :key="f.f">
              <td class="mono" style="white-space:nowrap">{{ f.f }}</td>
              <td class="ztable-sub">{{ f.d }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Variáveis de ambiente → onde são lidas no código</h3>
      <p class="p-muted">
        <code>backend/src/config/index.js</code> é o único ponto que chama <code>process.env</code> (fora de uma
        checagem de <code>NODE_ENV</code> em <code>app.js:76</code>). Ele exporta o objeto <code>config</code>,
        importado por todo o resto do backend — inclusive por <code>services/whatsapp/evolution.js</code> e
        <code>routes/channels.js</code>, que nunca tocam <code>process.env</code> diretamente.
      </p>
      <div class="ztable-wrap mb-4">
        <table class="ztable">
          <thead><tr><th>Variável</th><th>Lida em</th><th>Consumida em / propósito</th></tr></thead>
          <tbody>
            <tr v-for="e in envCodeVars" :key="e.k">
              <td class="mono" style="white-space:nowrap">{{ e.k }}</td>
              <td class="mono ztable-sub" style="white-space:nowrap">{{ e.f }}</td>
              <td class="ztable-sub">{{ e.d }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <v-alert type="warning" variant="tonal" density="comfortable" class="mb-4">
        <strong>Verificação de assinatura desativada no servidor atual.</strong> <code>EVOLUTION_WEBHOOK_SECRET</code>
        e <code>META_APP_SECRET</code> não estão definidos no <code>backend/.env</code> de produção. Em
        <code>routes/webhooks.js</code> ambas as checagens são condicionais
        (<code>if (config.evolution.webhookSecret) {'{'} ... {'}'}</code>) — como as variáveis chegam vazias, o
        bloco inteiro é pulado e <code>/webhooks/evolution</code> e <code>/webhooks/meta</code> aceitam qualquer
        requisição sem validar origem. Definir as duas variáveis ativa a proteção sem mudar nenhum código.
      </v-alert>

      <h3>Envio (plataforma → WhatsApp)</h3>
      <ol class="p-muted">
        <li>Frontend chama <code>POST /api/chat/:leadId/messages</code> (ou <code>/media</code>,
          <code>/schedule</code>) — <code>routes/chat.js</code>.</li>
        <li><code>chat.js</code> importa <code>sendText()</code> de
          <code>services/whatsapp/index.js</code>.</li>
        <li><code>whatsapp/index.js</code> lê <code>tenants.feat_hybrid / feat_meta_api / feat_evolution_api</code>
          e decide o provedor — ou autodetecta pelo primeiro canal <code>connected</code> se nenhuma flag estiver
          ligada.</li>
        <li><code>evolution.js → sendText()</code> busca o canal conectado do tenant e faz
          <code>POST {'{EVOLUTION_API_URL}'}/message/sendText/{'{instance_name}'}</code> com header
          <code>apikey: EVOLUTION_API_KEY</code>.</li>
        <li>A Evolution (Baileys) entrega a mensagem no WhatsApp real e responde com <code>key.id</code>.</li>
        <li>O backend grava a mensagem em <code>messages</code> com <code>provider='evolution'</code> e
          <code>wa_message_id = key.id</code> — é essa coluna que casa o ACK recebido depois.</li>
      </ol>

      <h3>Recebimento (WhatsApp → plataforma)</h3>
      <ol class="p-muted">
        <li>Baileys recebe uma mensagem → a Evolution dispara o webhook registrado (evento
          <code>messages.upsert</code>) para <code>{'{BACKEND_URL}'}/webhooks/evolution/{'{tenantId}'}</code>
          (ou a rota universal <code>/webhooks/evolution</code>, sem tenant na URL).</li>
        <li><code>routes/webhooks.js</code> confere o header <code>apikey</code>/<code>Authorization</code>
          contra <code>EVOLUTION_WEBHOOK_SECRET</code> (ver alerta acima).</li>
        <li><code>evolution.js → parseWebhook(body)</code> normaliza o payload (formato v2 com <code>data</code>
          em array, ou legado) em <code>{'{ from, text, mediaType, waMessageId, isGroup, senderJid, ... }'}</code>.</li>
        <li><code>resolveEvolutionTenant(instanceName)</code> casa a instância com o tenant via tabela
          <code>channels</code> (fallback: <code>integrations</code> legado por-tenant).</li>
        <li><code>services/orchestrator.js → handleInboundMessage()</code> faz upsert do lead, salva a mensagem,
          roda o motor de fluxos e/ou o agente de IA, e responde chamando <code>whatsapp.sendText()</code> de
          volta quando aplicável — fechando o ciclo com o passo de "Envio" acima.</li>
        <li>Se <code>fromMe === true</code> (mensagem enviada por outro app logado na mesma sessão do WhatsApp),
          vai para <code>handleOutboundMessage()</code> em vez de tratada como recebida — evita duplicar como
          mensagem do lead.</li>
      </ol>

      <h3>Confirmação de entrega (ACK)</h3>
      <ol class="p-muted">
        <li>Evento <code>messages.update</code> chega no mesmo endpoint de webhook.</li>
        <li><code>evolution.js → parseWebhookStatus()</code> mapeia o ACK numérico do Baileys (0–5) ou o nome do
          status (Evolution v2) para <code>sent · delivered · read · failed</code> via
          <code>ACK_STATUS_MAP</code>.</li>
        <li><code>webhooks.js → applyBroadcastStatus(tenantId, messageId, status)</code> casa pelo
          <code>wa_message_id</code> salvo em <code>broadcast_contacts</code> e recalcula os contadores
          agregados da campanha a partir dos contatos (evita race condition de múltiplos webhooks concorrentes).</li>
      </ol>

      <h3>Criação de instância &amp; pareamento por QR Code</h3>
      <ol class="p-muted">
        <li><code>POST /api/channels</code> cria a linha em <code>channels</code> e monta
          <code>instanceName(tenantId, channelId)</code> → <code>sdr_{'{tenant·8}'}_{'{channel·8}'}</code>.</li>
        <li><code>evoFetch</code> chama <code>POST /instance/create {'{ instanceName, integration: "WHATSAPP-BAILEYS" }'}</code>
          na Evolution.</li>
        <li><code>GET /api/channels/:id/qr</code> chama <code>/instance/connect/{'{instance}'}</code> e devolve o
          QR em base64 (ou pairing code) para o frontend renderizar.</li>
        <li><code>GET /api/channels/:id/status</code> faz polling em
          <code>/instance/connectionState/{'{instance}'}</code> e sincroniza <code>channels.status/phone</code>
          quando o estado da Evolution vira <code>open</code>.</li>
      </ol>
      <v-alert type="info" variant="tonal" density="comfortable">
        O webhook <strong>não</strong> é registrado automaticamente na criação da instância — é preciso chamar
        <code>POST /api/channels/:id/revalidate-webhook</code> (que faz <code>POST /webhook/set/:instance</code> na
        Evolution) para a instância passar a notificar o backend de mensagens novas.
      </v-alert>
    </section>

    <!-- ── Fluxos ───────────────────────────────────────────────── -->
    <section id="fluxos" class="doc-section">
      <h2>Motor de fluxos (chatbot visual)</h2>
      <p class="p-muted">
        Cada lead com sessão ativa continua nela independente de human takeover. Sem sessão ativa, um fluxo pode ser
        disparado por palavra-chave ou vínculo direto a um canal. Se um fluxo tratar a mensagem, o agente de IA
        <strong>não</strong> é chamado naquele turno.
      </p>
      <div class="ztable-wrap mb-3">
        <table class="ztable">
          <tbody>
            <tr v-for="n in flowNodes" :key="n.t">
              <td class="mono" style="white-space:nowrap">{{ n.t }}</td>
              <td class="ztable-sub">{{ n.d }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="p-muted">Timeout de sessão configurável por fluxo (padrão 30 min) — passado esse tempo, a sessão vira <code>timeout</code> e envia mensagem de fallback.</p>
    </section>

    <!-- ── Jobs ─────────────────────────────────────────────────── -->
    <section id="jobs" class="doc-section">
      <h2>Jobs em background</h2>
      <p class="p-muted">Um único <code>setInterval</code> a cada <strong>20 segundos</strong>, com trava de reentrância. A cada tick:</p>
      <ol class="p-muted">
        <li><strong>Campanhas de broadcast agendadas</strong> — reivindica via update condicional e dispara o envio.</li>
        <li><strong>Mensagens agendadas</strong> — até 50 por tick, mesma reivindicação atômica.</li>
        <li><strong>Passos de acompanhamento (followups)</strong> — até 50 por tick, encerra o enrollment quando não sobra passo pendente.</li>
      </ol>
    </section>

    <!-- ── Funcionalidades ──────────────────────────────────────── -->
    <section id="frontend" class="doc-section">
      <h2>Funcionalidades (telas)</h2>
      <p class="p-muted mb-4">29 telas Vue, organizadas por área. Cada tenant só vê os itens liberados pelas suas feature flags.</p>

      <div class="grid-2">
        <div class="feat-area" v-for="area in featureAreas" :key="area.title">
          <h4>{{ area.title }} <span class="feat-count">{{ area.items.length }} tela{{ area.items.length > 1 ? 's' : '' }}</span></h4>
          <div class="feat-item" v-for="it in area.items" :key="it.name">
            <div class="feat-item-name">{{ it.name }} <span class="mono">{{ it.path }}</span></div>
            <p>{{ it.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Atenção ──────────────────────────────────────────────── -->
    <section id="atencao" class="doc-section">
      <h2>Pontos de atenção</h2>
      <p class="p-muted mb-4">Gaps e riscos reais encontrados ao mapear a plataforma.</p>
      <v-alert
        v-for="(a, i) in attentionPoints"
        :key="i"
        :type="a.level"
        variant="tonal"
        density="comfortable"
        class="mb-3"
      >
        <strong>{{ a.title }}</strong><br>
        <span v-html="a.desc"></span>
      </v-alert>
    </section>

    <footer class="doc-footer">
      Documentação gerada por leitura direta do código-fonte (branch <code>main</code>) — reflete o estado do
      repositório em 2026-07-09. Rotas, colunas e comportamento podem mudar; trate como referência, não como contrato.
    </footer>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const sections = [
  { id: 'visao-geral', label: 'Visão geral' },
  { id: 'stack', label: 'Stack' },
  { id: 'infraestrutura', label: 'Infraestrutura' },
  { id: 'seguranca', label: 'Segurança' },
  { id: 'banco-de-dados', label: 'Banco de dados' },
  { id: 'api', label: 'API' },
  { id: 'env', label: 'Variáveis de ambiente' },
  { id: 'ia-agente', label: 'Agente de IA' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'codigo', label: 'Código' },
  { id: 'fluxos', label: 'Fluxos' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'frontend', label: 'Funcionalidades' },
  { id: 'atencao', label: 'Pontos de atenção' },
]

const stackBadges = ['Vue 3 + Vuetify 3', 'Node.js + Express', 'Supabase (Postgres)', 'OpenAI (GPT-4o-mini + Whisper)', 'Google Calendar API', 'Evolution API / Baileys', 'PM2 · Hetzner']

const headlineStats = [
  { value: '23', label: 'Módulos de rotas' },
  { value: '29', label: 'Telas no frontend' },
  { value: '20', label: 'Tabelas no banco' },
  { value: '2', label: 'Provedores WhatsApp' },
]

const stackFrontend = [
  { name: 'vue', version: '3.5.x', desc: 'Framework de UI, Composition API' },
  { name: 'vuetify', version: '3.7.x', desc: 'Biblioteca de componentes' },
  { name: 'vue-router', version: '4.5.x', desc: 'Roteamento SPA' },
  { name: 'pinia', version: '2.3.x', desc: 'Estado global (auth, notifications, theme, locale)' },
  { name: '@vue-flow/core', version: '1.41.x', desc: 'Editor visual de fluxos do chatbot' },
  { name: '@supabase/supabase-js', version: '2.45.x', desc: 'Somente Realtime (anon key)' },
  { name: 'axios', version: '1.7.x', desc: 'Cliente HTTP' },
  { name: 'jspdf / jspdf-autotable', version: '4.x/5.x', desc: 'Exportação de relatórios em PDF' },
  { name: 'xlsx', version: '0.18.x', desc: 'Import/export de contatos' },
  { name: 'vite', version: '6.0.x', desc: 'Build tool / dev server' },
]
const stackBackend = [
  { name: 'express', version: '4.21.x', desc: 'Servidor HTTP / roteamento' },
  { name: '@supabase/supabase-js', version: '2.45.x', desc: 'Acesso total via service_role (ignora RLS)' },
  { name: 'jsonwebtoken', version: '9.0.x', desc: 'Sessão via JWT' },
  { name: 'bcryptjs', version: '2.4.x', desc: 'Hash de senha (cost 10)' },
  { name: 'helmet', version: '8.2.x', desc: 'Headers de segurança HTTP' },
  { name: 'express-rate-limit', version: '8.5.x', desc: 'Rate limit em /api/auth/login e /register' },
  { name: 'googleapis', version: '144.x', desc: 'OAuth2 + Calendar API' },
  { name: 'multer', version: '2.2.x', desc: 'Upload de mídia (multipart)' },
  { name: 'pdf-parse / xlsx', version: '—', desc: 'Extração de texto da base de conhecimento' },
  { name: 'ws', version: '8.18.x', desc: 'WebSocket (Realtime em Node 20)' },
  { name: 'zod', version: '3.24.x', desc: 'Validação de payloads' },
  { name: 'vitest', version: '4.1.x', desc: 'Testes unitários' },
]

const externalServices = [
  { title: 'Supabase', desc: 'Postgres gerenciado + Realtime + Storage. Backend usa service_role; frontend usa anon key só para Realtime.' },
  { title: 'OpenAI', desc: 'Chat Completions (gpt-4o-mini, function-calling) para o agente e análise de leads; Whisper para transcrever áudios.' },
  { title: 'Evolution API', desc: 'Servidor Node próprio (Baileys) no mesmo Hetzner, WhatsApp não-oficial via QR code.' },
]

const dbPanels = ref([])
function toggleDbPanel(i) {
  dbPanels.value = dbPanels.value.includes(i) ? dbPanels.value.filter((v) => v !== i) : [...dbPanels.value, i]
}
const dbTables = [
  { name: 'tenants', purpose: 'Raiz multi-tenant — cada cliente da plataforma', cols: [
    { n: 'id', t: 'uuid pk', d: '' }, { n: 'name, slug', t: 'text', d: 'slug único' },
    { n: 'status', t: 'text', d: 'active · suspended · trial' }, { n: 'plan', t: 'text', d: 'trial · starter · pro · enterprise' },
    { n: 'feat_meta_api…feat_custom_apis', t: 'bool ×11', d: 'feature flags do plano' },
    { n: 'max_leads', t: 'int', d: 'default 1000' }, { n: 'op_settings', t: 'jsonb', d: 'configurações operacionais' },
  ]},
  { name: 'users', purpose: 'Contas — owner global + admin/agent por tenant', cols: [
    { n: 'id', t: 'uuid pk', d: '' }, { n: 'tenant_id', t: 'uuid fk', d: 'null para owner' },
    { n: 'email', t: 'text unique', d: '' }, { n: 'password_hash', t: 'text', d: 'bcrypt' },
    { n: 'name, role', t: 'text', d: 'owner · admin · agent' }, { n: 'active', t: 'bool', d: '' },
  ]},
  { name: 'integrations', purpose: 'Credenciais criptografadas por provedor', cols: [
    { n: 'tenant_id', t: 'uuid', d: '' }, { n: 'provider', t: 'text', d: 'google_calendar · meta_whatsapp · evolution' },
    { n: 'status', t: 'text', d: 'connected · disconnected · error' }, { n: 'credentials', t: 'text', d: 'AES-256-GCM' },
    { n: 'meta', t: 'jsonb', d: '' }, { n: 'connected_at', t: 'timestamptz', d: '' },
  ], note: 'unique (tenant_id, provider)' },
  { name: 'leads', purpose: 'Contato/prospect trabalhado pela IA ou humano', realtime: true, cols: [
    { n: 'name, phone', t: 'text', d: 'unique (tenant_id, phone)' }, { n: 'stage', t: 'text', d: 'coluna do Kanban' },
    { n: 'score', t: 'int', d: '0–100, gerado pela IA' }, { n: 'intention', t: 'text', d: '' },
    { n: 'interests', t: 'jsonb', d: 'array de palavras-chave' }, { n: 'human_takeover', t: 'bool', d: 'true = IA pausada' },
  ]},
  { name: 'messages', purpose: 'Histórico completo de conversa por lead', realtime: true, cols: [
    { n: 'id', t: 'bigserial pk', d: '' }, { n: 'role', t: 'text', d: 'lead · ai · agent' },
    { n: 'text, provider', t: 'text', d: 'meta_whatsapp · evolution' }, { n: 'wa_message_id', t: 'text', d: 'id no WhatsApp' },
    { n: 'reply_to_id', t: 'bigint fk', d: 'thread de resposta' },
    { n: 'media_url/type/mimetype/filename', t: 'text', d: 'image · video · audio · document · sticker' },
  ]},
  { name: 'appointments', purpose: 'Reuniões agendadas, sincronizadas com o Google Calendar', realtime: true, cols: [
    { n: 'lead_id', t: 'uuid fk', d: 'on delete set null' }, { n: 'title, provider, external_id', t: 'text', d: '' },
    { n: 'start_time, end_time', t: 'timestamptz', d: '' }, { n: 'meeting_link', t: 'text', d: 'Google Meet' },
    { n: 'status', t: 'text', d: 'scheduled · confirmed · completed · cancelled' },
  ]},
  { name: 'usage_events', purpose: 'Log de eventos — alimenta dashboards e relatórios', realtime: true, cols: [
    { n: 'tenant_id, user_id', t: 'uuid fk', d: '' },
    { n: 'event_type', t: 'text', d: 'login · register · lead_created · message_sent/received · human_takeover · appointment_created' },
    { n: 'meta', t: 'jsonb', d: '' },
  ]},
  { name: 'ai_configs', purpose: 'Configuração do agente de IA — 1 por tenant', cols: [
    { n: 'name, model', t: 'text', d: 'default "SDR IA" / gpt-4o-mini' }, { n: 'system_prompt, main_prompt', t: 'text', d: '' },
    { n: 'temperature', t: 'numeric(3,2)', d: 'default 0.70' }, { n: 'max_tokens, active', t: 'int/bool', d: '' },
    { n: 'knowledge_base', t: 'text', d: 'truncado em 15k chars' },
  ]},
  { name: 'templates', purpose: 'Modelos de mensagem reutilizáveis', cols: [
    { n: 'name, category, content', t: 'text', d: 'suporta {{variavel}}' },
  ]},
  { name: 'template_categories', purpose: 'Categorias customizáveis de templates', cols: [
    { n: 'name', t: 'text', d: 'unique(tenant_id, name) — seed: Marketing, Utilidade' },
  ]},
  { name: 'lead_stage_history', purpose: 'Auditoria de transições de estágio no Kanban', cols: [
    { n: 'from_stage, to_stage', t: 'text', d: '' }, { n: 'changed_by, notes, changed_at', t: '—', d: '' },
  ]},
  { name: 'custom_apis', purpose: 'Credenciais de LLM externo (BYO-LLM)', cols: [
    { n: 'base_url, model', t: 'text', d: '' }, { n: 'api_key', t: 'text', d: 'criptografado' },
    { n: 'headers', t: 'jsonb', d: '' }, { n: 'provider, active', t: 'text/bool', d: 'openai · claude · gemini · deepseek · custom' },
  ]},
  { name: 'broadcast_campaigns', purpose: 'Campanhas de disparo em massa', cols: [
    { n: 'status', t: 'text', d: 'draft · scheduled · sending · completed · cancelled' },
    { n: 'content, template_id', t: 'text/uuid', d: '' }, { n: 'scheduled_at', t: 'timestamptz', d: '' },
    { n: 'min/max_interval_seconds', t: 'int', d: 'default 2/5 — atraso aleatório entre envios' },
    { n: 'sent/delivered/read/replied_count', t: 'int ×4', d: '' },
  ]},
  { name: 'broadcast_contacts', purpose: 'Destinatários de uma campanha, com rastreio de entrega', cols: [
    { n: 'name, phone', t: 'text', d: '' }, { n: 'status', t: 'text', d: 'pending · sent · delivered · read · replied · failed' },
    { n: 'wa_message_id', t: 'text', d: 'casa o ACK do webhook com o contato' },
  ]},
  { name: 'scheduled_messages', purpose: 'Mensagem avulsa agendada para um lead', cols: [
    { n: 'text, send_at', t: 'text/timestamptz', d: '' }, { n: 'status', t: 'text', d: 'pending · sent · cancelled · failed' },
  ]},
  { name: 'followup_sequences', purpose: 'Modelo reutilizável de sequência de acompanhamento', cols: [
    { n: 'name, description, created_by', t: '—', d: '' },
  ]},
  { name: 'followup_steps', purpose: 'Passos ordenados dentro de uma sequência', cols: [
    { n: 'order_index, delay_days, text', t: 'int/text', d: '' }, { n: 'media_*', t: 'text', d: '' },
  ]},
  { name: 'followup_enrollments', purpose: 'Um lead rodando uma sequência (ativa/finalizada)', cols: [
    { n: 'status', t: 'text', d: 'active · completed · cancelled' }, { n: 'started_at, finished_at', t: 'timestamptz', d: '' },
  ], note: 'índice único parcial: só 1 enrollment ativo por lead' },
  { name: 'followup_enrollment_messages', purpose: 'Cópia materializada de cada mensagem com data de envio calculada', cols: [
    { n: 'order_index, text, send_at', t: '—', d: '' }, { n: 'status, error, sent_at', t: '—', d: 'pending · sent · cancelled · failed' },
  ]},
  { name: 'channels', purpose: 'Instâncias WhatsApp (Evolution) — multi-número por tenant', cols: [
    { n: 'instance_name', t: 'text unique', d: 'identificador na Evolution' }, { n: 'status, phone', t: '—', d: '' },
  ], note: '⚠ existe só como migration avulsa — nunca foi mesclada ao schema base' },
]

const apiPanels = ref([])
function toggleApiPanel(i) {
  apiPanels.value = apiPanels.value.includes(i) ? apiPanels.value.filter((v) => v !== i) : [...apiPanels.value, i]
}
function methodClass(m) {
  return { GET: 'm-get', POST: 'm-post', PATCH: 'm-patch', PUT: 'm-patch', DELETE: 'm-delete' }[m] || 'm-get'
}
const apiModules = [
  { path: '/api/auth', desc: 'login, registro, sessão', access: 'público', routes: [
    { m: 'POST', p: '/login', d: 'Autentica, checa suspensão do tenant, seta cookie + retorna feature flags' },
    { m: 'POST', p: '/register', d: 'Self-service: cria tenant (trial) + admin com slug único' },
    { m: 'POST', p: '/logout', d: 'Limpa o cookie' },
    { m: 'POST', p: '/change-password', d: 'Requer sessão' },
  ]},
  { path: '/api/admin', desc: 'painel do dono', access: 'owner', routes: [
    { m: 'GET', p: '/clients', d: 'Lista de tenants (RPC admin_clients_overview)' },
    { m: 'GET', p: '/clients/:id', d: 'Detalhe do tenant + usuários + integrações' },
    { m: 'POST', p: '/clients', d: 'Cria tenant + admin inicial' },
    { m: 'PATCH', p: '/clients/:id/features', d: 'Liga/desliga feature flags do plano' },
    { m: 'PATCH', p: '/clients/:id/status', d: 'active · suspended · trial' },
    { m: 'PATCH', p: '/clients/:id', d: 'Edita dados gerais' },
    { m: 'DELETE', p: '/clients/:id', d: 'Remove tenant' },
    { m: 'GET', p: '/users', d: 'Todos os usuários não-owner, filtrável por tenant' },
    { m: 'POST', p: '/clients/:id/users', d: 'Cria usuário dentro de um tenant' },
    { m: 'PATCH', p: '/users/:id', d: 'Edita usuário' },
    { m: 'DELETE', p: '/users/:id', d: 'Remove usuário' },
    { m: 'POST', p: '/users/:id/reset-password', d: '' },
    { m: 'GET', p: '/owners', d: 'Lista superadmins' },
    { m: 'POST', p: '/owners', d: 'Cria novo superadmin' },
    { m: 'DELETE', p: '/owners/:id', d: 'Não permite autoexclusão' },
    { m: 'POST', p: '/clients/:id/impersonate', d: 'JWT de 1h para o admin do tenant' },
    { m: 'POST', p: '/users/:id/impersonate', d: 'JWT de 1h para um usuário específico' },
    { m: 'GET', p: '/monitoring', d: 'Feed cross-tenant de leads/mensagens/atendimentos' },
    { m: 'GET', p: '/settings', d: 'Integrações globais configuradas (sem segredos)' },
    { m: 'GET', p: '/overview', d: 'KPIs agregados (RPC admin_overview)' },
  ]},
  { path: '/api/leads', desc: 'CRM', routes: [
    { m: 'GET', p: '/', d: 'Lista paginada' },
    { m: 'POST', p: '/', d: 'Cria lead — respeita limite tenants.max_leads' },
    { m: 'PATCH', p: '/:id', d: 'Atualiza; loga mudança de estágio' },
    { m: 'DELETE', p: '/:id', d: '' },
    { m: 'GET', p: '/:id/history', d: 'Histórico de estágios' },
    { m: 'GET', p: '/:id/messages', d: '' },
    { m: 'POST', p: '/:id/analyze', d: 'Roda analyzeLead() e persiste score/estágio/intenção' },
  ]},
  { path: '/api/chat', desc: 'inbox omnichannel / ticketing', routes: [
    { m: 'GET', p: '/', d: 'Lista de conversas; agente comum só vê pending/próprias' },
    { m: 'POST', p: '/start', d: 'Inicia conversa avulsa (upsert lead)' },
    { m: 'GET', p: '/:leadId/messages', d: 'Paginação por cursor' },
    { m: 'GET', p: '/:leadId/logs', d: 'Timeline de ações do ticket' },
    { m: 'POST', p: '/:leadId/messages', d: 'Envia texto (requer ticket "open"); suporta citação' },
    { m: 'POST', p: '/:leadId/schedule', d: 'Agenda mensagem futura' },
    { m: 'POST', p: '/:leadId/media', d: 'Upload + envio de mídia (até 64MB)' },
    { m: 'POST', p: '/:leadId/transfer', d: 'Liga/desliga human takeover' },
    { m: 'POST', p: '/:leadId/transfer-to', d: 'Atribui a um operador' },
    { m: 'POST', p: '/:leadId/attend · /reopen · /return-to-queue · /resolve', d: 'Ciclo de vida do ticket' },
    { m: 'DELETE', p: '/:leadId', d: 'Só managers — cascata' },
    { m: 'POST', p: '/:leadId/followup', d: 'Inscrição em sequência de acompanhamento' },
  ]},
  { path: '/api/appointments', desc: 'agenda', routes: [
    { m: 'GET', p: '/', d: 'Lista' },
    { m: 'POST', p: '/sync', d: 'Puxa eventos do Google Calendar e faz upsert por external_id' },
    { m: 'POST', p: '/', d: 'Cria evento no Google + registro local' },
    { m: 'POST', p: '/:id/cancel', d: 'Cancela no Google + marca local' },
  ]},
  { path: '/api/broadcast', desc: 'disparo em massa', routes: [
    { m: 'GET', p: '/campaigns', d: '' }, { m: 'POST', p: '/campaigns', d: '' },
    { m: 'PATCH', p: '/campaigns/:id', d: '' }, { m: 'DELETE', p: '/campaigns/:id', d: '' },
    { m: 'POST', p: '/campaigns/:id/import-leads', d: 'Importa da base de leads com filtros' },
    { m: 'POST', p: '/campaigns/:id/send', d: 'Intervalo aleatório 2-5s configurável' },
    { m: 'POST', p: '/campaigns/:id/cancel', d: '' },
  ]},
  { path: '/api/channels', desc: 'instâncias WhatsApp (Evolution)', routes: [
    { m: 'GET', p: '/', d: 'Lista' }, { m: 'POST', p: '/', d: 'Cria instância' },
    { m: 'GET', p: '/:id/qr', d: 'Reinicia se desconectado, retorna QR' },
    { m: 'GET', p: '/:id/status', d: 'Sincroniza estado de conexão' },
    { m: 'POST', p: '/:id/close-tickets', d: 'Fecha tickets em massa' },
    { m: 'POST', p: '/:id/revalidate-webhook', d: 'Reregistra a URL do webhook' },
    { m: 'DELETE', p: '/:id', d: 'Logout + apaga instância' },
  ]},
  { path: '/api/contacts', desc: 'agenda de contatos (CRM)', routes: [
    { m: 'GET', p: '/', d: 'Busca + filtro por tags' },
    { m: 'POST', p: '/import', d: 'CSV/XLSX, upsert em lotes de 200' },
    { m: 'GET', p: '/export', d: 'CSV' },
    { m: 'POST', p: '/deduplicate', d: 'Remove duplicados por telefone' },
  ]},
  { path: '/api/custom-apis', desc: 'LLMs externos (BYO-LLM)', routes: [
    { m: 'GET', p: '/ · /:id', d: 'CRUD — openai, claude, gemini, deepseek, custom' },
    { m: 'POST', p: '/:id/test', d: 'Testa a API configurada' },
  ], note: 'Protegido contra SSRF: bloqueia IPs privados/loopback no hostname literal e no IP resolvido via DNS.' },
  { path: '/api/flows', desc: 'chatbot visual', routes: [
    { m: 'GET', p: '/ · /:id', d: '' }, { m: 'POST', p: '/', d: 'Cria com 2 nós padrão' },
    { m: 'PATCH', p: '/:id', d: 'Nós, arestas, palavras-gatilho' },
    { m: 'GET', p: '/:id/sessions', d: 'Sessões ativas (debug)' },
  ]},
  { path: '/api/followups', desc: 'sequências de acompanhamento', routes: [
    { m: 'GET', p: '/ · /:id', d: 'Com contagem de passos/inscrições ativas' },
    { m: 'POST', p: '/:id/duplicate', d: '' }, { m: 'POST', p: '/:id/steps/:stepId/media', d: 'Anexa mídia a um passo' },
  ]},
  { path: '/api/integrations', desc: 'Google Calendar, Meta, Evolution (legado)', routes: [
    { m: 'GET', p: '/google/setup', d: 'Cliente OAuth próprio do tenant' },
    { m: 'GET', p: '/google/callback', d: 'público — redirect do Google, state = JWT assinado' },
    { m: 'POST', p: '/meta/test', d: 'Valida token contra a Graph API' },
    { m: 'POST', p: '/meta/connect', d: 'Salva accessToken/phoneNumberId criptografados' },
    { m: 'GET', p: '/status', d: 'Status de todos os provedores' },
    { m: 'POST', p: '/:provider/disconnect', d: 'meta_whatsapp | evolution' },
  ]},
  { path: '/api/internal-groups', desc: 'chat interno da equipe', routes: [
    { m: 'GET', p: '/', d: 'Grupos do usuário' }, { m: 'POST', p: '/', d: 'Cria + membros' },
    { m: 'GET', p: '/:id/messages', d: '' },
  ]},
  { path: '/api/labels', desc: 'etiquetas coloridas', routes: [
    { m: 'GET', p: '/ · /:id', d: 'CRUD, cor validada (#RRGGBB)' },
  ]},
  { path: '/api/notifications', desc: 'alertas de leads sem resposta', routes: [
    { m: 'GET', p: '/?minutes=30', d: 'Última msg do lead há mais de N min, dentro de 48h — sem tabela dedicada' },
  ]},
  { path: '/api/op-settings', desc: 'comportamento operacional/ticketing', routes: [
    { m: 'GET', p: '/', d: 'Lê tenants.op_settings' }, { m: 'PUT', p: '/', d: 'Grava tenants.op_settings' },
  ]},
  { path: '/api/operators', desc: 'equipe do tenant', routes: [
    { m: 'GET', p: '/dashboard', d: 'Métricas de 30 dias por operador' },
    { m: 'POST', p: '/', d: 'admin' }, { m: 'DELETE', p: '/:id', d: 'admin, não pode autoexcluir' },
  ]},
  { path: '/api/queues', desc: 'filas de atendimento', routes: [
    { m: 'GET', p: '/ · /:id', d: 'CRUD com operadores atribuídos' },
  ]},
  { path: '/api/reports', desc: 'relatórios', routes: [
    { m: 'GET', p: '/daily?date=YYYY-MM-DD', d: 'Por operador + funil por estágio. TZ fixo America/Sao_Paulo' },
  ]},
  { path: '/api/templates', desc: 'modelos de mensagem', routes: [
    { m: 'GET', p: '/categories', d: 'Auto-seed Marketing/Utilidade' },
    { m: 'POST', p: '/:id/duplicate', d: '' }, { m: 'POST', p: '/:id/test', d: 'Gera exemplo via IA do tenant' },
  ]},
  { path: '/api/ai-config', desc: 'agente de IA do tenant', routes: [
    { m: 'GET', p: '/', d: 'Modelo, prompts, temperatura' }, { m: 'POST', p: '/toggle', d: 'Liga/desliga IA no tenant' },
    { m: 'POST', p: '/knowledge-base', d: 'Upload PDF/CSV/XLSX/TXT (até 10MB)' },
  ]},
  { path: '/api/business-hours', desc: 'horário de atendimento', routes: [
    { m: 'GET', p: '/', d: 'Grade semanal + timezone + mensagem fora do horário' },
  ]},
  { path: '/webhooks', desc: 'entrada do WhatsApp — Meta & Evolution', access: 'público', routes: [
    { m: 'GET', p: '/meta', d: 'Handshake de verificação (hub.verify_token)' },
    { m: 'POST', p: '/meta', d: 'express.raw() + assinatura HMAC-SHA256' },
    { m: 'POST', p: '/evolution', d: 'Tenant resolvido pelo nome da instância' },
    { m: 'POST', p: '/evolution/:tenantId', d: 'Compat legado, tenant explícito' },
  ], note: 'Verificam apikey/Authorization contra EVOLUTION_WEBHOOK_SECRET ou assinatura Meta.' },
]

const envVars = [
  { k: 'NODE_ENV', d: 'development · production — em produção, variáveis obrigatórias ausentes derrubam o boot' },
  { k: 'PORT', d: 'Porta do Express (produção: 5000, atrás do nginx)' },
  { k: 'FRONTEND_URL', d: 'Origem permitida no CORS' },
  { k: 'BACKEND_URL', d: 'Base da URL de webhook da Evolution (opcional)' },
  { k: 'SUPABASE_URL / SUPABASE_SERVICE_KEY', d: 'Client Supabase do backend (service_role)' },
  { k: 'SUPABASE_MEDIA_BUCKET', d: 'Bucket de mídia do chat (default chat-media)' },
  { k: 'JWT_SECRET / JWT_EXPIRES_IN', d: 'Assinatura da sessão' },
  { k: 'ENCRYPTION_KEY', d: 'AES-256-GCM, 64 chars hex — obrigatória' },
  { k: 'OPENAI_API_KEY / OPENAI_MODEL', d: 'Provedor de IA padrão' },
  { k: 'GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI', d: 'OAuth global de fallback' },
  { k: 'META_GRAPH_VERSION / VERIFY_TOKEN / APP_SECRET', d: 'WhatsApp Cloud API oficial' },
  { k: 'EVOLUTION_API_URL / API_KEY / WEBHOOK_SECRET', d: 'Instância global da Evolution API' },
  { k: 'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY', d: 'Frontend — só para o Realtime' },
  { k: 'VITE_API_BASE / VITE_BACKEND_URL', d: 'Prefixo/URL da API usados pelo frontend em dev' },
]

const serverArch = [
  { f: 'backend/src/server.js', d: 'Entry point — cria a app, app.listen(config.port), inicia o scheduler de jobs, trata SIGTERM/SIGINT. É o arquivo que o PM2 roda diretamente em produção.' },
  { f: 'backend/src/app.js', d: 'createApp() — monta helmet, CORS (FRONTEND_URL), cookie-parser, os 23 routers de /api/*, o router público /webhooks, os rate limits e o handler de erro global.' },
  { f: 'backend/src/config/index.js', d: 'Único ponto do backend que lê process.env diretamente. Exporta o objeto config consumido por todo o resto do código.' },
  { f: 'backend/src/db/supabase.js', d: 'Client Supabase (service_role, ignora RLS) usado em todas as queries do backend; exporta o helper unwrap({data,error}).' },
  { f: 'backend/src/middleware/auth.js', d: 'requireAuth / requireTenant — valida o JWT da sessão (cookie sdr_token ou Bearer) e injeta req.user.' },
  { f: 'backend/src/services/whatsapp/index.js', d: 'Roteador de provedor — decide Meta ou Evolution por tenant (feature flags) antes de qualquer envio.' },
  { f: 'backend/src/services/whatsapp/evolution.js', d: 'Toda chamada HTTP para a Evolution API: enviar texto/mídia/localização, editar, apagar, baixar mídia, parsear webhook.' },
  { f: 'backend/src/services/orchestrator.js', d: 'Cérebro do processamento de mensagem — chamado pelo webhook, decide lead, IA, fluxo, agendamento.' },
  { f: 'backend/src/routes/webhooks.js', d: 'Única rota pública (sem JWT) — recebe eventos da Evolution e da Meta.' },
  { f: 'backend/src/routes/channels.js', d: 'Ciclo de vida da instância Evolution: criar, QR, status, revalidar webhook, desconectar, excluir.' },
]

const envCodeVars = [
  { k: 'NODE_ENV', f: 'config/index.js:6,16 · app.js:76', d: 'Em produção, required() derruba o boot se JWT_SECRET/ENCRYPTION_KEY faltarem; também troca mensagens de erro internas por texto genérico.' },
  { k: 'PORT', f: 'config/index.js:17,20 · server.js:7', d: 'Porta do Express (produção: 5000) e base do fallback de BACKEND_URL.' },
  { k: 'FRONTEND_URL', f: 'config/index.js:19 · app.js:65', d: 'Origem única liberada no CORS.' },
  { k: 'BACKEND_URL', f: 'config/index.js:20 · routes/channels.js:228', d: 'Monta a URL registrada como webhook na Evolution. Sem a variável, cai no fallback http://localhost:{PORT}.' },
  { k: 'SUPABASE_URL / SUPABASE_SERVICE_KEY', f: 'config/index.js:30-31 · db/supabase.js', d: 'Client Supabase com service_role — acesso total, ignora RLS.' },
  { k: 'SUPABASE_MEDIA_BUCKET', f: 'config/index.js:32 · services/mediaStorage.js', d: 'Bucket de Storage onde mídia recebida/enviada no chat é salva (default chat-media).' },
  { k: 'JWT_SECRET / JWT_EXPIRES_IN', f: 'config/index.js:36-37 · middleware/auth.js', d: 'Assina e valida o cookie de sessão sdr_token.' },
  { k: 'ENCRYPTION_KEY', f: 'config/index.js:40 · services/crypto.js', d: 'Chave AES-256-GCM que criptografa credenciais (tokens Google, Meta, Evolution por-tenant, LLMs custom).' },
  { k: 'OPENAI_API_KEY / OPENAI_MODEL', f: 'config/index.js:55-56 · services/ai/*.js', d: 'Credencial e modelo padrão do agente de IA e do Whisper.' },
  { k: 'GOOGLE_CLIENT_ID / SECRET / REDIRECT_URI', f: 'config/index.js:43-47 · services/googleCalendar.js', d: 'OAuth2 global de fallback para o Calendar.' },
  { k: 'META_GRAPH_VERSION / VERIFY_TOKEN / APP_SECRET', f: 'config/index.js:60-62 · services/whatsapp/meta.js · routes/webhooks.js:74,85', d: 'Versão da Graph API, handshake de verificação e assinatura HMAC do webhook Meta.' },
  { k: 'EVOLUTION_API_URL / API_KEY', f: 'config/index.js:66-67 · services/whatsapp/evolution.js · routes/channels.js (evoFetch)', d: 'URL base da instância global da Evolution e a apikey enviada em todo header das chamadas.' },
  { k: 'EVOLUTION_WEBHOOK_SECRET', f: 'config/index.js:68 · routes/webhooks.js:156,226', d: 'Comparado contra o header apikey/Authorization recebido no webhook — rejeita com 403 se não bater.' },
]

const flowNodes = [
  { t: 'passo', d: 'Formato atual — envia mensagem; próximo passo depende da saída: aguardar, transferir, encerrar ou avançar' },
  { t: 'mensagem', d: 'Formato legado — envia e avança' },
  { t: 'captura', d: 'Pergunta e espera resposta, guarda em variável' },
  { t: 'condicao', d: 'Ramifica por regras (igual, contém, regex, vazio…)' },
  { t: 'ia', d: 'Chama o agente de IA completo no meio do fluxo' },
  { t: 'webhook', d: 'GET/POST externo, guarda resposta em variável, timeout 10s' },
  { t: 'transferencia', d: 'Ativa human_takeover e encerra a sessão do fluxo' },
  { t: 'delay', d: 'Espera (máx. 300s) antes de continuar' },
  { t: 'encerrar', d: 'Fecha a sessão como concluída' },
]

const featureAreas = [
  { title: 'CRM & Leads', items: [
    { name: 'Dashboard', path: '/dashboard', desc: 'Cards ao vivo, gráfico de 12 meses, funil por estágio, relatório diário em PDF.' },
    { name: 'Leads', path: '/leads', desc: 'Tabela CRM com busca, criação manual, reanálise por IA.' },
    { name: 'Kanban', path: '/kanban', desc: 'Board arrastável em 6 estágios, badge de score, histórico por lead.' },
    { name: 'Contatos', path: '/contatos', desc: 'Base separada dos leads, tags, import/export, dedup.' },
  ]},
  { title: 'Conversas', items: [
    { name: 'Chat', path: '/chat', desc: 'Inbox completo: filtros, human takeover, composer com áudio/anexo/citação, followup.' },
    { name: 'Grupos internos', path: '/grupos', desc: 'Chat interno da equipe (não é WhatsApp).' },
  ]},
  { title: 'Automação', items: [
    { name: 'Chat Flow', path: '/flows', desc: 'Galeria de chatbots com status e palavras-gatilho.' },
    { name: 'Editor de fluxo', path: '/flows/:id', desc: 'Editor visual (VueFlow) drag-and-connect.' },
    { name: 'Acompanhamentos', path: '/acompanhamentos', desc: 'Sequências de mensagens com atraso em dias.' },
  ]},
  { title: 'Campanhas & Templates', items: [
    { name: 'Disparo em massa', path: '/broadcast', desc: 'Campanhas com métricas de entrega ao vivo, intervalo anti-spam.' },
    { name: 'Templates', path: '/templates', desc: 'Biblioteca por categoria, variáveis {{var}}, teste com IA.' },
  ]},
  { title: 'Agenda', items: [
    { name: 'Agenda', path: '/agenda', desc: 'Calendário mensal, sincronização com Google, cancelamento.' },
  ]},
  { title: 'Integrações & Canais', items: [
    { name: 'Canais', path: '/canais', desc: 'Gestão de instâncias WhatsApp Evolution, QR com contagem regressiva.' },
    { name: 'Integrações', path: '/integracoes', desc: 'Setup do Google Calendar, Meta Cloud API, Evolution API.' },
  ]},
  { title: 'Configuração de IA', items: [
    { name: 'Config. IA', path: '/ia-config', desc: 'Modelo, temperatura, prompts, base de conhecimento, teste inline.' },
    { name: 'APIs customizadas', path: '/apis', desc: 'BYO-LLM: OpenAI, Claude, Gemini, DeepSeek ou endpoint custom.' },
  ]},
  { title: 'Configurações de atendimento', items: [
    { name: 'Atendimento', path: '/atendimento', desc: 'Etiquetas, filas, horário de funcionamento.' },
    { name: 'Operação', path: '/operacao', desc: '~40 toggles: encerramento automático, visibilidade, bot, WABA.' },
    { name: 'Operadores', path: '/operadores', desc: 'Equipe, permissões granulares, dashboard de performance.' },
  ]},
  { title: 'Conta & Ajuda', items: [
    { name: 'Configurações', path: '/configuracoes', desc: 'Dados da empresa, senha, idioma, timezone.' },
    { name: 'Ajuda', path: '/ajuda', desc: 'Base de conhecimento interna pesquisável.' },
  ]},
  { title: 'Administração (owner)', items: [
    { name: 'Visão geral', path: '/admin/overview', desc: 'KPIs da plataforma, clientes recentes, integrações ativas.' },
    { name: 'Clientes', path: '/admin/clientes', desc: 'Lista de tenants, criação com features iniciais.' },
    { name: 'Detalhe do cliente', path: '/admin/clientes/:id', desc: 'Feature flags, integrações, usuários, impersonation.' },
    { name: 'Usuários', path: '/admin/usuarios', desc: 'Superadmins + diretório global de usuários.' },
    { name: 'Monitoramento', path: '/admin/monitoramento', desc: 'Feed cross-tenant de leads/mensagens/atendimentos.' },
  ]},
]

const attentionPoints = [
  { level: 'error', title: 'Endpoints de debug protegidos só por chave estática', desc: '<code>GET /api/diag?key=sdr2025</code> e <code>GET /webhooks/debug-msgs?key=sdr2025</code> não passam por autenticação de sessão — só uma chave fixa no código. Recomendo removê-los ou trocá-los por autenticação real.' },
  { level: 'warning', title: 'Isolamento entre tenants é 100% aplicação, 0% banco', desc: 'Sem RLS ativo, cada rota precisa lembrar de filtrar por tenant_id manualmente.' },
  { level: 'warning', title: 'Cookie de sessão sem flag secure', desc: '<code>sdr_token</code> é setado com <code>secure: false</code> mesmo em produção — deveria ser <code>true</code> atrás do HTTPS do nginx.' },
  { level: 'warning', title: 'Schema do banco não é mais versionado no repositório', desc: 'Commit "SQL REMOVIDO" apagou todos os .sql da árvore de trabalho. A tabela <code>channels</code> nunca tinha sido mesclada ao schema base. Recomendo exportar o schema atual do Supabase.' },
  { level: 'info', title: 'Cache em memória do orquestrador não é compartilhado entre instâncias', desc: '<code>services/orchestrator.js</code> mantém caches em memória de processo — hoje ok com 1 instância PM2, mas divergiria em modo cluster.' },
  { level: 'info', title: 'Mapeamento de ACK da Evolution ainda não validado em produção', desc: '<code>ACK_STATUS_MAP</code> foi escrito sem ver um payload real de <code>messages.update</code> — vale checar os logs do PM2 após o próximo disparo em massa.' },
]
</script>

<style scoped>
.admin-page { padding: 0; }
.page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.page-title { font-size: 1.5rem; font-weight: 700; letter-spacing: -0.3px; color: var(--text-primary, #E2E8F0); }
.page-sub { font-size: 0.8rem; color: #6B7C88; margin-top: 2px; }

.toc-bar { display: flex; flex-wrap: wrap; gap: 6px; position: sticky; top: 0; z-index: 5; padding: 10px 0; background: var(--app-bg, #0f1623); }
.toc-chip {
  font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 20px;
  background: var(--glass-bg, #1C2333); border: 1px solid rgba(255,255,255,0.08);
  color: #9FB0BC; text-decoration: none; white-space: nowrap;
}
.toc-chip:hover { color: var(--text-primary, #E2E8F0); border-color: rgba(255,255,255,0.2); }

.doc-section { margin-bottom: 48px; scroll-margin-top: 56px; }
.doc-section h2 {
  font-size: 1.25rem; font-weight: 700; color: var(--text-primary, #E2E8F0);
  padding-bottom: 12px; margin-bottom: 14px; border-bottom: 1px solid rgba(255,255,255,0.08);
}
.doc-section h3 { font-size: 0.98rem; font-weight: 700; color: var(--text-primary, #E2E8F0); margin: 22px 0 8px; }
.doc-section h4 { font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #E2E8F0); margin: 0 0 8px; display:flex; align-items:center; gap:8px; }
.lede { font-size: 0.95rem; color: #9FB0BC; max-width: 74ch; margin-bottom: 18px; }
.p-muted { color: #9FB0BC; font-size: 0.875rem; line-height: 1.65; }
.doc-footnote { font-size: 0.75rem; color: #6B7C88; margin-top: 8px; }

.mono { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.82em; }

code {
  background: rgba(255,255,255,0.07); border-radius: 4px; padding: 1px 5px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; font-size: 0.85em; color: #67E8F9;
}

.badge-row { display: flex; flex-wrap: wrap; gap: 8px; }
.stack-badge {
  display: inline-flex; align-items: center; padding: 5px 11px; border-radius: 20px;
  font-size: 12px; font-weight: 600; background: var(--glass-bg, #1C2333);
  border: 1px solid rgba(255,255,255,0.08); color: #9FB0BC;
}

.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px; }
@media (max-width: 700px) { .stats-row { grid-template-columns: repeat(2, 1fr); } }
.stat-card { background: var(--glass-bg, #1C2333); border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; padding: 14px 16px; }
.stat-value { font-size: 1.4rem; font-weight: 700; color: #FBB040; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 0.68rem; color: #6B7C88; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 760px) { .grid-2, .grid-3 { grid-template-columns: 1fr; } }

.ztable-wrap { border: 1px solid rgba(255,255,255,0.07); border-radius: 12px; overflow: hidden; background: var(--glass-bg, #1C2333); }
.ztable-section-header { padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); background: rgba(255,255,255,0.02); }
.section-label { font-size: 0.8rem; font-weight: 600; color: var(--text-primary, #E2E8F0); }
.ztable { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
.ztable thead th {
  padding: 9px 14px; font-size: 0.66rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  color: #6B7C88; background: rgba(255,255,255,0.015); border-bottom: 1px solid rgba(255,255,255,0.06); text-align:left;
}
.ztable tbody td { padding: 8px 14px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; color: var(--text-primary, #E2E8F0); }
.ztable tbody tr:last-child td { border-bottom: none; }
.ztable-sub { color: #9FB0BC; }

.role-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 0.85rem; color: #9FB0BC; }

.doc-panels { display: flex; flex-direction: column; gap: 6px; }

/* ─── Item de acordeão (expande/recolhe no lugar) ─── */
.doc-acc-item {
  background: var(--glass-bg, #1C2333);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  overflow: hidden;
}
.doc-acc-head {
  width: 100%;
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  min-height: 48px; padding: 8px 20px;
  background: none; border: none; cursor: pointer; text-align: left;
  font: inherit; color: inherit;
}
.doc-acc-head:hover { background: rgba(255,255,255,0.03); }
.doc-acc-head-main { display: flex; align-items: center; flex-wrap: wrap; font-size: 0.85rem; }
.doc-acc-chevron { flex-shrink: 0; color: #6B7C88; transition: transform .32s cubic-bezier(.4,0,.2,1); }
.doc-acc-item.open .doc-acc-chevron { transform: rotate(180deg); }
.doc-acc-body-outer {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows .32s cubic-bezier(.4,0,.2,1);
}
.doc-acc-item.open .doc-acc-body-outer { grid-template-rows: 1fr; }
.doc-acc-body-inner { overflow: hidden; }
.doc-acc-body { padding: 4px 20px 14px; }

.col-row, .route-row { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; border-bottom: 1px dashed rgba(255,255,255,0.06); font-size: 0.8rem; }
.col-row:last-child, .route-row:last-child { border-bottom: none; }
.col-name { min-width: 170px; flex: none; color: var(--text-primary, #E2E8F0); }
.col-type { min-width: 100px; flex: none; color: #67E8F9; font-size: 0.75rem; }
.col-note, .route-desc { color: #9FB0BC; }
.route-path { color: var(--text-primary, #E2E8F0); white-space: nowrap; }

.m { display: inline-block; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 0.62rem; font-weight: 700; padding: 2px 6px; border-radius: 5px; min-width: 42px; text-align: center; flex: none; }
.m-get { background: rgba(56,189,248,0.15); color: #38BDF8; }
.m-post { background: rgba(16,185,129,0.15); color: #34D399; }
.m-patch { background: rgba(245,158,11,0.15); color: #FBB040; }
.m-delete { background: rgba(239,68,68,0.15); color: #F87171; }

.feat-area { margin-bottom: 22px; }
.feat-count { font-size: 0.65rem; font-weight: 600; color: #6B7C88; background: rgba(255,255,255,0.05); padding: 2px 8px; border-radius: 10px; }
.feat-item { padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
.feat-item:last-child { border-bottom: none; }
.feat-item-name { font-weight: 700; font-size: 0.85rem; color: var(--text-primary, #E2E8F0); }
.feat-item-name .mono { font-weight: 400; font-size: 0.7rem; color: #6B7C88; margin-left: 6px; }
.feat-item p { color: #9FB0BC; font-size: 0.8rem; margin: 3px 0 0; }

.doc-footer { padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); color: #6B7C88; font-size: 0.75rem; }
</style>
