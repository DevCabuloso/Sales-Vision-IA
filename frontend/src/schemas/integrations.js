import { z } from 'zod'

// Espelham backend/src/routes/integrations.js
export const googleSetupSchema = z.object({
  clientId: z.string().min(10, 'Client ID inválido'),
  clientSecret: z.string().min(10, 'Client Secret inválido'),
})

export const metaConnectSchema = z.object({
  accessToken: z.string().min(10, 'Access Token inválido (mínimo 10 caracteres).'),
  phoneNumberId: z.string().min(3, 'Phone Number ID inválido.'),
  wabaId: z.string().trim().optional(),
})

export const evolutionConnectSchema = z.object({
  baseUrl: z.string().trim().min(1, 'Informe a URL base.').url('URL base inválida.'),
  apiKey: z.string().min(3, 'API Key inválida.'),
  instance: z.string().trim().min(1, 'Informe o nome da instância.'),
})
