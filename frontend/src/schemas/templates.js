import { z } from 'zod'

// Espelha backend/src/routes/templates.js
export const templateSchema = z.object({
  name: z.string().trim().min(1, 'Nome e conteúdo são obrigatórios.').max(200, 'Nome muito longo.'),
  category: z.string().trim().min(1).max(100).optional(),
  content: z.string().trim().min(1, 'Nome e conteúdo são obrigatórios.').max(4000, 'Conteúdo muito longo (máx. 4000 caracteres).'),
})

export const templateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome da categoria.').max(50, 'Nome muito longo.'),
})
