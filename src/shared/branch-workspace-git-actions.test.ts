import { describe, expect, test } from 'vitest'
import {
  normalizeBranchWorkspaceGitActionExecuteInput,
  normalizeBranchWorkspaceGitActionPlanRequest,
} from '#/shared/branch-workspace-git-actions.ts'

describe('branch workspace Git action inputs', () => {
  test('normalizes a batch upstream plan request', () => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind: 'batch-set-upstream',
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind: 'batch-set-upstream', branchWorkspaceId: 'branch-1' },
    })
  })

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

  test('normalizes ordered batch upstream mappings', () => {
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-set-upstream',
        planToken: ' sha256:plan ',
        upstreams: [
          { repositoryName: ' api ', action: 'set', remoteRef: ' origin/release ' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/feature/web' },
        ],
      }),
    ).toEqual({
      ok: true,
      input: {
        kind: 'batch-set-upstream',
        planToken: 'sha256:plan',
        upstreams: [
          { repositoryName: 'api', action: 'set', remoteRef: 'origin/release' },
          { repositoryName: 'web', action: 'set', remoteRef: 'upstream/feature/web' },
        ],
      },
    })
  })

  test('accepts an unset upstream action without a remote ref', () => {
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-set-upstream',
        planToken: 'sha256:plan',
        upstreams: [{ repositoryName: 'api', action: 'unset' }],
      }),
    ).toEqual({
      ok: true,
      input: {
        kind: 'batch-set-upstream',
        planToken: 'sha256:plan',
        upstreams: [{ repositoryName: 'api', action: 'unset' }],
      },
    })
  })

  test.each([
    { kind: 'batch-set-upstream', planToken: 'sha256:plan', upstreams: [] },
    {
      kind: 'batch-set-upstream',
      planToken: 'sha256:plan',
      upstreams: [{ repositoryName: 'api', remoteRef: 'origin/HEAD' }],
    },
    {
      kind: 'batch-set-upstream',
      planToken: 'sha256:plan',
      upstreams: [
        { repositoryName: 'api', remoteRef: 'origin/main' },
        { repositoryName: 'api', remoteRef: 'origin/release' },
      ],
    },
    {
      kind: 'batch-set-upstream',
      planToken: 'sha256:plan',
      upstreams: [{ repositoryName: '../api', remoteRef: 'origin/main' }],
    },
    {
      kind: 'batch-set-upstream',
      planToken: 'sha256:plan',
      upstreams: [{ repositoryName: 'api', remoteRef: 'origin/ bad' }],
    },
  ])('rejects invalid batch upstream input: %j', (value) => {
    expect(normalizeBranchWorkspaceGitActionExecuteInput(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })

  test('normalizes batch discard without accepting a client path scope', () => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind: 'batch-discard',
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind: 'batch-discard', branchWorkspaceId: 'branch-1' },
    })
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-discard',
        planToken: ' sha256:plan ',
        paths: ['client-controlled.ts'],
      }),
    ).toEqual({
      ok: true,
      input: { kind: 'batch-discard', planToken: 'sha256:plan' },
    })
  })

  test('normalizes legacy local mappings into explicit selections for both merge directions', () => {
    for (const mode of ['merge', 'pull-merge-push'] as const) {
      expect(
        normalizeBranchWorkspaceGitActionPlanRequest({
          kind: 'batch-merge-in',
          branchWorkspaceId: ' branch-1 ',
        }),
      ).toEqual({
        ok: true,
        request: { kind: 'batch-merge-in', branchWorkspaceId: 'branch-1' },
      })
      expect(
        normalizeBranchWorkspaceGitActionExecuteInput({
          kind: 'batch-merge-in',
          planToken: 'sha256:plan',
          mode,
          sources: [
            { repositoryName: ' web ', sourceBranch: ' release/web ' },
            { repositoryName: 'api', sourceBranch: 'main' },
          ],
        }),
      ).toEqual({
        ok: true,
        input: {
          kind: 'batch-merge-in',
          planToken: 'sha256:plan',
          mode,
          sources: [
            { repositoryName: 'web', source: { kind: 'local', branch: 'release/web' } },
            { repositoryName: 'api', source: { kind: 'local', branch: 'main' } },
          ],
        },
      })
      expect(
        normalizeBranchWorkspaceGitActionPlanRequest({
          kind: 'batch-merge-out',
          branchWorkspaceId: ' branch-1 ',
        }),
      ).toEqual({
        ok: true,
        request: { kind: 'batch-merge-out', branchWorkspaceId: 'branch-1' },
      })
      expect(
        normalizeBranchWorkspaceGitActionExecuteInput({
          kind: 'batch-merge-out',
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
          kind: 'batch-merge-out',
          planToken: 'sha256:plan',
          mode,
          targets: [
            { repositoryName: 'web', destination: { kind: 'local', branch: 'release/web' } },
            { repositoryName: 'api', destination: { kind: 'local', branch: 'main' } },
          ],
        },
      })
    }
  })

  test('preserves discriminated local and remote selections in non-empty batch mappings', () => {
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-merge-in',
        planToken: 'sha256:plan',
        mode: 'merge',
        sources: [
          { repositoryName: 'api', source: { kind: 'remote', remoteRef: 'origin/main' } },
          { repositoryName: 'web', source: { kind: 'local', branch: 'main' } },
        ],
      }),
    ).toMatchObject({
      ok: true,
      input: {
        sources: [
          { repositoryName: 'api', source: { kind: 'remote', remoteRef: 'origin/main' } },
          { repositoryName: 'web', source: { kind: 'local', branch: 'main' } },
        ],
      },
    })
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'batch-merge-out',
        planToken: 'sha256:plan',
        mode: 'pull-merge-push',
        targets: [{ repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'upstream/release/v2' } }],
      }),
    ).toMatchObject({
      ok: true,
      input: {
        targets: [{ repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'upstream/release/v2' } }],
      },
    })
  })

  test('normalizes a selected coordinated pull execution input', () => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind: 'pull',
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind: 'pull', branchWorkspaceId: 'branch-1' },
    })
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'pull',
        planToken: ' sha256:plan ',
        repositoryNames: [' web ', 'api'],
      }),
    ).toEqual({
      ok: true,
      input: { kind: 'pull', planToken: 'sha256:plan', repositoryNames: ['web', 'api'] },
    })
  })

  test('normalizes coordinated push targets with explicit upstream creation', () => {
    expect(
      normalizeBranchWorkspaceGitActionPlanRequest({
        kind: 'push',
        branchWorkspaceId: ' branch-1 ',
      }),
    ).toEqual({
      ok: true,
      request: { kind: 'push', branchWorkspaceId: 'branch-1' },
    })
    expect(
      normalizeBranchWorkspaceGitActionExecuteInput({
        kind: 'push',
        planToken: ' sha256:plan ',
        targets: [
          { repositoryName: ' web ', action: 'create-upstream', remote: ' fork ' },
          { repositoryName: 'api', action: 'push' },
        ],
      }),
    ).toEqual({
      ok: true,
      input: {
        kind: 'push',
        planToken: 'sha256:plan',
        targets: [
          { repositoryName: 'web', action: 'create-upstream', remote: 'fork' },
          { repositoryName: 'api', action: 'push' },
        ],
      },
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
    { kind: 'batch-discard', planToken: '' },
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
    { kind: 'batch-merge', planToken: 'sha256:plan', mode: 'merge', targets: [] },
    { kind: 'batch-merge-in', planToken: 'sha256:plan', mode: 'squash', sources: [] },
    { kind: 'batch-merge-in', planToken: 'sha256:plan', mode: 'merge', sources: [] },
    { kind: 'batch-merge-in', planToken: 'sha256:plan', mode: 'merge', targets: [] },
    { kind: 'batch-merge-out', planToken: 'sha256:plan', mode: 'squash', targets: [] },
    { kind: 'batch-merge-out', planToken: 'sha256:plan', mode: 'merge', targets: [] },
    { kind: 'batch-merge-out', planToken: 'sha256:plan', mode: 'merge', sources: [] },
    { kind: 'pull', planToken: 'sha256:plan' },
    { kind: 'push', planToken: 'sha256:plan', targets: [] },
    { kind: 'push', planToken: 'sha256:plan', repositoryNames: ['api'] },
    { kind: 'pull', planToken: 'sha256:plan', repositoryNames: ['api', 'api'] },
    {
      kind: 'push',
      planToken: 'sha256:plan',
      targets: [
        { repositoryName: 'api', action: 'push' },
        { repositoryName: 'api', action: 'create-upstream', remote: 'origin' },
      ],
    },
    {
      kind: 'push',
      planToken: 'sha256:plan',
      targets: [{ repositoryName: '../api', action: 'push' }],
    },
    {
      kind: 'push',
      planToken: 'sha256:plan',
      targets: [{ repositoryName: 'api', action: 'create-upstream', remote: '../origin' }],
    },
    {
      kind: 'push',
      planToken: 'sha256:plan',
      targets: [{ repositoryName: 'api', action: 'create-upstream' }],
    },
    {
      kind: 'push',
      planToken: 'sha256:plan',
      targets: [{ repositoryName: 'api', action: 'force' }],
    },
    {
      kind: 'batch-merge-in',
      planToken: 'sha256:plan',
      mode: 'merge',
      sources: [
        { repositoryName: 'api', sourceBranch: 'main' },
        { repositoryName: 'api', sourceBranch: 'release' },
      ],
    },
    {
      kind: 'batch-merge-in',
      planToken: 'sha256:plan',
      mode: 'merge',
      sources: [{ repositoryName: 'api', sourceBranch: 'main\nrelease' }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [
        { repositoryName: 'api', destinationBranch: 'main' },
        { repositoryName: 'api', destinationBranch: 'release' },
      ],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: '../api', destinationBranch: 'main' }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api\nweb', destinationBranch: 'main' }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api', destinationBranch: ' ' }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'merge',
      targets: [{ repositoryName: 'api', destinationBranch: 'main\u0000release' }],
    },
    {
      kind: 'batch-merge-in',
      planToken: 'sha256:plan',
      mode: 'merge',
      sources: [{ repositoryName: 'api', source: { kind: 'remote', remoteRef: 'origin/HEAD' } }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'pull-merge-push',
      targets: [{ repositoryName: 'api', destination: { kind: 'local', branch: 'HEAD' } }],
    },
    {
      kind: 'batch-merge-out',
      planToken: 'sha256:plan',
      mode: 'pull-merge-push',
      targets: [
        { repositoryName: 'api', destination: { kind: 'local', branch: 'main' } },
        { repositoryName: 'api', destination: { kind: 'remote', remoteRef: 'origin/main' } },
      ],
    },
  ])('rejects invalid execution input: %j', (value) => {
    expect(normalizeBranchWorkspaceGitActionExecuteInput(value)).toEqual({
      ok: false,
      message: 'error.invalid-arguments',
    })
  })
})
