import { createClient } from '@supabase/supabase-js'
import ws from 'ws'
import { config } from '../config/index.js'

if (!config.supabase.url || !config.supabase.serviceKey) {
  console.warn('[supabase] SUPABASE_URL ou SUPABASE_SERVICE_KEY ausentes no .env')
}

// service_role: acesso total no backend (ignora RLS). NUNCA exponha esta key no front.
export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  }
)

/** Helper: lança erro padronizado quando o supabase retorna { error }. */
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message)
  return data
}
