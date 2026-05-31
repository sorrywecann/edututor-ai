import { test, expect } from '@playwright/test'

const CREDENTIALS_ENDPOINT = '/api/auth/callback/credentials'
const SESSION_ENDPOINT = '/api/auth/session'


test.describe('Sign-in page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/signin')
  })

  test('renders page title and branding', async ({ page }) => {
    await expect(page.getByText('EduTutor', { exact: true })).toBeVisible()
    await expect(page.getByText(/AI Language Platform/i)).toBeVisible()
  })

  test('email and password inputs are present', async ({ page }) => {
    await expect(page.getByPlaceholder('Email')).toBeVisible()
    await expect(page.getByPlaceholder('Password')).toBeVisible()
  })

  test('email input is pre-filled with demo address', async ({ page }) => {
    await expect(page.getByPlaceholder('Email')).toHaveValue('demo@edututor.sk')
  })

  test('password input is pre-filled with demo password', async ({ page }) => {
    await expect(page.getByPlaceholder('Password')).toHaveValue('edututor2026')
  })

  test('submit button is visible and enabled with empty fields', async ({ page }) => {
    await page.getByPlaceholder('Email').fill('')
    await page.getByPlaceholder('Password').fill('')
    const button = page.getByRole('button', { name: 'Sign in' })
    await expect(button).toBeVisible()
    await expect(button).toBeEnabled()
  })

  test('demo credentials hint is shown on the page', async ({ page }) => {
    await expect(page.getByText('demo@edututor.sk')).toBeVisible()
  })

  test.describe('invalid credentials', () => {
    test.beforeEach(async ({ page }) => {
      // NextAuth v4 signIn({ redirect: false }) with json:true in the request body
      // always gets a 200 JSON response. The server embeds the error in the url field:
      // { url: "...?error=CredentialsSignin" }. The client then extracts the error
      // via new URL(data.url).searchParams.get('error').
      await page.route(CREDENTIALS_ENDPOINT, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'http://localhost:3000/auth/signin?error=CredentialsSignin' }),
        })
      )
      await page.route(SESSION_ENDPOINT, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({}),
        })
      )
    })

    test('shows error message after failed sign-in', async ({ page }) => {
      await page.getByPlaceholder('Email').fill('wrong@example.com')
      await page.getByPlaceholder('Password').fill('badpassword')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByText(/Invalid credentials/i)).toBeVisible()
    })

    test('error message includes demo credential hint', async ({ page }) => {
      await page.getByPlaceholder('Email').fill('wrong@example.com')
      await page.getByPlaceholder('Password').fill('badpassword')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByText(/demo@edututor\.sk/)).toBeVisible()
    })

    test('stays on sign-in page after failure', async ({ page }) => {
      await page.getByPlaceholder('Email').fill('wrong@example.com')
      await page.getByPlaceholder('Password').fill('badpassword')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).toHaveURL(/\/auth\/signin/)
    })
  })

  test.describe('successful sign-in', () => {
    test.beforeEach(async ({ page }) => {
      await page.route(CREDENTIALS_ENDPOINT, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ url: 'http://localhost:3000/' }),
        })
      )
      await page.route(SESSION_ENDPOINT, (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: { name: 'Demo User', email: 'demo@edututor.sk' },
            expires: new Date(Date.now() + 86_400_000).toISOString(),
          }),
        })
      )
    })

    test('redirects away from /auth/signin on success', async ({ page }) => {
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 })
    })

    test('no error message is shown after successful sign-in', async ({ page }) => {
      await page.getByRole('button', { name: 'Sign in' }).click()
      // Error div only mounts when the error state is non-empty; wait briefly
      // for any navigation then assert absence
      await page.waitForTimeout(500)
      await expect(page.getByText(/Invalid credentials/i)).not.toBeVisible()
    })

    test('accepts custom credentials and redirects', async ({ page }) => {
      await page.getByPlaceholder('Email').fill('custom@edututor.sk')
      await page.getByPlaceholder('Password').fill('custompassword')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page).not.toHaveURL(/\/auth\/signin/, { timeout: 10_000 })
    })
  })
})
