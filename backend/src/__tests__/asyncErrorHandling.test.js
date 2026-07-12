import { describe, it, expect } from 'vitest'
import express from 'express'
import 'express-async-errors'
import request from 'supertest'

// Express 4 não encaminha rejeições de handlers async para o error middleware
// sozinho — sem 'express-async-errors', o teste abaixo pendura a resposta
// (nada chama res.*) e a rejeição vira unhandledRejection, que hoje derruba
// o processo Node inteiro (ver server.js). Este teste garante que o import
// global em app.js realmente resolve isso: o erro cai no error handler.
function buildApp() {
  const app = express()

  app.get('/boom', async () => {
    throw new Error('falha simulada do supabase')
  })

  app.get('/ok', async (req, res) => {
    res.json({ ok: true })
  })

  app.use((err, req, res, _next) => {
    res.status(500).json({ error: 'Erro interno do servidor.' })
  })

  return app
}

describe('express-async-errors (proteção contra crash em handlers async)', () => {
  it('encaminha rejeição de handler async para o error middleware em vez de pendurar a resposta', async () => {
    const app = buildApp()
    const res = await request(app).get('/boom')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Erro interno do servidor.' })
  })

  it('não afeta handlers async que resolvem normalmente', async () => {
    const app = buildApp()
    const res = await request(app).get('/ok')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
  })
})
