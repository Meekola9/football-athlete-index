import { expect, test, type Page } from '@playwright/test'

async function waitForHistoricalSeed(page: Page) {
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('fai:data:v2')
    if (!raw) return false
    const data = JSON.parse(raw) as { athletes?: unknown[]; events?: unknown[]; sessions?: unknown[] }
    return data.athletes?.length === 164 && data.events?.length === 20 && data.sessions?.length === 770
  })
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.removeItem('fai:data:v1')
    localStorage.removeItem('fai:data:v2')
    await new Promise<void>((resolve) => {
      const request = indexedDB.deleteDatabase('fai-mobile-backup')
      request.onsuccess = () => resolve()
      request.onerror = () => resolve()
      request.onblocked = () => resolve()
    })
  })
  await page.reload()
  await waitForHistoricalSeed(page)
})

test('fresh install shows historical coverage and populated measurement rankings', async ({ page }) => {
  await expect(page.getByText('Historical data coverage · all seasons and alumni', { exact: true })).toBeVisible()

  const coverage = await page.evaluate(() => {
    const raw = localStorage.getItem('fai:data:v2')
    if (!raw) return null
    const data = JSON.parse(raw) as { athletes: unknown[]; events: unknown[]; sessions: unknown[] }
    return {
      athletes: data.athletes.length,
      events: data.events.length,
      sessions: data.sessions.length,
    }
  })
  expect(coverage).toEqual({ athletes: 164, events: 20, sessions: 770 })

  await page.getByRole('link', { name: 'Leaderboards', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Rankings', exact: true })).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Testing season' })).toHaveValue('season-2026')
  await page.getByRole('combobox', { name: 'Testing season' }).selectOption('')
  await page.getByRole('combobox', { name: 'Ranking metric' }).selectOption({ label: 'Best 40-Yard Dash' })
  await expect(page.getByText('Available data', { exact: true })).toBeVisible()
  await expect(page.getByText(/ranked$/).first()).not.toHaveText('0 ranked')
  await expect(page.getByText('No verified measurements are available for this board.')).toHaveCount(0)
  await expect(page.getByText(/\d\.\d{2}s/).first()).toBeVisible()
})
