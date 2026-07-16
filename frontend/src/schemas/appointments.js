import { z } from 'zod'

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

// Espelha backend/src/routes/appointments.js (recurrenceSchema)
export const recurrenceSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly']),
  interval: z.number().int().positive().max(365).optional(),
  byDay: z.array(z.enum(WEEKDAY_CODES)).optional(),
  count: z.number().int().positive().max(500).optional(),
  until: z.string().optional(),
}).nullish()

const guestSchema = z.union([
  z.string().email('E-mail de convidado inválido.'),
  z.object({ email: z.string().email('E-mail de convidado inválido.'), name: z.string().optional() }),
])

export const reminderSchema = z.object({
  method: z.enum(['popup', 'email']).default('popup'),
  minutesBefore: z.number().int().min(0).max(40320),
})

// Espelha backend/src/routes/appointments.js (createSchema)
export const eventSchema = z.object({
  title: z.string().trim().min(1, 'Informe um título.'),
  leadName: z.string().trim().optional(),
  leadId: z.string().uuid().optional(),
  start: z.string().min(1, 'Informe a data/hora de início.'),
  end: z.string().min(1, 'Informe a data/hora de término.'),
  description: z.string().trim().optional(),
  location: z.string().trim().optional(),
  color: z.string().optional(),
  allDay: z.boolean().optional(),
  timezone: z.string().optional(),
  guests: z.array(guestSchema).optional(),
  reminders: z.array(reminderSchema).optional(),
  recurrence: recurrenceSchema,
}).refine((d) => new Date(d.end).getTime() >= new Date(d.start).getTime(), {
  message: 'O término não pode ser antes do início.', path: ['end'],
})
