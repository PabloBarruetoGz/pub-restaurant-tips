import { z } from 'zod'

const envSchema = z.object({
  APP_BASE_PATH: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL no esta configurado.'),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
})

export const config = envSchema.parse(process.env)
export const appBasePath = config.APP_BASE_PATH?.replace(/\/$/, '') || ''

export const isProduction = config.NODE_ENV === 'production'
