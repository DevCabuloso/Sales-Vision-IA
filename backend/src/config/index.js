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

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://sdr:sdr@localhost:5432/sdr',
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
}
