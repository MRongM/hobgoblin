import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./terminal-session.css', import.meta.url), 'utf8')

describe('terminal session CSS layout contract', () => {
  test('keeps the button dock flush with the terminal bottom edge', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height: 44px;')
    expect(css).toContain('padding-bottom: var(--goblin-terminal-bottom-dock-height);')
    expect(css).toMatch(/\.goblin-terminal-bottom-dock\s*\{[^}]*bottom:\s*0;/)
    expect(css).not.toMatch(/\.goblin-terminal-bottom-dock\s*\{[^}]*bottom:\s*var\(--goblin-terminal-overlay-offset\);/)
  })

  test('keeps only custom button styles in the terminal dock', () => {
    expect(css).toContain('.goblin-terminal-bottom-dock')
    expect(css).toContain('.goblin-terminal-custom-buttons')
    const removedClass = ['goblin', 'terminal', 'external', 'input'].join('-')
    expect(css).not.toContain(`.${removedClass}`)
    expect(css).not.toContain(`${removedClass}__control`)
    expect(css).not.toContain(`${removedClass}__resize`)
  })

  test('keeps the xterm scrollbar blended with the terminal background', () => {
    expect(css).toContain(
      'scrollbar-color: color-mix(in srgb, var(--color-terminal-foreground) 28%, transparent) transparent;',
    )
    expect(css).toContain('.goblin-managed-terminal-host .xterm-viewport::-webkit-scrollbar-thumb')
    expect(css).toContain('background: color-mix(in srgb, var(--color-terminal-foreground) 28%, transparent);')
    expect(css).toContain('.goblin-managed-terminal-host .xterm-viewport::-webkit-scrollbar-corner')
    expect(css).toContain('background: transparent;')
    expect(css).toMatch(
      /\.goblin-managed-terminal-host \.xterm-scrollable-element > \.scrollbar\.vertical\s*\{[^}]*background:\s*transparent;/,
    )
  })

  test('uses xterm native scrollbar geometry without extra layout clearance', () => {
    expect(css).toContain(`.goblin-managed-terminal-host {
  width: 100%;`)
    expect(css).not.toContain('--goblin-terminal-scrollbar-clearance')
    expect(css).not.toContain('padding-right: var(--goblin-terminal-scrollbar-clearance);')
    expect(css).not.toMatch(/\.goblin-managed-terminal-host\s*\{[^}]*margin-right:\s*14px;/)
    expect(css).not.toMatch(
      /\.goblin-managed-terminal-host \.xterm-scrollable-element > \.scrollbar\.vertical\s*\{[^}]*margin-left:\s*14px;/,
    )
  })

  test('reserves vertical touch gestures for mobile read-only terminal scrolling', () => {
    expect(css).toMatch(
      /\.goblin-terminal-slot__host--touch-scroll\s*\{[^}]*touch-action:\s*pan-x pinch-zoom;/,
    )
  })
})
