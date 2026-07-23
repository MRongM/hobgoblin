import * as v from 'valibot'
import { describe, expect, test } from 'vitest'
import {
  NativeShellProjectionSchema,
  nativeSettingsProjectionStateFromSettings,
  pickNativeSettingsProjectionPatch,
} from '#/shared/native-shell-projection.ts'
import { COLOR_THEMES } from '#/shared/color-theme.ts'

describe('native shell projection helpers', () => {
  test('picks only settings that affect native projection', () => {
    expect(
      pickNativeSettingsProjectionPatch({
        lang: 'ja',
        shortcutsDisabled: true,
        topbarHeightPx: 39,
        toolbarHeightPx: 41,
        terminalNotificationsEnabled: true,
        terminalApp: 'ghostty',
      }),
    ).toEqual({
      lang: 'ja',
      shortcutsDisabled: true,
      topbarHeightPx: 39,
    })
  })

  test('returns null when a settings update does not affect native projection', () => {
    expect(
      pickNativeSettingsProjectionPatch({
        terminalNotificationsEnabled: true,
      }),
    ).toBeNull()
  })

  test('derives the native projection state from full settings', () => {
    expect(
      nativeSettingsProjectionStateFromSettings({
        lang: 'ko',
        theme: 'dark',
        colorTheme: 'github',
        fetchIntervalSec: 120,
        gitNetworkProxyEnabled: false,
        gitNetworkProxyUrl: '',
        gitNetworkTimeoutSec: 120,
        terminalNotificationsEnabled: false,
        shortcutsDisabled: true,
        globalShortcutDisabled: true,
        swapCloseShortcuts: true,
        terminalThemeSyncEnabled: true,
        temporaryFilesDirectory: '',
        globalShortcut: 'Alt+K',
        terminalApp: 'auto',
        editorApp: 'auto',
        topbarHeightPx: 39,
        toolbarHeightPx: 41,
        fileTreeFontSize: 12,
        fileTreeTopbarFontSize: 13,
        fileTreeClipboardMaxBytesMb: 30,
        terminalFontSize: 14,
        localTerminalTmuxEnabled: false,
        remoteTerminalTmuxEnabled: false,
        terminalCustomButtonsVisible: true,
        terminalCustomButtonSize: 'medium',
        terminalCustomButtons: [],
        fontFamily: 'mono',
        lanEnabled: false,
        serverPort: 32200,
      }),
    ).toEqual({
      lang: 'ko',
      theme: 'dark',
      colorTheme: 'github',
      shortcutsDisabled: true,
      globalShortcutDisabled: true,
      swapCloseShortcuts: true,
      globalShortcut: 'Alt+K',
      topbarHeightPx: 39,
    })
  })

  test('rejects an empty shell projection payload', () => {
    expect(v.safeParse(NativeShellProjectionSchema, {}).success).toBe(false)
  })

  test('accepts current design color theme presets in native projection payloads', () => {
    for (const colorTheme of COLOR_THEMES) {
      expect(
        v.safeParse(NativeShellProjectionSchema, {
          prefs: {
            patch: { colorTheme },
            settings: {
              lang: 'auto',
              theme: 'auto',
              colorTheme,
              shortcutsDisabled: false,
              globalShortcutDisabled: false,
              swapCloseShortcuts: false,
              globalShortcut: 'Alt+G',
              topbarHeightPx: 34,
            },
          },
        }).success,
      ).toBe(true)
    }
  })

  test('rejects legacy apple in current native projection payloads', () => {
    expect(
      v.safeParse(NativeShellProjectionSchema, {
        prefs: {
          patch: { colorTheme: 'apple' },
          settings: {
            lang: 'auto',
            theme: 'auto',
            colorTheme: 'apple',
            shortcutsDisabled: false,
            globalShortcutDisabled: false,
            swapCloseShortcuts: false,
            globalShortcut: 'Alt+G',
            topbarHeightPx: 34,
          },
        },
      }).success,
    ).toBe(false)
  })
})
