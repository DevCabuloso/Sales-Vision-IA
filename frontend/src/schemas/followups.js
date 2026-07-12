import { z } from 'zod'

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

// Espelha backend/src/routes/followups.js (stepSchema + sequenceSchema)
const stepSchema = z.object({
  delay_days: z.number().int().min(0).max(3650),
  text: z.string().trim().min(1, 'Todas as mensagens precisam de conteúdo.').max(4000, 'Mensagem muito longa (máx. 4000 caracteres).'),
  media_url: z.string().url().optional().nullable(),
  media_type: z.string().optional().nullable(),
  media_mimetype: z.string().optional().nullable(),
  media_filename: z.string().optional().nullable(),
  send_time: z.string().regex(TIME_RE, 'Horário inválido (use HH:mm).').optional().nullable(),
})

export const followupSequenceSchema = z.object({
  name: z.string().trim().min(1, 'Informe um nome para o acompanhamento.').max(200, 'Nome muito longo.'),
  description: z.string().trim().max(2000, 'Descrição muito longa.').optional().nullable(),
  time_mode: z.enum(['general', 'individual']),
  default_send_time: z.string().regex(TIME_RE, 'Horário inválido (use HH:mm).'),
  steps: z.array(stepSchema).min(1, 'Adicione ao menos uma mensagem.').max(50, 'Máximo de 50 mensagens por acompanhamento.'),
})
