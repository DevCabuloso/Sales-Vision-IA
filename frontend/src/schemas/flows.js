import { z } from 'zod'

// Espelha backend/src/routes/flows.js (createSchema)
export const createFlowSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.'),
  channel_id: z.string().min(1).nullable().optional(),
  trigger_keywords: z.array(z.string()).optional(),
})
