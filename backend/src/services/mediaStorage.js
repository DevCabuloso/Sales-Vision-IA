import { randomUUID } from 'node:crypto'
import { supabase } from '../db/supabase.js'
import { config } from '../config/index.js'

const EXT_BY_MIME = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'application/pdf': 'pdf',
}

/** Faz upload de um arquivo de mídia de chat (buffer) para o Supabase Storage e retorna a URL pública. */
export async function uploadChatMedia(tenantId, buffer, mimetype, filename) {
  const extFromName = filename?.includes('.') ? filename.split('.').pop() : null
  const ext = EXT_BY_MIME[mimetype] || extFromName || 'bin'
  const path = `${tenantId}/${randomUUID()}.${ext}`

  const { error } = await supabase.storage
    .from(config.supabase.mediaBucket)
    .upload(path, buffer, { contentType: mimetype || 'application/octet-stream', upsert: false })
  if (error) throw new Error(`Falha ao salvar mídia no storage: ${error.message}`)

  const { data } = supabase.storage.from(config.supabase.mediaBucket).getPublicUrl(path)
  return data.publicUrl
}
