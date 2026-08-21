import { describe, expect, test } from 'vitest'
import {
  isBranchWorkspaceOperationUpdatedEvent,
  isWorkspaceConfigurationInvalidationEvent,
  isWorkspaceInvalidationEvent,
  settingsInvalidationScopesForPrefsPatch,
} from '#/shared/server-invalidation.ts'

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

describe('isWorkspaceConfigurationInvalidationEvent', () => {
  test('accepts a safe root and optional source token', () => {
    expect(
      isWorkspaceConfigurationInvalidationEvent({
        type: 'workspace-configuration-invalidated',
        rootId: '/workspace',
        sourceToken: 'workspace_import_1',
      }),
    ).toBe(true)
    expect(
      isWorkspaceConfigurationInvalidationEvent({
        type: 'workspace-configuration-invalidated',
        rootId: 'ssh-config://example/srv/workspace',
      }),
    ).toBe(true)
  })

  test.each([
    { type: 'workspace-configuration-invalidated', rootId: '' },
    { type: 'workspace-configuration-invalidated', rootId: ' /workspace' },
    { type: 'workspace-configuration-invalidated', rootId: '/workspace\n' },
    { type: 'workspace-configuration-invalidated', rootId: '/workspace', sourceToken: 'bad token' },
    { type: 'workspace-configuration-invalidated', rootId: '/workspace', sourceToken: 42 },
  ])('rejects malformed configuration invalidations', (event) => {
    expect(isWorkspaceConfigurationInvalidationEvent(event)).toBe(false)
  })
})

describe('isBranchWorkspaceOperationUpdatedEvent', () => {
  const validEvent = {
    type: 'branch-workspace-operation-updated',
    rootId: '/workspace',
    branchWorkspaceId: 'workspace_1',
    operation: {
      kind: 'batch-merge-in',
      currentStep: 1,
      completedCount: 0,
      totalCount: 2,
      cancellable: true,
      repositoryName: 'api',
      step: 'pull',
    },
  } as const

  test('accepts an active operation and an explicit clear event', () => {
    expect(isBranchWorkspaceOperationUpdatedEvent(validEvent)).toBe(true)
    expect(
      isBranchWorkspaceOperationUpdatedEvent({
        ...validEvent,
        operation: { ...validEvent.operation, step: 'fetch' },
      }),
    ).toBe(true)
    expect(
      isBranchWorkspaceOperationUpdatedEvent({
        ...validEvent,
        operation: { ...validEvent.operation, kind: 'batch-discard', step: 'discard' },
      }),
    ).toBe(true)
    expect(isBranchWorkspaceOperationUpdatedEvent({ ...validEvent, operation: null })).toBe(true)
  })

  test('accepts an active batch upstream operation at its upstream step', () => {
    expect(
      isBranchWorkspaceOperationUpdatedEvent({
        ...validEvent,
        operation: { ...validEvent.operation, kind: 'batch-set-upstream', step: 'upstream' },
      }),
    ).toBe(true)
  })

  test.each([
    { ...validEvent, rootId: ' /workspace' },
    { ...validEvent, branchWorkspaceId: '' },
    { ...validEvent, operation: { ...validEvent.operation, kind: 'rebase' } },
    { ...validEvent, operation: { ...validEvent.operation, currentStep: -1 } },
    { ...validEvent, operation: { ...validEvent.operation, completedCount: 0.5 } },
    { ...validEvent, operation: { ...validEvent.operation, totalCount: '2' } },
    { ...validEvent, operation: { ...validEvent.operation, step: 'checkout' } },
  ])('rejects malformed operation events', (event) => {
    expect(isBranchWorkspaceOperationUpdatedEvent(event)).toBe(false)
  })
})
