import { z } from 'zod'

// Espelha backend/src/routes/operators.js (schema)
export const operatorSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(100, 'Nome muito longo.'),
  email: z.string().trim().min(1, 'Informe o e-mail.').email('E-mail inválido.'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres.').optional(),
})

export const operatorResetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
})
