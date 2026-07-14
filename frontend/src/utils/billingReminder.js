// Lembrete visual de vencimento de mensalidade (não bloqueia acesso, só avisa
// o dono no painel — a cobrança em si continua manual).
const DAY_MS = 24 * 60 * 60 * 1000

export function billingReminderInfo(nextBillingAt, now = new Date()) {
  if (!nextBillingAt) return { label: 'Sem vencimento definido', color: 'grey', days: null }

  const diffDays = Math.ceil((new Date(nextBillingAt).getTime() - now.getTime()) / DAY_MS)

  if (diffDays < 0) return { label: `Vencido há ${Math.abs(diffDays)}d`, color: 'error', days: diffDays }
  if (diffDays === 0) return { label: 'Vence hoje', color: 'error', days: diffDays }
  if (diffDays <= 7) return { label: `Vence em ${diffDays}d`, color: 'warning', days: diffDays }
  return { label: `Vence em ${diffDays}d`, color: 'success', days: diffDays }
}
