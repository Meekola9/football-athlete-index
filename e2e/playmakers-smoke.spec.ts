import { test, expect } from '@playwright/test'

test('log a play and the Havoc meter and Level Up board update', async ({ page }) => {
  await page.goto('/#/playmakers')
  await expect(page.getByRole('heading', { name: /Playmakers & Havoc/ })).toBeVisible({ timeout: 15000 })

  // Pick the first real athlete and log the default play (Interception, +5 havoc).
  const athleteSelect = page.locator('select').first()
  const value = await athleteSelect.locator('option').nth(1).getAttribute('value')
  await athleteSelect.selectOption(value!)
  await page.getByRole('button', { name: /Log Play/ }).click()

  // Havoc meter total (the big number in the Havoc card) should be at least 5.
  const havocTotal = page
    .locator('div', { has: page.getByText('Havoc Meter') })
    .locator('.nums')
    .first()
  await expect(havocTotal).toHaveText(/^[5-9]|\d{2,}$/, { timeout: 5000 })

  await expect(page.getByRole('heading', { name: 'Level Up' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent Plays' })).toBeVisible()
  await expect(page.getByText('Interception', { exact: true })).toBeVisible()

  // A logged play must survive a page reload, not just update React state.
  await page.reload()
  await expect(page.getByRole('heading', { name: /Playmakers & Havoc/ })).toBeVisible({ timeout: 15000 })
  await expect(page.getByText('Interception', { exact: true })).toBeVisible()
  await expect(havocTotal).toHaveText(/^[5-9]|\d{2,}$/, { timeout: 5000 })
})
