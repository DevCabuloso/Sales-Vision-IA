import { z } from 'zod'

// Espelha backend/src/routes/leads.js (createSchema)
export const createLeadSchema = z.object({
  name: z.string().trim().optional(),
  phone: z.string().min(1, 'Telefone é obrigatório.').min(8, 'Telefone inválido.'),
  intention: z.string().trim().optional(),
})
