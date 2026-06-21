import { createClient } from '@supabase/supabase-js'

// URL + anon key são PÚBLICAS (podem ir pro bundle do front).
// Usadas só para Realtime — toda escrita continua passando pelo backend.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  url && anonKey
    ? createClient(url, anonKey, { auth: { persistSession: false } })
    : null

if (!supabase) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes — Realtime desativado.')
}
