import { beforeEach, describe, expect, test, vi } from 'vitest'
import { normalizeRemoteRepoId } from '#/shared/remote-repo.ts'

const platformState = vi.hoisted(() => ({ hostPlatform: 'linux' as NodeJS.Platform }))

vi.mock('#/web/bootstrap.ts', () => ({
  getInitialBootstrap: () => ({ hostPlatform: platformState.hostPlatform }),
}))

describe('supportsTmuxMenu', () => {
  beforeEach(() => {
    platformState.hostPlatform = 'linux'
  })

  test.each([
    { platform: 'linux' as const, projectRoot: '/workspace/repo', expected: true },
    { platform: 'darwin' as const, projectRoot: '/workspace/repo', expected: true },
    { platform: 'win32' as const, projectRoot: 'C:\\workspace\\repo', expected: false },
    {
      platform: 'win32' as const,
      projectRoot: normalizeRemoteRepoId({ alias: 'host', remotePath: '/workspace/repo' }),
      expected: true,
    },
    {
      platform: 'win32' as const,
      projectRoot: normalizeRemoteRepoId({ alias: 'distribution', remotePath: '/workspace/repo', transport: 'wsl' }),
      expected: true,
    },
  ])('returns $expected for $platform project $projectRoot', async ({ platform, projectRoot, expected }) => {
    platformState.hostPlatform = platform
    const { supportsTmuxMenu } = await import('#/web/tmux-menu.ts')

    expect(supportsTmuxMenu(projectRoot)).toBe(expected)
  })

  test('does not expose tmux actions without a project target', async () => {
    const { supportsTmuxMenu } = await import('#/web/tmux-menu.ts')

    expect(supportsTmuxMenu()).toBe(false)
  })
})
