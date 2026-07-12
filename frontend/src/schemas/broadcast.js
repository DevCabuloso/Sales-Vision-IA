import { z } from 'zod'

const INTERVAL_MESSAGE = 'O intervalo máximo deve ser maior ou igual ao mínimo.'
const intervalRefine = (d) =>
  d.min_interval_seconds == null || d.max_interval_seconds == null || d.max_interval_seconds >= d.min_interval_seconds

// Espelha backend/src/routes/broadcast.js (campaignBaseSchema + campaignSchema)
export const campaignSchema = z.object({
  name: z.string().trim().min(1, 'Nome e mensagem são obrigatórios.').max(200, 'Nome muito longo.'),
  content: z.string().trim().min(1, 'Nome e mensagem são obrigatórios.').max(4000, 'Mensagem muito longa.'),
  template_id: z.string().uuid().optional().nullable(),
  scheduled_at: z.string().optional().nullable(),
  min_interval_seconds: z.number().int().min(1).max(600).optional(),
  max_interval_seconds: z.number().int().min(1).max(600).optional(),
}).refine(intervalRefine, { message: INTERVAL_MESSAGE, path: ['max_interval_seconds'] })

export const intervalSchema = z.object({
  min_interval_seconds: z.number().int().min(1).max(600).optional(),
  max_interval_seconds: z.number().int().min(1).max(600).optional(),
}).refine(intervalRefine, { message: INTERVAL_MESSAGE, path: ['max_interval_seconds'] })

// Espelha backend/src/routes/broadcast.js (contactSchema — POST /campaigns/:id/contacts)
export const importContactsSchema = z.object({
  contacts: z.array(z.object({
    name: z.string().optional(),
    phone: z.string().min(8, 'Telefone inválido.').max(20, 'Telefone inválido.'),
  })).min(1, 'Nenhum contato válido para importar.').max(5000, 'Máximo de 5000 contatos por importação.'),
})
