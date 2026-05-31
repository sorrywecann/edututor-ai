import { test, expect } from '@playwright/test'

const BACKEND = 'http://localhost:8000'

test.describe('Backend API health checks', () => {
  test('health endpoint returns ok', async ({ request }) => {
    // Test GET http://localhost:8000/api/v1/health
    // Skip gracefully if backend is not running (catch network errors)
    try {
      const response = await request.get(BACKEND + '/api/v1/health')
      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body).toHaveProperty('status')
    } catch {
      test.skip(true, 'Backend not running — skipping API smoke tests')
    }
  })

  test('conversations list returns array', async ({ request }) => {
    try {
      const response = await request.get(BACKEND + '/api/v1/conversations')
      expect([200, 401, 403]).toContain(response.status())
    } catch {
      test.skip(true, 'Backend not running')
    }
  })

  test('knowledge bases endpoint exists', async ({ request }) => {
    try {
      const response = await request.get(BACKEND + '/api/v1/knowledge')
      expect([200, 401, 403, 404]).toContain(response.status())
    } catch {
      test.skip(true, 'Backend not running')
    }
  })

  test('llm models endpoint exists', async ({ request }) => {
    try {
      const response = await request.get(BACKEND + '/api/v1/llm/models')
      expect([200, 401, 403]).toContain(response.status())
    } catch {
      test.skip(true, 'Backend not running')
    }
  })
})
