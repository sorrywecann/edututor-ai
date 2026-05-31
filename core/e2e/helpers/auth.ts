import { Page } from '@playwright/test'

/**
 * Suppresses the FirstRunSetup and UnifiedOnboarding overlays by setting their
 * localStorage completion flags before any page script runs.
 * Call this via page.addInitScript before page.goto() on any shell route.
 */
export async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('edututor_firstrun_done_v3', '1')
    localStorage.setItem('edututor_firstrun_done_v2', '1')
    localStorage.setItem('edututor_firstrun_done', '1')
    localStorage.setItem('edututor_onboarding_v4', '1')
    localStorage.setItem('edututor_onboarding_v3', '1')
    localStorage.setItem('edututor_onboarding_v2', '1')
  })
}

/**
 * Injects a fake NextAuth session so protected routes render without a real login.
 * Call this before page.goto() on any authenticated route.
 */
export async function mockSession(page: Page, overrides: Record<string, unknown> = {}) {
  await page.route('**/api/auth/session**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user: {
          id: 'test-user-1',
          name: 'QA Tester',
          email: 'qa@edututor.ai',
          ...overrides,
        },
        expires: '2099-12-31T23:59:59.000Z',
      }),
    })
  })
}

/**
 * Mocks all calls to the FastAPI backend at localhost:8000 with sensible defaults.
 * Prevents network errors when the backend is not running during Playwright tests.
 *
 * Uses explicit http://localhost:8000/... prefixes so glob matching is unambiguous.
 * session_count: 5 in stats so the progress page renders the hero section (not EmptyState).
 */
export async function mockBackend(page: Page) {
  await page.route('http://localhost:8000/api/v1/health**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) })
  })

  await page.route('http://localhost:8000/api/v1/system/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stt: 'whisper', llm: 'openai', tts: 'edge', status: 'ok' }) })
  })

  await page.route(/http:\/\/localhost:8000\/api\/v1\/stats/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session_count: 5,
        total_turns: 20,
        streak_days: 3,
        total_words: 500,
        last_session_at: null,
        activity: [],
        recent_topics: [],
      }),
    })
  })

  await page.route(/http:\/\/localhost:8000\/api\/v1\/conversations/, async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'conv-1', messages: [] }) })
    }
  })

  await page.route('http://localhost:8000/api/v1/knowledge-bases**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  await page.route('http://localhost:8000/api/v1/llm/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ models: [{ id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' }] }),
    })
  })

  await page.route('http://localhost:8000/api/v1/modes**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'tutor', name: 'Lukáš', type: 'tutor' }]),
    })
  })

  await page.route('http://localhost:8000/api/v1/prompts**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  })

  // Catch-all for any remaining backend calls
  await page.route('http://localhost:8000/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })
}
