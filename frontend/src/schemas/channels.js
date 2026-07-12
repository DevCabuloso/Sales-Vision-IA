import { z } from 'zod'

// Espelha backend/src/routes/channels.js (createSchema)
export const channelNameSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(60, 'Nome muito longo (máx. 60 caracteres).'),
})

// Espelha backend/src/routes/channels.js (PATCH /:id/settings — sem zod lá,
// mas a rota exige nome não vazio na prática via `name?.trim() || null`)
export const channelSettingsSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.'),
  goodbye_message: z.string().trim().optional().nullable(),
  assigned_user_id: z.string().optional().nullable(),
  assigned_queue_id: z.string().optional().nullable(),
})
