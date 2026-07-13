import { test, expect } from '@playwright/test'

// Fluxo de disparo em massa (BroadcastView), rota autenticada /broadcast.
// Exige uma sessão real — igual ao login.spec.js, pula se E2E_EMAIL/E2E_PASSWORD
// não estiverem definidas no .env.

test.describe('Broadcast (disparo em massa)', () => {
  test.beforeEach(async ({ page }) => {
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    test.skip(!email || !password, 'Defina E2E_EMAIL e E2E_PASSWORD no .env para rodar este teste')

    await page.goto('/login')
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('.submit-btn').click()
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 15000 })

    await page.goto('/broadcast')
    await expect(page.locator('h1')).toContainText('Broadcast')
  })

  test('mostra a lista de campanhas ou o estado vazio', async ({ page }) => {
    // Ou existe pelo menos uma linha na tabela, ou o estado "sem campanhas" —
    // qualquer um dos dois confirma que a página carregou corretamente.
    const table = page.locator('table')
    const emptyState = page.getByText('Nenhuma campanha. Crie a primeira!')
    await expect(table.or(emptyState)).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: 'Nova Campanha' })).toBeVisible()
  })

  test('abre o formulário de nova campanha com os campos esperados', async ({ page }) => {
    await page.getByRole('button', { name: 'Nova Campanha' }).click()

    const dialog = page.locator('.v-overlay__content', { hasText: 'Nova Campanha' }).last()
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Nome da campanha')
    await expect(dialog).toContainText('Usar um template (opcional)')
    await expect(dialog).toContainText('Mensagem')
    await expect(dialog).toContainText('Agendar para (opcional)')
    await expect(dialog).toContainText('Mínimo')
    await expect(dialog).toContainText('Máximo')

    // Fecha sem criar nada — não queremos gerar uma campanha real.
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
    await expect(dialog).not.toBeVisible()
  })

  test('exige nome e mensagem ao tentar criar uma campanha', async ({ page }) => {
    await page.getByRole('button', { name: 'Nova Campanha' }).click()
    const dialog = page.locator('.v-overlay__content', { hasText: 'Nova Campanha' }).last()
    await expect(dialog).toBeVisible()

    // Não preenche nada — client-side validation deve bloquear antes de
    // qualquer chamada real ao backend.
    await dialog.getByRole('button', { name: 'Criar' }).click()

    await expect(dialog).toContainText('Nome e mensagem são obrigatórios.')
  })

  test('valida que o intervalo máximo não pode ser menor que o mínimo', async ({ page }) => {
    await page.getByRole('button', { name: 'Nova Campanha' }).click()
    const dialog = page.locator('.v-overlay__content', { hasText: 'Nova Campanha' }).last()
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('Nome da campanha').fill('Campanha de teste E2E (não enviar)')
    await dialog.getByLabel('Mensagem').fill('Mensagem de teste E2E, este formulário não deve ser efetivamente enviado.')
    await dialog.getByLabel('Mínimo').fill('10')
    await dialog.getByLabel('Máximo').fill('5')

    await dialog.getByRole('button', { name: 'Criar' }).click()

    await expect(dialog).toContainText('O intervalo máximo deve ser maior ou igual ao mínimo.')

    // Nunca clicamos em "Criar" com dados válidos — evitamos criar uma
    // campanha real. Fecha o diálogo pelo caminho de cancelamento.
    await dialog.getByRole('button', { name: 'Cancelar' }).click()
  })
})
