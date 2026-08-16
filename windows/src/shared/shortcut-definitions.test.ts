import { describe, expect, test } from 'vitest'
import {
  TERMINAL_CYCLE_SHORTCUTS,
  matchBranchActionShortcut,
  matchRendererKeyboardShortcut,
  matchTerminalCycleShortcut,
  rendererMenuCommandById,
} from '#/shared/shortcut-definitions.ts'

describe('shortcut definitions', () => {
  test('matches branch action shortcuts from keyboard input', () => {
    expect(matchBranchActionShortcut({ code: 'KeyP', shiftKey: false })).toBe('pull')
    expect(matchBranchActionShortcut({ code: 'KeyP', shiftKey: true })).toBe('push')
    expect(matchBranchActionShortcut({ code: 'KeyG', shiftKey: false })).toBe('externalTerminal')
    expect(matchBranchActionShortcut({ code: 'KeyG', shiftKey: true })).toBe('remote')
    expect(matchBranchActionShortcut({ code: 'KeyV', shiftKey: false })).toBe('editor')
    expect(matchBranchActionShortcut({ code: 'KeyV', shiftKey: true })).toBeNull()
  })

  test('matches branch selection without reserving removed navigation and app shortcuts', () => {
    expect(matchRendererKeyboardShortcut({ key: 'j', code: 'KeyJ', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'k', code: 'KeyK', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'ArrowDown', code: 'ArrowDown', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: false })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'Enter', code: 'Enter', shiftKey: false })).toBe('checkout-selected')
    expect(matchRendererKeyboardShortcut({ key: '?', code: 'Slash', shiftKey: true })).toBeNull()
    expect(matchRendererKeyboardShortcut({ key: 'Escape', code: 'Escape', shiftKey: false })).toBeNull()
  })

  test('removes accelerators owned by the former navigation, views, and app sections', () => {
    for (const id of [
      'app-settings',
      'file-open-local-repo',
      'file-clone-repo',
      'file-open-remote-repo',
      'file-close-tab',
      'file-settings',
      'view-status',
      'view-changes',
      'view-terminal-primary-action',
      'view-refresh',
      'window-next-repo',
      'window-prev-repo',
    ] as const) {
      expect(rendererMenuCommandById(id)).not.toHaveProperty('accelerator')
    }
  })

  test('defines and matches platform-primary terminal cycle shortcuts', () => {
    expect(TERMINAL_CYCLE_SHORTCUTS).toEqual([
      {
        key: 'ArrowUp',
        direction: -1,
        accelerator: 'CmdOrCtrl+Alt+Up',
        labelKey: 'terminal.command-deck.previous-terminal',
      },
      {
        key: 'ArrowDown',
        direction: 1,
        accelerator: 'CmdOrCtrl+Alt+Down',
        labelKey: 'terminal.command-deck.next-terminal',
      },
    ])

    expect(
      matchTerminalCycleShortcut(
        { key: 'ArrowUp', altKey: true, ctrlKey: false, metaKey: true, shiftKey: false },
        true,
      ),
    ).toBe(-1)
    expect(
      matchTerminalCycleShortcut(
        { key: 'ArrowDown', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false },
        false,
      ),
    ).toBe(1)
    expect(
      matchTerminalCycleShortcut(
        { key: 'ArrowDown', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false },
        true,
      ),
    ).toBeNull()
  })
})
