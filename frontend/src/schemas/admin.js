import { z } from 'zod'

// Espelham backend/src/routes/admin.js

export const createOwnerSchema = z.object({
  name: z.string().trim().min(1, 'Preencha todos os campos.'),
  email: z.string().trim().min(1, 'Preencha todos os campos.').email('Preencha todos os campos.'),
  password: z.string().min(1, 'Preencha todos os campos.').min(8, 'Senha deve ter pelo menos 8 caracteres.'),
})

export const ownerResetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres.'),
})

export const editUserSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.'),
  role: z.enum(['admin', 'agent']),
})

export const createTenantUserSchema = z.object({
  email: z.string().trim().min(1, 'Preencha e-mail e senha.').email('Preencha e-mail e senha.'),
  name: z.string().trim().min(1, 'Informe o nome.'),
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres.'),
  role: z.enum(['admin', 'agent']),
})

export const userResetPasswordSchema = z.object({
  password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres.'),
})

export const updateClientSchema = z.object({
  name: z.string().trim().min(2, 'Nome deve ter pelo menos 2 caracteres.'),
  plan: z.enum(['trial', 'starter', 'pro', 'enterprise']),
  max_leads: z.number({ invalid_type_error: 'Limite de leads deve ser um número.' })
    .int().positive('Limite de leads deve ser um número positivo.'),
  billing_notify_user_id: z.string().uuid().nullable().optional(),
})

export const platformSettingsSchema = z.object({
  billing_reminder_days_before: z.number({ invalid_type_error: 'Informe um número de dias.' })
    .int().min(0, 'Não pode ser negativo.').max(30, 'No máximo 30 dias.'),
  billing_reminder_time: z.string().trim().min(1, 'Informe um horário.')
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido, use HH:MM.'),
})

export const renewClientSchema = z.object({
  next_billing_at: z.string().trim().min(1, 'Informe a data de vencimento.'),
})

export const createClientSchema = z.object({
  name: z.string().trim().min(2, 'Preencha nome, slug, e-mail e senha do admin.'),
  slug: z.string().trim().min(2, 'Preencha nome, slug, e-mail e senha do admin.')
    .regex(/^[a-z0-9-]+$/, 'Slug: apenas minúsculas, números e hífen.'),
  adminEmail: z.string().trim().min(1, 'Preencha nome, slug, e-mail e senha do admin.').email('Preencha nome, slug, e-mail e senha do admin.'),
  adminPassword: z.string().min(1, 'Preencha nome, slug, e-mail e senha do admin.').min(8, 'A senha do admin deve ter pelo menos 8 caracteres.'),
})
