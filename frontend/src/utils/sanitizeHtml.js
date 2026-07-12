import DOMPurify from 'dompurify'

const DEFAULT_OPTIONS = {
  ALLOWED_TAGS: ['code', 'strong', 'em', 'b', 'i', 'br', 'a', 'p', 'ul', 'ol', 'li'],
  ALLOWED_ATTR: ['href', 'target', 'rel'],
}

export function sanitizeHtml(dirty, options = {}) {
  if (!dirty) return ''
  return DOMPurify.sanitize(dirty, { ...DEFAULT_OPTIONS, ...options })
}
