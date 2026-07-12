import { describe, it, expect } from 'vitest'
import { sanitizeHtml } from '../sanitizeHtml.js'

describe('sanitizeHtml', () => {
  it('retorna string vazia para entrada vazia/nula', () => {
    expect(sanitizeHtml('')).toBe('')
    expect(sanitizeHtml(null)).toBe('')
    expect(sanitizeHtml(undefined)).toBe('')
  })

  it('mantém tags permitidas como <code> e <strong>', () => {
    const out = sanitizeHtml('texto <code>x.js</code> e <strong>negrito</strong>')
    expect(out).toContain('<code>x.js</code>')
    expect(out).toContain('<strong>negrito</strong>')
  })

  it('remove tags <script>', () => {
    const out = sanitizeHtml('<script>alert(1)</script>texto')
    expect(out).not.toContain('<script>')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('texto')
  })

  it('remove atributos de evento inline (onerror, onclick)', () => {
    const out = sanitizeHtml('<img src=x onerror="alert(1)">texto<a href="#" onclick="alert(2)">link</a>')
    expect(out).not.toContain('onerror')
    expect(out).not.toContain('onclick')
  })

  it('remove URLs javascript: em atributos href', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(out).not.toContain('javascript:')
  })

  it('remove tags não permitidas pela allowlist (ex: <iframe>, <style>)', () => {
    const out = sanitizeHtml('<iframe src="//evil.com"></iframe><style>body{}</style>texto')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<style')
    expect(out).toContain('texto')
  })

  it('respeita ALLOWED_TAGS customizado passado via options', () => {
    const out = sanitizeHtml('<b>x</b><code>y</code>', { ALLOWED_TAGS: ['b'] })
    expect(out).toContain('<b>x</b>')
    expect(out).not.toContain('<code>')
  })
})
