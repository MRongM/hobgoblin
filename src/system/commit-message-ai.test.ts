import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  execa: vi.fn(),
  access: vi.fn(),
  readdir: vi.fn(),
  homedir: vi.fn(() => '/Users/test'),
}))

vi.mock('execa', () => ({
  execa: mocks.execa,
}))
vi.mock('node:fs/promises', () => ({
  access: mocks.access,
  readdir: mocks.readdir,
}))
vi.mock('node:os', () => ({
  default: { homedir: mocks.homedir },
}))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mocks.access.mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))
  mocks.readdir.mockResolvedValue([])
  mocks.homedir.mockReturnValue('/Users/test')
})

describe('commit message AI providers', () => {
  test('probes codex and claude availability without shell interpolation', async () => {
    mocks.execa
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))

    const { probeCommitMessageProviders } = await import('#/system/commit-message-ai.ts')
    await expect(probeCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })

    expect(mocks.execa).toHaveBeenNthCalledWith(1, 'codex', ['--version'], expect.objectContaining({ reject: false }))
    expect(mocks.execa).toHaveBeenNthCalledWith(2, 'claude', ['--version'], expect.objectContaining({ reject: false }))
  })

  test('probes providers from user install locations when GUI PATH misses them', async () => {
    const codexPath = '/Users/test/.nvm/versions/node/v22.16.0/bin/codex'
    mocks.readdir.mockResolvedValueOnce([{ name: 'v22.16.0', isDirectory: () => true }])
    mocks.access.mockImplementation(async (candidate: string) => {
      if (candidate === codexPath) return
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    mocks.execa
      .mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ENOENT' }))
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockRejectedValue(Object.assign(new Error('missing'), { code: 'ENOENT' }))

    const { probeCommitMessageProviders } = await import('#/system/commit-message-ai.ts')
    await expect(probeCommitMessageProviders()).resolves.toEqual({ codex: true, claude: false })

    expect(mocks.execa).toHaveBeenCalledWith(codexPath, ['--version'], expect.objectContaining({ reject: false }))
  })

  test('rejects empty patches before invoking a provider', async () => {
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')
    await expect(generateCommitMessageFromPatch('codex', '   ')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-patch',
    })
    expect(mocks.execa).not.toHaveBeenCalled()
  })

  test('invokes codex in JSONL non-interactive read-only mode', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
        JSON.stringify({ type: 'turn.started' }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_1', type: 'agent_message', text: 'feat: add generated summary' },
        }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 6 } }),
      ].join('\n'),
      stderr: '',
    })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n', { cwd: '/repo' })).resolves.toEqual({
      ok: true,
      message: 'feat: add generated summary',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      'codex',
      ['exec', '--json', expect.stringContaining('Return only the commit message.')],
      expect.objectContaining({
        cwd: '/repo',
        reject: false,
        stdin: 'ignore',
      }),
    )
    expect(mocks.execa.mock.calls[0]![2]).not.toHaveProperty('input')
  })

  test('uses the final non-empty codex agent message from JSONL output', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: [
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_1', type: 'agent_message', text: 'draft: first message' },
        }),
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_2', type: 'tool_call', text: 'ignored tool text' },
        }),
        'not-json',
        JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_3', type: 'agent_message', text: 'fix: parse codex jsonl' },
        }),
      ].join('\n'),
      stderr: '',
    })

    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: true,
      message: 'fix: parse codex jsonl',
    })
  })

  test('returns empty-output when codex JSONL has no agent message', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: [
        JSON.stringify({ type: 'thread.started', thread_id: 'thread_1' }),
        JSON.stringify({ type: 'turn.started' }),
        JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 0 } }),
      ].join('\n'),
      stderr: '',
    })

    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-output',
    })
  })

  test('generates with a resolved user install executable when direct PATH lookup fails', async () => {
    const codexPath = '/Users/test/.nvm/versions/node/v22.16.0/bin/codex'
    mocks.readdir.mockResolvedValueOnce([{ name: 'v22.16.0', isDirectory: () => true }])
    mocks.access.mockImplementation(async (candidate: string) => {
      if (candidate === codexPath) return
      throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })
    mocks.execa
      .mockResolvedValueOnce({ failed: true, code: 'ENOENT', stdout: '', stderr: '' })
      .mockResolvedValueOnce({ exitCode: 1, stdout: '' })
      .mockResolvedValueOnce({ exitCode: 0 })
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: JSON.stringify({
          type: 'item.completed',
          item: { id: 'item_1', type: 'agent_message', text: 'feat: use resolved codex' },
        }),
        stderr: '',
      })

    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n', { cwd: '/repo' })).resolves.toEqual({
      ok: true,
      message: 'feat: use resolved codex',
    })

    expect(mocks.execa).toHaveBeenLastCalledWith(
      codexPath,
      ['exec', '--json', expect.stringContaining('Return only the commit message.')],
      expect.objectContaining({
        cwd: '/repo',
        env: expect.objectContaining({ PATH: expect.stringContaining('/Users/test/.nvm/versions/node/v22.16.0/bin') }),
        reject: false,
        stdin: 'ignore',
      }),
    )
    expect(mocks.execa.mock.calls.at(-1)![2]).not.toHaveProperty('input')
  })

  test('invokes claude with print mode and tools disabled', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 0, stdout: 'fix: handle dialog state', stderr: '' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: true,
      message: 'fix: handle dialog state',
    })

    expect(mocks.execa).toHaveBeenCalledWith(
      'claude',
      ['--print', '--output-format', 'text', '--tools', '', '--no-session-persistence'],
      expect.objectContaining({
        input: expect.stringContaining('Return only the commit message.'),
        reject: false,
      }),
    )
  })

  test('normalizes fenced and prefixed provider output', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '```text\nCommit message: feat: generate commit messages\n\nAdd Codex and Claude buttons.\n```',
      stderr: '',
    })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: true,
      message: 'feat: generate commit messages\n\nAdd Codex and Claude buttons.',
    })
  })

  test('omits binary patch payloads and caps prompt size before invoking providers', async () => {
    mocks.execa.mockResolvedValueOnce({
      exitCode: 0,
      stdout: JSON.stringify({
        type: 'item.completed',
        item: { id: 'item_1', type: 'agent_message', text: 'chore: summarize large change' },
      }),
      stderr: '',
    })
    const binaryPayload = 'A'.repeat(200_000)
    const patch = [
      'diff --git a/assets/icon.png b/assets/icon.png',
      'index 1111111..2222222 100644',
      'GIT binary patch',
      'literal 200000',
      binaryPayload,
      'diff --git a/src/example.ts b/src/example.ts',
      '--- a/src/example.ts',
      '+++ b/src/example.ts',
      '@@ -1 +1 @@',
      '-old',
      '+new',
    ].join('\n')

    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')
    await expect(generateCommitMessageFromPatch('codex', patch)).resolves.toEqual({
      ok: true,
      message: 'chore: summarize large change',
    })

    const prompt = mocks.execa.mock.calls[0]![1][2] as string
    expect(prompt).toContain('[binary diff omitted: assets/icon.png]')
    expect(prompt).toContain('diff --git a/src/example.ts b/src/example.ts')
    expect(prompt).not.toContain(binaryPayload)
    expect(prompt.length).toBeLessThan(130_000)
  })

  test('maps timeout and empty output to stable error keys', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: '', timedOut: true })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-timeout',
    })

    mocks.execa.mockResolvedValueOnce({ exitCode: 0, stdout: 'Commit message:', stderr: '' })
    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'error.commit-message-empty-output',
    })
  })

  test('returns provider stderr for non-timeout failures', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 1, stdout: '', stderr: 'not logged in' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('claude', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'not logged in',
    })
  })

  test('returns provider stdout for non-timeout failures when stderr is empty', async () => {
    mocks.execa.mockResolvedValueOnce({ exitCode: 1, stdout: 'Codex auth token expired', stderr: '' })
    const { generateCommitMessageFromPatch } = await import('#/system/commit-message-ai.ts')

    await expect(generateCommitMessageFromPatch('codex', 'diff --git a/a b/a\n+hello\n')).resolves.toEqual({
      ok: false,
      message: 'Codex auth token expired',
    })
  })
})
