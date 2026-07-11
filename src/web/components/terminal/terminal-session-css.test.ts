import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = readFileSync(new URL('./terminal-session.css', import.meta.url), 'utf8')

describe('terminal session CSS layout contract', () => {
  test('keeps button dock padding tight without an extra top margin', () => {
    expect(css).toContain('--goblin-terminal-bottom-dock-height: 44px;')
    expect(css).toContain(
      'padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + var(--goblin-terminal-overlay-offset));',
    )
    expect(css).not.toContain('padding-bottom: calc(var(--goblin-terminal-bottom-dock-height) + 24px);')
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
    expect(css).not.toContain('--goblin-terminal-xterm-scrollbar-width')
    expect(css).not.toContain('--goblin-terminal-row-overflow-clearance')
    expect(css).not.toContain('.xterm-scrollable-element > .scrollbar.vertical')
    expect(css).not.toContain('.xterm-rows > div')
  })

  test('reserves a fixed right margin for the complete terminal host', () => {
    expect(css).toContain('.goblin-managed-terminal-host {')
    expect(css).toContain('width: auto;')
    expect(css).toContain('margin-right: 14px;')
    expect(css).not.toContain('width: calc(100% - 14px);')
  })
})
