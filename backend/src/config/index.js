import 'dotenv/config'

function required(name, fallback) {
  const v = process.env[name]
  if (v) return v
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      `[config] Variável obrigatória ${name} não definida. O servidor não pode iniciar em produção sem ela.`
    )
  }
  if (fallback === undefined) console.warn(`[config] variável ${name} não definida no .env`)
  return fallback
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  // Bind só em loopback por padrão — em produção o nginx roda no MESMO host e
  // faz proxy_pass pra localhost:PORT, então isso não muda nada pro tráfego
  // real. Sem isso, o backend ficava acessível diretamente de qualquer lugar
  // da internet na porta PORT, contornando nginx (rate limit, TLS, etc.)
  // inteiramente. HOST=0.0.0.0 continua disponível via env pra topologias
  // onde o proxy roda num host/container diferente (ex.: Docker).
  host: process.env.HOST || '127.0.0.1',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://sdr:sdr@localhost:5432/sdr',
    // Papel restrito (NOBYPASSRLS) usado pelas rotas tenant-scoped via db/rls.js —
    // ver migration_rls.sql. Distinto de DATABASE_URL (superuser, só pra migrations).
    rlsUrl: process.env.DATABASE_RLS_URL || '',
    ssl: process.env.DB_SSL ? process.env.DB_SSL === 'true' : true,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY,
    mediaBucket: process.env.SUPABASE_MEDIA_BUCKET || 'chat-media',
  },

  jwt: {
    secret: required('JWT_SECRET', 'troque-este-segredo-em-producao'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  encryptionKey: required('ENCRYPTION_KEY'),

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      process.env.GOOGLE_REDIRECT_URI ||
      'http://localhost:3000/api/integrations/google/callback',
    scopes: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    // Teto de segurança contra custo descontrolado (bug num fluxo, ou alguém
    // mandando mensagens repetidas só pra gerar chamadas de IA) — 0 desativa
    // o teto. Não é um limite de plano/cobrança, só uma rede de segurança.
    dailyMessageCapPerTenant: parseInt(process.env.AI_DAILY_MESSAGE_CAP || '2000', 10),
  },

  meta: {
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'sdr-verify',
    appSecret: process.env.META_APP_SECRET || '',
  },

  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL || '',
    apiKey: process.env.EVOLUTION_API_KEY || '',
    webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET || '',
  },

  // A documentação oficial (app.pipelinecrm.com/api/docs) fica atrás de
  // login — esta base URL vem de fontes de terceiros (wrapper Ruby oficial
  // arquivado + posts de blog), não foi validada contra a API de verdade.
  // Ajustar via env assim que confirmarmos com uma conta real.
  pipelineCrm: {
    apiBaseUrl: process.env.PIPELINE_CRM_API_BASE_URL || 'https://api.pipelinecrm.com/api/v3',
  },

  infinitepay: {
    handle: process.env.INFINITEPAY_HANDLE || '',
    apiUrl: 'https://api.checkout.infinitepay.io/links',
  },

  billing: {
    trialPlanTier: process.env.TRIAL_PLAN_TIER || 'pro',
    trialPlanPriceCents: parseInt(process.env.TRIAL_PLAN_PRICE_CENTS || '39700', 10),
    trialDays: parseInt(process.env.TRIAL_DAYS || '7', 10),
  },

  // SMTP genérico usado pelo relatório agendado por e-mail (services/email.js).
  // Sem SMTP_HOST configurado, o envio vira um no-op logado — feature fica
  // pronta no código, mas só envia de verdade depois de credenciais reais.
  smtp: {
    host:   process.env.SMTP_HOST || '',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    user:   process.env.SMTP_USER || '',
    pass:   process.env.SMTP_PASS || '',
    from:   process.env.SMTP_FROM || '',
  },
}
