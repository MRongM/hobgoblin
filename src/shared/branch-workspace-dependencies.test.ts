import { describe, expect, test } from 'vitest'
import {
  normalizeBranchWorkspaceDependencyExecuteInput,
  normalizeBranchWorkspaceDependencyPlanRequest,
} from '#/shared/branch-workspace-dependencies.ts'

describe('branch workspace dependency inputs', () => {
  test('normalizes an add request with unique copy and symlink entries', () => {
    expect(
      normalizeBranchWorkspaceDependencyPlanRequest({
        operation: 'add',
        branchWorkspaceId: ' branch-1 ',
        entries: [
          { name: ' .env ', mode: 'copy' },
          { name: 'config', mode: 'symlink' },
        ],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'add',
        branchWorkspaceId: 'branch-1',
        entries: [
          { name: '.env', mode: 'copy' },
          { name: 'config', mode: 'symlink' },
        ],
      },
    })
  })

  test('normalizes a remove request with unique direct-child names', () => {
    expect(
      normalizeBranchWorkspaceDependencyPlanRequest({
        operation: 'remove',
        branchWorkspaceId: 'branch-1',
        names: [' .env ', 'config'],
      }),
    ).toEqual({
      ok: true,
      request: {
        operation: 'remove',
        branchWorkspaceId: 'branch-1',
        names: ['.env', 'config'],
      },
    })
  })

  test.each([
    null,
    {},
    { operation: 'add', branchWorkspaceId: '', entries: [{ name: '.env', mode: 'copy' }] },
    { operation: 'add', branchWorkspaceId: 'branch-1', entries: [] },
    { operation: 'add', branchWorkspaceId: 'branch-1', entries: [{ name: '../secret', mode: 'copy' }] },
    { operation: 'add', branchWorkspaceId: 'branch-1', entries: [{ name: '.env', mode: 'hardlink' }] },
    {
      operation: 'add',
      branchWorkspaceId: 'branch-1',
      entries: [
        { name: '.env', mode: 'copy' },
        { name: '.env', mode: 'symlink' },
      ],
    },
    { operation: 'remove', branchWorkspaceId: 'branch-1', names: [] },
    { operation: 'remove', branchWorkspaceId: 'branch-1', names: ['folder/file'] },
    { operation: 'remove', branchWorkspaceId: 'branch-1', names: ['config', 'config'] },
  ])('rejects an invalid plan request: %j', (value) => {
    expect(normalizeBranchWorkspaceDependencyPlanRequest(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })

  test('normalizes an execute input with unique approvals and a valid source token', () => {
    expect(
      normalizeBranchWorkspaceDependencyExecuteInput({
        planToken: ' sha256:plan ',
        approvals: ['outside-root-source', 'outside-root-source'],
        sourceToken: ' renderer_1-token ',
      }),
    ).toEqual({
      ok: true,
      input: {
        planToken: 'sha256:plan',
        approvals: ['outside-root-source'],
        sourceToken: 'renderer_1-token',
      },
    })
  })

  test.each([
    null,
    {},
    { planToken: '', approvals: [] },
    { planToken: 'sha256:plan', approvals: ['unknown'] },
    { planToken: 'sha256:plan', approvals: [], sourceToken: 'contains space' },
  ])('rejects an invalid execute input: %j', (value) => {
    expect(normalizeBranchWorkspaceDependencyExecuteInput(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
