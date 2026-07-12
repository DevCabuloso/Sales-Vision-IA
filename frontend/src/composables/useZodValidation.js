// Ponte entre schemas Zod e o padrão de validação usado nas views (mesma mensagem
// do primeiro issue, no mesmo espírito do `safeParse` já usado no backend).

export function validateForm(schema, data) {
  const parsed = schema.safeParse(data)
  if (parsed.success) return { success: true, data: parsed.data, error: null }
  return { success: false, data: null, error: parsed.error.issues[0].message }
}

// Adaptador para o prop `:rules` do Vuetify: valida um único campo e retorna
// `true` (válido) ou a mensagem de erro.
export function zodRule(schema) {
  return (value) => {
    const parsed = schema.safeParse(value)
    return parsed.success || parsed.error.issues[0].message
  }
}
