import { z } from 'zod'

// Espelha backend/src/routes/billing.js (signupSchema)
export const trialSignupSchema = z.object({
  name: z.string().trim().min(2, 'Preencha nome, empresa, e-mail e senha.'),
  companyName: z.string().trim().min(2, 'Preencha nome, empresa, e-mail e senha.'),
  email: z.string().trim().min(1, 'Preencha nome, empresa, e-mail e senha.').email('Preencha nome, empresa, e-mail e senha.'),
  phone: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().trim().min(8, 'Telefone inválido.').optional()
  ),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
})
