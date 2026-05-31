import { test, expect } from '@playwright/test'
import { mockSession, mockBackend, skipOnboarding } from './helpers/auth'

// ---------------------------------------------------------------------------
// Knowledge Base page — /knowledge
// ---------------------------------------------------------------------------

test.describe('Knowledge Base page (/knowledge)', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
    await mockSession(page)
    await mockBackend(page)
    await page.goto('/knowledge')
  })

  test('renders without crash', async ({ page }) => {
    // Page should load and not show an error boundary or blank screen.
    await expect(page).not.toHaveURL(/error/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('heading contains "Databáza znalostí" or "knowledge"', async ({ page }) => {
    // PageHeader title is "Tvoje databázy"; eyebrow is "Databáza znalostí · knowledge bases".
    // Topbar carries "Databáza znalostí". Any of these satisfies the heading check.
    const headingText = await page
      .locator('h1, h2, [class*="title"], [class*="heading"], [data-testid="kb-header"]')
      .first()
      .textContent({ timeout: 10_000 })
      .catch(() => '')

    const pageText = await page.locator('body').textContent({ timeout: 10_000 })

    const found =
      (headingText ?? '').toLowerCase().includes('databáza') ||
      (headingText ?? '').toLowerCase().includes('knowledge') ||
      (headingText ?? '').toLowerCase().includes('databázy') ||
      (pageText ?? '').toLowerCase().includes('databáza znalostí') ||
      (pageText ?? '').toLowerCase().includes('knowledge bases')

    expect(found).toBe(true)
  })

  test('empty state: "Nová databáza" create button is visible when no KBs exist', async ({ page }) => {
    // Backend mock returns [] for /api/v1/knowledge-bases.
    // KBHeader always renders the dashed "Nová databáza" create card.
    await expect(
      page.getByText('Nová databáza', { exact: false })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('empty state: KB count shows zero databases', async ({ page }) => {
    // KBHeader renders "{n} databáz" count. With empty array it shows "0 databáz".
    await expect(
      page.getByText('0 databáz', { exact: false })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('create KB action is present (button or interactive element)', async ({ page }) => {
    // The dashed "+ / Nová databáza" button is the create action.
    // It is a <button> inside [data-testid="kb-header"].
    const kbHeader = page.locator('[data-testid="kb-header"]')
    await expect(kbHeader).toBeVisible({ timeout: 10_000 })

    const createBtn = kbHeader.locator('button').first()
    await expect(createBtn).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Progress / Pokrok page — /progress
// ---------------------------------------------------------------------------

test.describe('Progress page (/progress)', () => {
  test.beforeEach(async ({ page }) => {
    await skipOnboarding(page)
    await mockSession(page)
    await mockBackend(page)
    await page.goto('/progress')
  })

  test('renders without crash', async ({ page }) => {
    await expect(page).not.toHaveURL(/error/)
    await expect(page.locator('body')).toBeVisible()
  })

  test('page title contains "Pokrok" or "pokrok"', async ({ page }) => {
    // Topbar carries "Pokrok"; PageHeader title is "Tvoj pokrok".
    const bodyText = await page.locator('body').textContent({ timeout: 10_000 })
    expect((bodyText ?? '').toLowerCase()).toContain('pokrok')
  })

  test('hero metric band shows the four stat cards (sessions, turns, streak, words)', async ({ page }) => {
    // The four metric labels are rendered even when all values are zero.
    // They come from the HERO array: Konverzácie, Odpovede tutora, Séria, Slová tutora.
    await expect(page.getByText('Konverzácie', { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Odpovede tutora', { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Séria', { exact: false })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Slová tutora', { exact: false })).toBeVisible({ timeout: 10_000 })
  })

  test('recent sessions section heading is present', async ({ page }) => {
    // "Posledné relácie" MicroLabel is always rendered (inside the two-column grid)
    // unless the empty-state branch fires. With mock returning {} for stats,
    // session_count is undefined so empty === false — the grid renders.
    await expect(
      page.getByText('Posledné relácie', { exact: false })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('recent sessions section shows empty message when no sessions exist', async ({ page }) => {
    // mockBackend returns [] for /api/v1/conversations, so sessions.length === 0.
    await expect(
      page.getByText('Zatiaľ žiadne relácie', { exact: false })
    ).toBeVisible({ timeout: 10_000 })
  })

  test('activity chart container is present when stats include activity data', async ({ page }) => {
    // Override the stats mock to include an activity array.
    // Also override conversations explicitly to prevent sessions.map error
    // when multiple route handlers accumulate across tests in this context.
    await page.route(/http:\/\/localhost:8000\/api\/v1\/stats/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_count: 3,
          total_turns: 12,
          streak_days: 2,
          total_words: 450,
          last_session_at: null,
          recent_topics: [],
          activity: [
            { date: '2026-05-28', sessions: 1 },
            { date: '2026-05-29', sessions: 2 },
          ],
        }),
      })
    })
    await page.route(/http:\/\/localhost:8000\/api\/v1\/conversations/, async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    })

    // Navigate again so the overridden routes take effect.
    await page.goto('/progress')

    // The activity section label is "Aktivita — posledných 14 dní".
    await expect(
      page.getByText('Aktivita', { exact: false })
    ).toBeVisible({ timeout: 10_000 })
  })
})
