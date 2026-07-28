import { describe, expect, test } from 'vitest'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  normalizeBranchWorkspaceGitActionPlanRequest,
} from '#/shared/branch-workspace-git-actions.ts'

describe('branch workspace Git action inputs', () => {
  test('normalizes a batch commit plan request', () => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind: 'batch-commit',
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind: 'batch-commit', branchWorkspaceId: 'branch-1' },
    })
  })

  test('normalizes unique non-empty batch commit messages', () => {
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-commit',
        planToken: ' sha256:plan ',
        messages: [
          { repositoryName: 'api', message: ' feat: add API ' },
          { repositoryName: 'web', message: 'feat: add UI\n\n- Render the form.' },
        ],
      }),
    ).toEqual({
      ok: true,
      input: {
        kind: 'batch-commit',
        planToken: 'sha256:plan',
        messages: [
          { repositoryName: 'api', message: 'feat: add API' },
          { repositoryName: 'web', message: 'feat: add UI\n\n- Render the form.' },
        ],
      },
    })
  })

  test('normalizes both batch-merge execution modes with explicit destination branches', () => {
    for (const mode of ['merge', 'pull-merge-push'] as const) {
      expect(
        normalizeBranchWorkspaceGitActionPlanRequest({
          kind: 'batch-merge',
          branchWorkspaceId: ' branch-1 ',
        }),
      ).toEqual({
        ok: true,
        request: { kind: 'batch-merge', branchWorkspaceId: 'branch-1' },
      })
      expect(
        normalizeBranchWorkspaceGitActionExecuteInput({
          kind: 'batch-merge',
          planToken: 'sha256:plan',
          mode,
          targets: [
            { repositoryName: ' web ', destinationBranch: ' release/web ' },
            { repositoryName: 'api', destinationBranch: 'main' },
          ],
        }),
      ).toEqual({
        ok: true,
        input: {
          kind: 'batch-merge',
          planToken: 'sha256:plan',
          mode,
          targets: [
            { repositoryName: 'web', destinationBranch: 'release/web' },
            { repositoryName: 'api', destinationBranch: 'main' },
          ],
        },
      })
    }
  })

  test.each(['pull', 'push'] as const)('normalizes a coordinated %s plan and execution input', (kind) => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind,
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind, branchWorkspaceId: 'branch-1' },
    })
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind,
        planToken: ' sha256:plan ',
        mode: 'ignored',
        messages: [{ repositoryName: 'ignored', message: 'ignored' }],
      }),
    ).toEqual({
      ok: true,
      input: { kind, planToken: 'sha256:plan' },
    })
  })

  test.each([
    null,
    {},
    { kind: 'unknown', branchWorkspaceId: 'branch-1' },
    { kind: 'batch-commit', branchWorkspaceId: ' ' },
  ])('rejects an invalid plan request: %j', (value) => {
    expect(normalizeBranchWorkspaceGitActionPlanRequest(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })

  test.each([
    null,
    {},
    { kind: 'batch-commit', planToken: '', messages: [] },
    {
      kind: 'batch-commit',
      planToken: 'sha256:plan',
      messages: [
        { repositoryName: 'api', message: 'feat: one' },
        { repositoryName: 'api', message: 'feat: two' },
      ],
    },
    {
      kind: 'batch-commit',
      planToken: 'sha256:plan',
      messages: [{ repositoryName: 'api', message: ' ' }],
    },
    { kind: 'batch-merge', planToken: 'sha256:plan', mode: 'squash', targets: [] },
    { kind: 'batch-merge', planToken: 'sha256:plan', mode: 'merge', targets: [] },
    {
      kind: 'batch-merge',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [
        { repositoryName: 'api', destinationBranch: 'main' },
        { repositoryName: 'api', destinationBranch: 'release' },
      ],
    },
    {
      kind: 'batch-merge',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: '../api', destinationBranch: 'main' }],
    },
    {
      kind: 'batch-merge',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api\nweb', destinationBranch: 'main' }],
    },
    {
      kind: 'batch-merge',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api', destinationBranch: ' ' }],
    },
    {
      kind: 'batch-merge',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api', destinationBranch: 'main\u0000release' }],
    },
  ])('rejects invalid execution input: %j', (value) => {
    expect(normalizeBranchWorkspaceGitActionExecuteInput(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
