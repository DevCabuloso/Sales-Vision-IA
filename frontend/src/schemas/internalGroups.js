import { z } from 'zod'

// Espelha backend/src/routes/internal-groups.js (createGroupSchema)
export const internalGroupSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.'),
  member_ids: z.array(z.string()).optional(),
})
