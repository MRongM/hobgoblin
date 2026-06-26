import { beforeEach, describe, expect, test, vi } from 'vitest'

const gitResultWithOptionsMock = vi.hoisted(() => vi.fn())

vi.mock('#/system/git/helper.ts', async () => {
  const actual = await vi.importActual<typeof import('#/system/git/helper.ts')>('#/system/git/helper.ts')
  return {
    ...actual,
    gitResultWithOptions: vi.fn((cwd: string, opts: unknown, ...args: string[]) =>
      gitResultWithOptionsMock(cwd, opts, ...args),
    ),
  }
})

describe('cloneRepository', () => {
  beforeEach(() => {
    gitResultWithOptionsMock.mockReset()
    gitResultWithOptionsMock.mockResolvedValue({ ok: true, message: 'cloned' })
  })

  test('uses configured git network timeout and proxy env', async () => {
    const { cloneRepository } = await import('#/system/git/clone.ts')
    const signal = new AbortController().signal

    await expect(
      cloneRepository('/repos', 'project', 'https://example.com/acme/project.git', signal, {
        timeoutMs: 240_000,
        proxyUrl: 'socks5://127.0.0.1:7890',
      }),
    ).resolves.toEqual({ ok: true, message: 'cloned', path: '/repos/project' })

    expect(gitResultWithOptionsMock).toHaveBeenCalledWith(
      '/repos',
      expect.objectContaining({
        timeoutMs: 240_000,
        signal,
        env: expect.objectContaining({ ALL_PROXY: 'socks5://127.0.0.1:7890' }),
      }),
      'clone',
      '--',
      'https://example.com/acme/project.git',
      '/repos/project',
    )
  })
})
