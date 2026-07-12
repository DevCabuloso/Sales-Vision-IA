import { z } from 'zod'

// Espelha backend/src/routes/custom-apis.js
export const customApiSchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome.').max(100, 'Nome muito longo.'),
  base_url: z.string().trim().min(1, 'Informe a URL base.').url('URL base inválida.'),
  api_key: z.string().trim().optional().nullable(),
  model: z.string().trim().optional().nullable(),
  provider: z.enum(['openai', 'claude', 'gemini', 'deepseek', 'custom']).optional(),
})
