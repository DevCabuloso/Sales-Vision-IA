import { z } from 'zod'

// Espelha backend/src/routes/contacts.js (schema)
export const contactSchema = z.object({
  name: z.string().trim().max(200, 'Nome muito longo.').optional().nullable(),
  phone: z.string().min(1, 'Telefone é obrigatório.').min(6, 'Telefone inválido.').max(30, 'Telefone inválido.'),
  email: z.union([z.literal(''), z.string().trim().email('E-mail inválido.')]).optional().nullable(),
  tags: z.array(z.string()).optional(),
  stage: z.string().optional(),
})
