import { test, expect } from '@playwright/test'

test.describe('Página de Login', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('exibe o formulário de login corretamente', async ({ page }) => {
    await expect(page.locator('.form-title')).toContainText('Bem-vindo de volta')
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('.submit-btn')).toBeVisible()
  })

  test('exibe erro ao submeter campos vazios', async ({ page }) => {
    await page.locator('.submit-btn').click()
    await expect(page.locator('.form-error')).toContainText('Preencha e-mail e senha')
  })

  test('exibe erro com credenciais inválidas', async ({ page }) => {
    await page.locator('input[type="email"]').fill('naoexiste@teste.com')
    await page.locator('input[type="password"]').fill('senhaerrada')
    await page.locator('.submit-btn').click()
    await expect(page.locator('.form-error')).toBeVisible({ timeout: 10000 })
  })

  test('toggle de mostrar/ocultar senha funciona', async ({ page }) => {
    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.fill('minhasenha')
    await expect(passwordInput).toHaveAttribute('type', 'password')

    await page.locator('.field-eye').click()
    await expect(page.locator('input[name="password"], input[type="text"]').last()).toBeVisible()

    await page.locator('.field-eye').click()
    await expect(page.locator('input[type="password"]')).toBeVisible()
  })

  test('alterna para tab de registro', async ({ page }) => {
    await page.locator('.toggle-btn', { hasText: 'Registrar' }).click()
    await expect(page.locator('.form-title')).toContainText('Criar conta')
    await expect(page.locator('.submit-btn')).toContainText('Criar conta')
  })

  test('faz login com credenciais válidas e redireciona', async ({ page }) => {
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    test.skip(!email || !password, 'Defina E2E_EMAIL e E2E_PASSWORD no .env para rodar este teste')

    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.locator('.submit-btn').click()
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 15000 })
  })
})
