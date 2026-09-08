import { test, expect, type Page } from '@playwright/test'

// Route-health regression guard. Visits every route at desktop and mobile
// widths, captures console/page errors, and fails on any blank or crashed
// render. Catches whole-page crashes (e.g. a slide/board referencing a
// renamed metric id) that unit tests and typechecking miss.

const ROUTES = [
  '/', '/leaderboards', '/athletes', '/deployment', '/playmakers', '/film', '/film-library', '/sideline', '/development',
  '/stats', '/quiz', '/vertical', '/badges', '/archetypes', '/entry', '/import',
  '/data', '/staff', '/account/setup', '/tv',
]

const IGNORE = [
  /Download the React DevTools/i,
  /\[vite\]/i,
  /manifest/i, // PWA manifest fetch noise under file preview
]

async function auditRoute(page: Page, route: string) {
  const errors: string[] = []
  const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
    if (msg.type() === 'error' && !IGNORE.some((re) => re.test(msg.text()))) errors.push(`console: ${msg.text()}`)
  }
  const onPageError = (err: Error) => errors.push(`pageerror: ${err.message}`)
  page.on('console', onConsole)
  page.on('pageerror', onPageError)

  await page.goto(`/#${route}`, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  const bodyText = (await page.locator('body').innerText().catch(() => '')) ?? ''
  const blank = bodyText.trim().length < 40

  page.off('console', onConsole)
  page.off('pageerror', onPageError)
  return { route, errors, blank, chars: bodyText.trim().length }
}

test('desktop audit of all routes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  const report: Awaited<ReturnType<typeof auditRoute>>[] = []
  for (const route of ROUTES) report.push(await auditRoute(page, route))
  console.log('DESKTOP AUDIT\n' + report.map((r) => `${r.blank ? 'BLANK ' : 'ok    '} ${r.route}  (${r.chars} chars)${r.errors.length ? '\n   ' + r.errors.join('\n   ') : ''}`).join('\n'))
  const broken = report.filter((r) => r.blank || r.errors.length > 0)
  expect(broken, `Routes with issues:\n${JSON.stringify(broken, null, 2)}`).toEqual([])
})

test('mobile audit of key routes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const report: Awaited<ReturnType<typeof auditRoute>>[] = []
  for (const route of ['/', '/leaderboards', '/athletes', '/deployment', '/import', '/quiz', '/development']) {
    report.push(await auditRoute(page, route))
  }
  console.log('MOBILE AUDIT\n' + report.map((r) => `${r.blank ? 'BLANK ' : 'ok    '} ${r.route}  (${r.chars} chars)${r.errors.length ? '\n   ' + r.errors.join('\n   ') : ''}`).join('\n'))
  const broken = report.filter((r) => r.blank || r.errors.length > 0)
  expect(broken, `Routes with issues:\n${JSON.stringify(broken, null, 2)}`).toEqual([])
})
