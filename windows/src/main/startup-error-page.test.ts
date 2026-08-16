import { describe, expect, test } from 'vitest'

describe('startup error page', () => {
  test('renders escaped startup failure details', async () => {
    const { buildStartupErrorPageHtml } = await import('#/main/startup-error-page.ts')

    const html = buildStartupErrorPageHtml({
      phase: 'renderer-load',
      message: '<script>alert(1)</script>',
      logPath: 'C:\\Users\\test\\AppData\\Roaming\\Hobgoblin\\startup.log',
    })

    expect(html).toContain('Hobgoblin failed to start')
    expect(html).toContain('renderer-load')
    expect(html).toContain('C:\\Users\\test\\AppData\\Roaming\\Hobgoblin\\startup.log')
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })
})
