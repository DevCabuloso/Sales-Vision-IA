import { z } from 'zod'

// Espelha backend/src/routes/ai-config.js (schema)
export const aiConfigSchema = z.object({
  name: z.string().trim().min(1, 'Nome da IA é obrigatório.').max(100, 'Nome muito longo.').optional(),
  model: z.string().trim().min(1, 'Selecione um modelo.').optional(),
  system_prompt: z.string().max(8000, 'Prompt do sistema muito longo (máx. 8000 caracteres).').optional().nullable(),
  main_prompt: z.string().max(8000, 'Prompt principal muito longo (máx. 8000 caracteres).').optional().nullable(),
  temperature: z.number().min(0, 'Temperatura inválida.').max(2, 'Temperatura inválida.').optional(),
  max_tokens: z.number().int('Máximo de tokens deve ser um número inteiro.').min(100, 'Mínimo de 100 tokens.').max(32000, 'Máximo de 32000 tokens.').optional(),
})
