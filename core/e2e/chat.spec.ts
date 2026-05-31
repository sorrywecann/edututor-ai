import { test, expect } from '@playwright/test'
import { mockSession, mockBackend, skipOnboarding } from './helpers/auth'

const CHAT_RESPONSE = {
  response: 'Dobrý deň! Ako vám môžem pomôcť?',
  emotion: 'friendly',
  visemes: [],
}

async function setup(page: import('@playwright/test').Page) {
  // Suppress first-run and onboarding overlays that would block interaction
  await skipOnboarding(page)
  // Mock session first so the auth gate never shows
  await mockSession(page)
  // Mock all backend endpoints so the app renders without a running server
  await mockBackend(page)
  // Override the chat endpoint with our controlled response
  await page.route('**/api/v1/chat', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(CHAT_RESPONSE),
      })
    } else {
      await route.continue()
    }
  })
  // Suppress lipsync status noise
  await page.route('**/api/v1/lipsync/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ active: 'text' }),
    })
  })
}

test.describe('Chat interface', () => {
  test('main page loads and renders the shell when authenticated', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    // The app shell must be visible — wait for the VoiceZone footer to appear
    await expect(page.locator('.voice-zone-footer')).toBeVisible({ timeout: 15_000 })
  })

  test('chat input is visible and focusable', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    const input = page.getByPlaceholder('Napíš čokoľvek…')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.focus()
    await expect(input).toBeFocused()
  })

  test('user can type a message into the chat input', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    const input = page.getByPlaceholder('Napíš čokoľvek…')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill('Ahoj Lukáš, povedz mi niečo o Slovensku.')
    await expect(input).toHaveValue('Ahoj Lukáš, povedz mi niečo o Slovensku.')
  })

  test('pressing Enter triggers a POST to the chat endpoint', async ({ page }) => {
    await setup(page)
    const chatRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/chat') && req.method() === 'POST') {
        chatRequests.push(req.url())
      }
    })
    await page.goto('/')
    const input = page.getByPlaceholder('Napíš čokoľvek…')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill('Ako sa hovorí "hello" po slovensky?')
    await input.press('Enter')
    // Wait until at least one chat request was fired
    await expect.poll(() => chatRequests.length, { timeout: 10_000 }).toBeGreaterThan(0)
  })

  test('clicking the mic/send button triggers a POST to the chat endpoint', async ({ page }) => {
    await setup(page)
    const chatRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/chat') && req.method() === 'POST') {
        chatRequests.push(req.url())
      }
    })
    await page.goto('/')
    const input = page.getByPlaceholder('Napíš čokoľvek…')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill('Čo je to metafora?')
    // The send control is either MicButton (aria-label from state) or fallback
    // send button (aria-label="Odoslať"). Try the fallback first; if absent use Enter.
    const sendBtn = page.getByRole('button', { name: 'Odoslať' })
    if (await sendBtn.isVisible()) {
      await sendBtn.click()
    } else {
      await input.press('Enter')
    }
    await expect.poll(() => chatRequests.length, { timeout: 10_000 }).toBeGreaterThan(0)
  })

  test('input clears after submitting a message', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    const input = page.getByPlaceholder('Napíš čokoľvek…')
    await expect(input).toBeVisible({ timeout: 15_000 })
    await input.fill('Test správy')
    await input.press('Enter')
    // VoiceZone clears the input synchronously on send
    await expect(input).toHaveValue('', { timeout: 5_000 })
  })

  test('orb or avatar container is rendered', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    await expect(page.locator('.voice-zone-footer')).toBeVisible({ timeout: 15_000 })
    // AvatarContainer renders either a GradientOrb or ChamberOrb or an iframe —
    // all live inside an absolutely-positioned full-bleed div. The data-orb-state
    // attribute is set on both the iframe (stream mode) and the mic button; in orb
    // mode we can detect the presence of the MicButton's data attribute.
    const hasMicOrbState = await page.locator('[data-orb-state]').count()
    expect(hasMicOrbState).toBeGreaterThan(0)
  })

  test('sidebar icon rail is visible', async ({ page }) => {
    await setup(page)
    await page.goto('/')
    await expect(page.locator('.voice-zone-footer')).toBeVisible({ timeout: 15_000 })
    // The sidebar contains nav links — check that the Konverzácia nav link exists
    // (Sidebar renders a rail of icons with aria-label from the label field)
    const navLink = page.getByRole('link', { name: 'Konverzácia' })
    await expect(navLink).toBeVisible({ timeout: 10_000 })
  })
})
