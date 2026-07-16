import { describe, it, expect } from 'vitest'
import { expandRecurrence, ruleToGoogleRRule } from '../recurrence.js'

describe('services/recurrence', () => {
  describe('expandRecurrence', () => {
    it('sem rule, retorna só a ocorrência única (start/end originais)', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: null })
      expect(occ).toHaveLength(1)
      expect(occ[0].start.toISOString()).toBe(start)
      expect(occ[0].end.toISOString()).toBe(end)
    })

    it('diário com count: gera exatamente count ocorrências, uma por dia, preservando a duração', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'daily', count: 5 } })
      expect(occ).toHaveLength(5)
      expect(occ[0].start.toISOString()).toBe('2026-08-03T10:00:00.000Z')
      expect(occ[4].start.toISOString()).toBe('2026-08-07T10:00:00.000Z')
      for (const o of occ) expect(o.end.getTime() - o.start.getTime()).toBe(60 * 60 * 1000)
    })

    it('diário com interval > 1: pula dias conforme o intervalo', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'daily', interval: 2, count: 3 } })
      expect(occ.map((o) => o.start.toISOString())).toEqual([
        '2026-08-03T10:00:00.000Z',
        '2026-08-05T10:00:00.000Z',
        '2026-08-07T10:00:00.000Z',
      ])
    })

    it('semanal com byDay: gera só nos dias da semana indicados, a partir da data de início', () => {
      // 2026-08-03 é uma segunda-feira
      const start = '2026-08-03T09:00:00.000Z'
      const end = '2026-08-03T09:30:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'weekly', byDay: ['MO', 'WE'], count: 4 } })
      expect(occ.map((o) => o.start.toISOString())).toEqual([
        '2026-08-03T09:00:00.000Z', // seg
        '2026-08-05T09:00:00.000Z', // qua
        '2026-08-10T09:00:00.000Z', // seg seguinte
        '2026-08-12T09:00:00.000Z', // qua seguinte
      ])
    })

    it('semanal sem byDay: repete no mesmo dia da semana do início', () => {
      const start = '2026-08-04T09:00:00.000Z' // terça
      const end = '2026-08-04T09:30:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'weekly', count: 3 } })
      expect(occ.map((o) => o.start.toISOString())).toEqual([
        '2026-08-04T09:00:00.000Z',
        '2026-08-11T09:00:00.000Z',
        '2026-08-18T09:00:00.000Z',
      ])
    })

    it('mensal: repete no mesmo dia do mês, clampando quando o mês não tem esse dia', () => {
      const start = '2026-01-31T12:00:00.000Z'
      const end = '2026-01-31T13:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'monthly', count: 4 } })
      // fev/2026 não tem 31 → clampa pro último dia (28, não bissexto)
      expect(occ.map((o) => o.start.toISOString())).toEqual([
        '2026-01-31T12:00:00.000Z',
        '2026-02-28T12:00:00.000Z',
        '2026-03-31T12:00:00.000Z',
        '2026-04-30T12:00:00.000Z',
      ])
    })

    it('respeita until em vez de count quando não há count', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'daily', until: '2026-08-05T10:00:00.000Z' } })
      expect(occ).toHaveLength(3)
      expect(occ[occ.length - 1].start.toISOString()).toBe('2026-08-05T10:00:00.000Z')
    })

    it('respeita horizonEnd como teto de segurança mesmo sem count/until', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({
        start, end, rule: { freq: 'daily' },
        horizonEnd: '2026-08-06T10:00:00.000Z',
        maxOccurrences: 200,
      })
      expect(occ).toHaveLength(4)
    })

    it('respeita maxOccurrences como teto mesmo com count maior', () => {
      const start = '2026-08-03T10:00:00.000Z'
      const end = '2026-08-03T11:00:00.000Z'
      const occ = expandRecurrence({ start, end, rule: { freq: 'daily', count: 50 }, maxOccurrences: 3 })
      expect(occ).toHaveLength(3)
    })
  })

  describe('ruleToGoogleRRule', () => {
    it('retorna null sem freq', () => {
      expect(ruleToGoogleRRule(null)).toBeNull()
      expect(ruleToGoogleRRule({})).toBeNull()
    })

    it('monta RRULE básico', () => {
      expect(ruleToGoogleRRule({ freq: 'daily', count: 5 })).toBe('RRULE:FREQ=DAILY;COUNT=5')
    })

    it('inclui INTERVAL quando > 1', () => {
      expect(ruleToGoogleRRule({ freq: 'weekly', interval: 2, count: 3 })).toBe('RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3')
    })

    it('inclui BYDAY só pra weekly', () => {
      expect(ruleToGoogleRRule({ freq: 'weekly', byDay: ['MO', 'WE'], count: 4 }))
        .toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4')
      expect(ruleToGoogleRRule({ freq: 'monthly', byDay: ['MO'], count: 4 }))
        .toBe('RRULE:FREQ=MONTHLY;COUNT=4')
    })

    it('usa UNTIL quando não há count', () => {
      expect(ruleToGoogleRRule({ freq: 'daily', until: '2026-08-05T10:00:00.000Z' }))
        .toBe('RRULE:FREQ=DAILY;UNTIL=20260805T100000Z')
    })
  })
})
