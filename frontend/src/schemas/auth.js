import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Preencha e-mail e senha.').email('Preencha e-mail e senha.'),
  password: z.string().min(1, 'Preencha e-mail e senha.'),
})

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'Preencha nome, empresa, e-mail e senha.'),
  companyName: z.string().trim().min(2, 'Preencha nome, empresa, e-mail e senha.'),
  email: z.string().trim().min(1, 'Preencha nome, empresa, e-mail e senha.').email('Preencha nome, empresa, e-mail e senha.'),
  password: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.'),
})

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, 'Informe a senha atual.'),
    newPw: z.string().min(8, 'Nova senha deve ter pelo menos 8 caracteres.'),
    confirm: z.string(),
  })
  .refine((data) => data.newPw === data.confirm, {
    message: 'Confirmação de senha não confere.',
    path: ['confirm'],
  })
