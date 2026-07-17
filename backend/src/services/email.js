import nodemailer from 'nodemailer'
import { config } from '../config/index.js'

let transporter = null
function getTransporter() {
  if (!config.smtp.host) return null
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    })
  }
  return transporter
}

/**
 * Envia um e-mail via SMTP genérico. Sem SMTP_HOST configurado no .env,
 * vira um no-op logado — usado pelo relatório agendado (scheduler.js) e
 * qualquer outra feature que precise notificar por e-mail no futuro.
 * Nunca lança erro (mesmo padrão defensivo de logUsage/logAudit).
 */
export async function sendEmail({ to, subject, html }) {
  const t = getTransporter()
  if (!t) {
    console.warn(`[email] SMTP não configurado — e-mail "${subject}" para ${to} não foi enviado.`)
    return { sent: false, reason: 'smtp_not_configured' }
  }
  try {
    await t.sendMail({ from: config.smtp.from || config.smtp.user, to, subject, html })
    return { sent: true }
  } catch (e) {
    console.error('[email] falha ao enviar:', e.message)
    return { sent: false, reason: e.message }
  }
}
