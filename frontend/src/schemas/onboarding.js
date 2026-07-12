import { z } from 'zod'

// Valida cada membro de equipe preenchido no wizard de onboarding antes de
// criar o operador (espelha nome/e-mail exigidos por backend/src/routes/operators.js).
export const teamMemberSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome de cada membro da equipe.'),
  email: z.string().trim().min(1, 'Informe o e-mail de cada membro da equipe.').email('E-mail inválido para um dos membros da equipe.'),
  role: z.enum(['admin', 'agent']),
})

export const queueNameSchema = z.object({
  name: z.string().trim().min(1, 'Nome da fila é obrigatório.').max(100, 'Nome da fila muito longo.'),
})

export const aiSetupSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome para a IA.'),
  openaiKey: z.string().trim().min(1, 'Cole sua chave da API OpenAI para continuar.').min(10, 'Chave da API OpenAI inválida (mínimo 10 caracteres).'),
})
