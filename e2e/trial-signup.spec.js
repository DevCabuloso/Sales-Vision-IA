import { test, expect } from '@playwright/test'

// Fluxo de cadastro de teste grátis (TrialLandingView) + pagamento InfinitePay.
// A raiz '/' é a landing pública (ver frontend/src/router/index.js).

function fillField(page, label, value) {
  return page.locator('.tl-field', { has: page.locator('.tl-field-label', { hasText: label }) }).locator('input').fill(value)
}

test.describe('Cadastro de teste grátis (trial signup)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exibe a landing e abre o formulário de cadastro ao clicar no CTA', async ({ page }) => {
    await expect(page.locator('.tl-headline')).toContainText('Coloque um vendedor com IA no seu WhatsApp')
    await page.locator('.tl-cta').first().click()

    await expect(page.locator('.tl-form-title')).toContainText('Vamos começar')
    await expect(page.locator('.tl-field-input[placeholder="Seu nome completo"]')).toBeVisible()
    await expect(page.locator('.tl-field-input[placeholder="Nome da sua empresa"]')).toBeVisible()
    await expect(page.locator('.tl-field-input[type="email"]')).toBeVisible()
    await expect(page.locator('.tl-field-input[type="password"]')).toBeVisible()
    await expect(page.locator('.tl-submit-btn')).toContainText('Ir para o pagamento')
  })

  test('exibe erro ao submeter o formulário vazio (nome, empresa, e-mail, senha)', async ({ page }) => {
    await page.locator('.tl-cta').first().click()
    await expect(page.locator('.tl-form-title')).toBeVisible()

    await page.locator('.tl-submit-btn').click()

    await expect(page.locator('.tl-form-error')).toContainText('Preencha nome, empresa, e-mail e senha.')
  })

  test('exibe erro com e-mail em formato inválido', async ({ page }) => {
    await page.locator('.tl-cta').first().click()
    await expect(page.locator('.tl-form-title')).toBeVisible()

    await fillField(page, 'Seu nome', 'Ana Teste')
    await fillField(page, 'Empresa', 'Empresa Teste')
    await fillField(page, 'E-mail', 'email-invalido')
    await fillField(page, 'Crie uma senha', 'senha1234')

    await page.locator('.tl-submit-btn').click()

    await expect(page.locator('.tl-form-error')).toContainText('Preencha nome, empresa, e-mail e senha.')
  })

  test('exibe erro quando a senha tem menos de 8 caracteres', async ({ page }) => {
    await page.locator('.tl-cta').first().click()
    await expect(page.locator('.tl-form-title')).toBeVisible()

    await fillField(page, 'Seu nome', 'Ana Teste')
    await fillField(page, 'Empresa', 'Empresa Teste')
    await fillField(page, 'E-mail', 'ana.teste@example.com')
    await fillField(page, 'Crie uma senha', '123')

    await page.locator('.tl-submit-btn').click()

    await expect(page.locator('.tl-form-error')).toContainText('pelo menos 8 caracteres')
  })

  // Este teste envia o formulário de fato, o que dispara uma chamada real ao
  // backend (api.trialSignup) criando um pedido/tenant de teste real e
  // redirecionando para o checkout real da InfinitePay. Só roda se
  // E2E_ALLOW_TRIAL_SIGNUP estiver definida, usando um e-mail óbvio de teste
  // com timestamp para não colidir com cadastros reais.
  test('envia o cadastro válido e inicia o redirecionamento para o pagamento', async ({ page }) => {
    test.skip(!process.env.E2E_ALLOW_TRIAL_SIGNUP, 'Defina E2E_ALLOW_TRIAL_SIGNUP=1 no .env para rodar este teste (cria registro real no backend)')

    const stamp = Date.now()
    await page.locator('.tl-cta').first().click()
    await expect(page.locator('.tl-form-title')).toBeVisible()

    await fillField(page, 'Seu nome', `E2E Teste ${stamp}`)
    await fillField(page, 'Empresa', `E2E Empresa ${stamp}`)
    await fillField(page, 'E-mail', `e2e-test-${stamp}@example.com`)
    await fillField(page, 'Crie uma senha', 'senhaTeste1234')

    const urlBeforeSubmit = page.url()
    await page.locator('.tl-submit-btn').click()

    // O botão entra em estado de loading enquanto aguarda o checkoutUrl do backend...
    await expect(page.locator('.tl-submit-btn .v-progress-circular')).toBeVisible({ timeout: 10000 })
    // ...e a submissão bem-sucedida navega para fora da SPA (checkout InfinitePay).
    await page.waitForURL((url) => url.toString() !== urlBeforeSubmit, { timeout: 20000 })
  })
})
