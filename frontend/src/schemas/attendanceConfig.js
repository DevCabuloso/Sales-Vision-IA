import { z } from 'zod'

// Espelham backend/src/routes/labels.js, queues.js e business-hours.js
export const labelSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(50, 'Nome muito longo.'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida.'),
})

export const queueSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(100, 'Nome muito longo.'),
  description: z.string().trim().max(300, 'Descrição muito longa.').optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida.'),
  operator_ids: z.array(z.string()).optional(),
})

const dayScheduleSchema = z.object({
  open: z.boolean(),
  start: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:mm).'),
  end: z.string().regex(/^\d{2}:\d{2}$/, 'Horário inválido (use HH:mm).'),
})

export const businessHoursSchema = z.object({
  enabled: z.boolean().optional(),
  timezone: z.string().min(1).optional(),
  schedule: z.record(z.string(), dayScheduleSchema).optional(),
  off_message: z.string().optional(),
})
