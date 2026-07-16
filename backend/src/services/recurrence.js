// ════════════════════════════════════════════════════════════════
// Expansão de recorrência local para agendamentos (sem lib externa —
// o projeto não tem rrule/date-fns, e o conjunto suportado (diário/
// semanal/mensal, interval, byDay, count, until) não justifica a
// dependência nova). Usado quando o evento NÃO está sincronizado com o
// Google (que expande recorrência do lado dele via singleEvents=true).
//
// Descritor de regra (não é RRULE bruto, é o formato salvo em
// appointments.recurrence_rule):
//   { freq: 'daily'|'weekly'|'monthly', interval?: number,
//     byDay?: ('SU'|'MO'|'TU'|'WE'|'TH'|'FR'|'SA')[], count?: number,
//     until?: string|Date }
// ════════════════════════════════════════════════════════════════

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const MAX_ITERATIONS = 10_000

// Toda a aritmética de calendário aqui usa os getters/setters *UTC* do
// Date (não os locais) — mesmo racional do comentário em scheduler.js:
// depender do timezone do SO onde o processo Node roda faria a mesma
// recorrência gerar dias diferentes dependendo de onde o backend está
// rodando. start/end são timestamptz (instantes absolutos); tratamos o
// "dia"/"dia da semana"/"dia do mês" de uma ocorrência como o calendário
// UTC desse instante.
function startOfWeekUTC(date) {
  const d = new Date(date)
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d
}

function addMonthsClamped(date, months) {
  const d = new Date(date)
  const targetMonth = d.getUTCMonth() + months
  const day = d.getUTCDate()
  d.setUTCDate(1)
  d.setUTCMonth(targetMonth)
  const lastDayOfTargetMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
  d.setUTCDate(Math.min(day, lastDayOfTargetMonth))
  return d
}

/** Converte o descritor salvo em `recurrence_rule` numa string RRULE (RFC5545) pro Google. */
export function ruleToGoogleRRule(rule) {
  if (!rule?.freq) return null
  const parts = [`FREQ=${rule.freq.toUpperCase()}`]
  if (rule.interval && rule.interval > 1) parts.push(`INTERVAL=${rule.interval}`)
  if (rule.freq === 'weekly' && rule.byDay?.length) parts.push(`BYDAY=${rule.byDay.join(',')}`)
  if (rule.count) parts.push(`COUNT=${rule.count}`)
  else if (rule.until) parts.push(`UNTIL=${new Date(rule.until).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`)
  return `RRULE:${parts.join(';')}`
}

/**
 * Expande uma regra de recorrência em ocorrências concretas {start, end}.
 * Sempre inclui a primeira ocorrência em `start`/`end` (mesmo que `rule`
 * seja null/sem freq — nesse caso retorna só essa ocorrência única).
 */
export function expandRecurrence({ start, end, rule, horizonEnd, maxOccurrences = 200 }) {
  const startDate = new Date(start)
  const endDate = new Date(end)
  const duration = endDate.getTime() - startDate.getTime()

  if (!rule?.freq) return [{ start: startDate, end: endDate }]

  const interval = Math.max(1, rule.interval || 1)
  const until = rule.until ? new Date(rule.until) : null
  const count = rule.count || null
  const horizon = horizonEnd ? new Date(horizonEnd) : null
  const makeOcc = (d) => ({ start: new Date(d), end: new Date(d.getTime() + duration) })

  const exceedsLimit = (d) => (until && d > until) || (horizon && d > horizon)

  const occurrences = []

  if (rule.freq === 'daily') {
    for (let i = 0; i < MAX_ITERATIONS && occurrences.length < maxOccurrences; i++) {
      const d = new Date(startDate.getTime() + i * interval * DAY_MS)
      if (exceedsLimit(d)) break
      occurrences.push(makeOcc(d))
      if (count && occurrences.length >= count) break
    }
  } else if (rule.freq === 'monthly') {
    for (let i = 0; i < MAX_ITERATIONS && occurrences.length < maxOccurrences; i++) {
      const d = addMonthsClamped(startDate, i * interval)
      if (exceedsLimit(d)) break
      occurrences.push(makeOcc(d))
      if (count && occurrences.length >= count) break
    }
  } else if (rule.freq === 'weekly') {
    const byDay = rule.byDay?.length ? rule.byDay : [WEEKDAY_CODES[startDate.getUTCDay()]]
    const weekdayIndexes = byDay
      .map((code) => WEEKDAY_CODES.indexOf(code))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)
    const firstWeekStart = startOfWeekUTC(startDate)

    outer:
    for (let weekOffset = 0; weekOffset < MAX_ITERATIONS; weekOffset++) {
      for (const weekdayIndex of weekdayIndexes) {
        const d = new Date(firstWeekStart.getTime() + (weekOffset * interval * 7 + weekdayIndex) * DAY_MS)
        // preserva o horário original (startOfWeekUTC zera a hora)
        d.setUTCHours(startDate.getUTCHours(), startDate.getUTCMinutes(), startDate.getUTCSeconds(), startDate.getUTCMilliseconds())
        if (d < startDate) continue
        if (exceedsLimit(d)) break outer
        occurrences.push(makeOcc(d))
        if (occurrences.length >= maxOccurrences) break outer
        if (count && occurrences.length >= count) break outer
      }
    }
  } else {
    return [{ start: startDate, end: endDate }]
  }

  return occurrences
}
