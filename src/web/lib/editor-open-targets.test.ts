import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  openRepositoryEditor: vi.fn(),
  openRemoteRepositoryEditor: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({ openRepositoryEditor: mocks.openRepositoryEditor }))
vi.mock('#/web/remote-client.ts', () => ({ openRemoteRepositoryEditor: mocks.openRemoteRepositoryEditor }))

describe('openWorktreeEditorTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.openRepositoryEditor.mockResolvedValue({ ok: true, message: '/repo/src/app.ts' })
    mocks.openRemoteRepositoryEditor.mockResolvedValue({ ok: true, message: '/srv/repo/src/app.ts' })
  })

  test('resolves relative targets against local worktree paths', async () => {
    const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

    await openWorktreeEditorTarget('/repo', '/repo', { path: 'src/app.ts', line: 12 })

    expect(mocks.openRepositoryEditor).toHaveBeenCalledWith({ path: '/repo/src/app.ts', line: 12 })
    expect(mocks.openRemoteRepositoryEditor).not.toHaveBeenCalled()
  })

  test('resolves relative targets against remote worktree paths', async () => {
    const { openWorktreeEditorTarget } = await import('#/web/lib/editor-open-targets.ts')

    await openWorktreeEditorTarget('ssh-config://prod/srv/repo', '/srv/repo', {
      path: 'src/app.ts',
      line: 12,
      column: 3,
    })

    expect(mocks.openRemoteRepositoryEditor).toHaveBeenCalledWith('ssh-config://prod/srv/repo', {
      path: '/srv/repo/src/app.ts',
      line: 12,
      column: 3,
    })
    expect(mocks.openRepositoryEditor).not.toHaveBeenCalled()
  })
})
