import 'dotenv/config'

function required(name, fallback) {
  const v = process.env[name] ?? fallback
  if (v === undefined) {
    console.warn(`[config] variável ${name} não definida no .env`)
  }
  return v
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  // URL do front (para montar redirects de OAuth e CORS)
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  backendUrl: process.env.BACKEND_URL || `http://localhost:${parseInt(process.env.PORT || '3000', 10)}`,

  db: {
    connectionString:
      process.env.DATABASE_URL ||
      'postgres://sdr:sdr@localhost:5432/sdr',
    // SSL ligado por padrão (Supabase exige). Desligue com DB_SSL=false
    // se um dia voltar a usar um Postgres local sem SSL.
    ssl: process.env.DB_SSL ? process.env.DB_SSL === 'true' : true,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceKey: process.env.SUPABASE_SERVICE_KEY, // service_role (apenas backend)
  },

  // segredo do JWT de sessão
  jwt: {
    secret: required('JWT_SECRET', 'troque-este-segredo-em-producao'),
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // chave de 32 bytes (hex de 64 chars) para AES-256-GCM das credenciais
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

  // Meta WhatsApp: a versão da Graph API é global; tokens/phoneId são por-tenant
  meta: {
    graphVersion: process.env.META_GRAPH_VERSION || 'v21.0',
    verifyToken: process.env.META_WEBHOOK_VERIFY_TOKEN || 'sdr-verify',
  },

  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL || '',
    apiKey: process.env.EVOLUTION_API_KEY || '',
  },
}
