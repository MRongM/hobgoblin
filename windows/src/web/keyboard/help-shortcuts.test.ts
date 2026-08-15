import { describe, expect, test } from 'vitest'
import { helpShortcutSections } from '#/web/keyboard/help-shortcuts.ts'

describe('helpShortcutSections', () => {
  test('keeps only branch actions and terminal sections', () => {
    const sections = helpShortcutSections(true)

    expect(sections.map((section) => section.titleKey)).toEqual([
      'help.section.branch-actions',
      'help.section.terminal',
    ])
  })

  test('formats terminal cycle shortcuts for macOS', () => {
    const sections = helpShortcutSections(true)
    const terminal = sections[1]?.rows
    expect(terminal).toEqual([
      { combos: [['⌘', '⌥', '↑']], labelKey: 'terminal.command-deck.previous-terminal' },
      { combos: [['⌘', '⌥', '↓']], labelKey: 'terminal.command-deck.next-terminal' },
    ])
  })

  test('formats terminal cycle shortcuts for non-mac platforms', () => {
    const sections = helpShortcutSections(false)
    const terminal = sections[1]?.rows
    expect(terminal).toEqual([
      { combos: [['⌃', '⌥', '↑']], labelKey: 'terminal.command-deck.previous-terminal' },
      { combos: [['⌃', '⌥', '↓']], labelKey: 'terminal.command-deck.next-terminal' },
    ])
  })
})
