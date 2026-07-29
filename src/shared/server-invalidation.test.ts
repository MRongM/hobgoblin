import { describe, expect, test } from 'vitest'
import { isWorkspaceInvalidationEvent, settingsInvalidationScopesForPrefsPatch } from '#/shared/server-invalidation.ts'

describe('settingsInvalidationScopesForPrefsPatch', () => {
  test('always includes the settings snapshot scope', () => {
    expect(settingsInvalidationScopesForPrefsPatch({})).toEqual(['settings-snapshot'])
  })

  test('adds only the derived scopes for changed preference groups', () => {
    expect(
      settingsInvalidationScopesForPrefsPatch({
        lang: 'ko',
        colorTheme: 'macos',
        terminalApp: 'ghostty',
      }),
    ).toEqual(['settings-snapshot', 'i18n', 'theme', 'external-apps'])
  })
})

describe('isWorkspaceInvalidationEvent', () => {
  test('accepts an optional string source token and rejects other token shapes', () => {
    expect(
      isWorkspaceInvalidationEvent({
        type: 'workspace-invalidated',
        rootId: '/workspace',
        sourceToken: 'workspace_create_1',
      }),
    ).toBe(true)
    expect(
      isWorkspaceInvalidationEvent({
        type: 'workspace-invalidated',
        rootId: '/workspace',
        sourceToken: 42,
      }),
    ).toBe(false)
  })
})
