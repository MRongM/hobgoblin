import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('topbar chrome CSS contract', () => {
  test('aligns the sidebar topbar to its own right edge under native overlay chrome', () => {
    expect(css).toMatch(
      /html\[data-host='electron'\]\[data-chrome='overlay'\] \.sidebar-project-topbar\s*\{[^}]*padding-right:\s*16px;/,
    )
  })
})
