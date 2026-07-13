import { test, expect } from '@playwright/test'

// Objetivo original: confirmar que uma mensagem de webhook do WhatsApp (inbound)
// aparece ao vivo na caixa de entrada/chat da plataforma.
//
// Fora de escopo neste arquivo: efetivamente disparar um POST para
// /webhooks/evolution ou /webhooks/meta e observar a UI atualizar em tempo real.
// Isso exigiria: (1) um segredo real de webhook (EVOLUTION_WEBHOOK_SECRET /
// verificação HMAC do Meta) configurado no ambiente de teste, e (2) uma linha de
// integração/tenant de teste já conectada a um canal do WhatsApp real — nenhum
// dos dois está disponível de forma segura aqui (o Supabase de produção é usado
// também em dev, então não há fixtures de teste garantidas). Forjar esses dados
// ou o request faria o teste "passar" sem validar nada real, então preferimos
// deixar essa parte documentada como pendência em vez de fingir cobertura.
//
// O que É testado abaixo: que a tela de atendimentos (ChatView, rota /chat)
// carrega corretamente para um usuário autenticado — lista de conversas (ou
// estado vazio) e o estado "nenhuma conversa selecionada". Isso cobre a
// estrutura da UI que uma mensagem de webhook precisaria atualizar, sem
// depender de segredos/infra de webhook reais.

test.describe('Caixa de entrada / chat (UI estrutural)', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    test.skip(!email || !password, 'Defina E2E_EMAIL e E2E_PASSWORD no .env para rodar este teste')

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('.submit-btn').click()
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 15000 })

    await page.goto('/chat')
  })

  test('carrega a tela de atendimentos com a lista de conversas', async ({ page }) => {
    await expect(page.locator('.chat-layout')).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('Atendimentos')).toBeVisible()

    // Ou aparecem conversas reais, ou o estado vazio — os dois confirmam que a
    // lista terminou de carregar (sem travar em loading infinito).
    const conv = page.locator('.conv-item').first()
    const emptyState = page.getByText('Nenhuma conversa encontrada')
    await expect(conv.or(emptyState)).toBeVisible({ timeout: 15000 })
  })

  test('mostra o estado "selecione um atendimento" quando nenhuma conversa está aberta', async ({ page }) => {
    await expect(page.locator('.chat-layout')).toBeVisible({ timeout: 15000 })

    // Sem clicar em nenhuma conversa da lista, a área principal deve mostrar o
    // placeholder — nunca uma conversa aberta sozinha.
    await expect(page.locator('.chat-empty')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.chat-empty')).toContainText('Selecione um atendimento')
  })

  test('o filtro de conversas abre e mostra as opções esperadas', async ({ page }) => {
    await expect(page.locator('.chat-layout')).toBeVisible({ timeout: 15000 })

    await page.getByRole('button', { name: 'Filtros' }).click()
    await expect(page.getByText('Mostrar todos')).toBeVisible()
    await expect(page.getByText('Somente não lidos')).toBeVisible()
    await expect(page.getByText('STATUS')).toBeVisible()
  })
})
