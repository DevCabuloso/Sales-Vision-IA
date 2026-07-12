import { z } from 'zod'

/** Política única de senha mínima, usada em todo endpoint que define/troca senha. */
export const passwordSchema = z.string().min(8, 'A senha deve ter pelo menos 8 caracteres.')
