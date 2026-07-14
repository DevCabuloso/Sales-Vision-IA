import { supabase, unwrap } from '../db/supabase.js'

// Cria o aviso de vencimento pra um tenant, se ainda não existir um não
// resolvido criado hoje (evita duplicar quando chamado várias vezes seguidas
// — seja pelos ~3 ticks do scheduler dentro do mesmo minuto, seja por cliques
// repetidos no botão "Emitir Alerta" do painel admin). Retorna true se criou.
export async function createBillingReminderNotification(tenant, message) {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const existing = unwrap(
    await supabase.from('notifications').select('id')
      .eq('tenant_id', tenant.id).eq('type', 'billing_reminder')
      .is('resolved_at', null)
      .gte('created_at', todayStart.toISOString())
      .limit(1)
  ) || []
  if (existing.length) return false

  // O SELECT acima não é atômico com o INSERT abaixo — duas chamadas quase
  // simultâneas (ticks do scheduler + clique manual no painel, por exemplo)
  // podiam passar as duas pelo SELECT antes de qualquer INSERT confirmar,
  // duplicando o aviso no sino. O índice único parcial
  // (migration_notification_billing_reminder_unique.sql) torna a segunda
  // tentativa do mesmo dia um erro de constraint em vez de uma duplicata —
  // aqui só tratamos esse erro como "já existe" em vez de propagar.
  const { error } = await supabase.from('notifications').insert({
    tenant_id: tenant.id,
    user_id: tenant.billing_notify_user_id,
    type: 'billing_reminder',
    title: 'Mensalidade próxima do vencimento',
    message,
  })
  if (error) {
    if (error.code === '23505') return false // unique_violation — outra chamada concorrente já criou
    throw new Error(error.message)
  }
  return true
}
