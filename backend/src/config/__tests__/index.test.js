import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// impede que 'dotenv/config' leia o .env real do disco — sem isso, os cenários
// de "variável ausente" ficariam reféns do que existir no .env da máquina atual.
vi.mock('dotenv/config', () => ({}))

const ORIGINAL_ENV = { ...process.env }

async function loadConfig(envOverrides) {
  vi.resetModules()
  process.env = { ...ORIGINAL_ENV, ...envOverrides }
  const mod = await import('../index.js')
  return mod.config
}

describe('config/index.js', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
    vi.restoreAllMocks()
  })

  describe('required()', () => {
    it('usa o valor de env quando presente', async () => {
      const config = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'meu-segredo', ENCRYPTION_KEY: 'a'.repeat(64) })
      expect(config.jwt.secret).toBe('meu-segredo')
    })

    it('fora de produção, sem env e com fallback: avisa e usa o fallback', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const config = await loadConfig({ NODE_ENV: 'development', JWT_SECRET: '', ENCRYPTION_KEY: 'a'.repeat(64) })
      expect(config.jwt.secret).toBe('troque-este-segredo-em-producao')
      expect(warnSpy).not.toHaveBeenCalled() // com fallback definido, não avisa
    })

    it('fora de produção, sem env e sem fallback: avisa e retorna undefined', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const config = await loadConfig({ NODE_ENV: 'development', JWT_SECRET: 'x', ENCRYPTION_KEY: '' })
      expect(config.encryptionKey).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('ENCRYPTION_KEY'))
    })

    it('em produção, sem env: lança erro (mesmo havendo fallback)', async () => {
      await expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: '', ENCRYPTION_KEY: 'a'.repeat(64) }))
        .rejects.toThrow('JWT_SECRET não definida')
    })

    it('em produção, sem fallback e sem env: lança erro', async () => {
      await expect(loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x', ENCRYPTION_KEY: '' }))
        .rejects.toThrow('ENCRYPTION_KEY não definida')
    })
  })

  describe('valores derivados', () => {
    it('usa a porta padrão 3000 quando PORT não é definida', async () => {
      const config = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), PORT: '' })
      expect(config.port).toBe(3000)
      expect(config.backendUrl).toBe('http://localhost:3000')
    })

    it('deriva backendUrl a partir de PORT quando BACKEND_URL não é definida', async () => {
      const config = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), PORT: '4000', BACKEND_URL: '' })
      expect(config.backendUrl).toBe('http://localhost:4000')
    })

    it('respeita BACKEND_URL explícito mesmo com PORT diferente', async () => {
      const config = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), PORT: '4000', BACKEND_URL: 'https://api.exemplo.com' })
      expect(config.backendUrl).toBe('https://api.exemplo.com')
    })

    it('DB_SSL: ausente = true; "true" = true; qualquer outro valor = false', async () => {
      const c1 = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), DB_SSL: '' })
      expect(c1.db.ssl).toBe(true)
      const c2 = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), DB_SSL: 'true' })
      expect(c2.db.ssl).toBe(true)
      const c3 = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), DB_SSL: 'false' })
      expect(c3.db.ssl).toBe(false)
    })

    it('parseia os valores numéricos de billing corretamente', async () => {
      const config = await loadConfig({
        NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64),
        TRIAL_PLAN_PRICE_CENTS: '9900', TRIAL_DAYS: '14',
      })
      expect(config.billing.trialPlanPriceCents).toBe(9900)
      expect(config.billing.trialDays).toBe(14)
    })

    it('usa os defaults de billing quando não configurados', async () => {
      const config = await loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'x', ENCRYPTION_KEY: 'a'.repeat(64), TRIAL_PLAN_PRICE_CENTS: '', TRIAL_DAYS: '', TRIAL_PLAN_TIER: '' })
      expect(config.billing.trialPlanPriceCents).toBe(39700)
      expect(config.billing.trialDays).toBe(7)
      expect(config.billing.trialPlanTier).toBe('pro')
    })
  })
})
