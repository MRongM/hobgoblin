import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./styles.css', import.meta.url), 'utf8')

describe('mobile topbar scroll CSS contract', () => {
  test('scrolls the complete topbar horizontally without shrinking or clipping functional regions', () => {
    expect(css).toMatch(
      /@media \(max-width: 639px\)[\s\S]*?\.mobile-topbar-scroll\s*\{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*hidden;[^}]*overscroll-behavior-x:\s*contain;/,
    )
    expect(css).toMatch(/\.mobile-topbar-scroll\s*>\s*\*\s*\{[^}]*flex-shrink:\s*0;/)
    expect(css).toMatch(/\.mobile-topbar-scroll-content\s*\{[^}]*min-width:\s*max-content;[^}]*overflow:\s*visible;/)
  })

  test('hides the mobile topbar scrollbar without disabling native scrolling', () => {
    expect(css).toMatch(/\.mobile-topbar-scroll\s*\{[^}]*scrollbar-width:\s*none;/)
    expect(css).toMatch(/\.mobile-topbar-scroll::-webkit-scrollbar\s*\{[^}]*display:\s*none;/)
  })
})
