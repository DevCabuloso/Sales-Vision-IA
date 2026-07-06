-- ─── ALTER MESSAGES: suporte a mídia (imagem, vídeo, áudio, documento, figurinha) ───
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS media_url      TEXT,
  ADD COLUMN IF NOT EXISTS media_type     TEXT,   -- image | video | audio | document | sticker
  ADD COLUMN IF NOT EXISTS media_mimetype TEXT,
  ADD COLUMN IF NOT EXISTS media_filename TEXT;
