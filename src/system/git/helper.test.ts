import { afterEach, describe, expect, test, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { git } from '#/system/git/helper.ts'

const { resolveGitExecutableMock } = vi.hoisted(() => ({
  resolveGitExecutableMock: vi.fn(),
}))

vi.mock('#/system/git/executable.ts', () => ({
  resolveGitExecutable: resolveGitExecutableMock,
}))

let tmp: string | null = null

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = null
})

describe('git', () => {
  test('times out promptly when git ignores SIGTERM', async () => {
    tmp = mkdtempSync(path.join(os.tmpdir(), 'gbl-helper-test-'))
    const fakeGit = path.join(tmp, 'fake-git.mjs')
    writeFileSync(fakeGit, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1_000)\n")
    resolveGitExecutableMock.mockReturnValue(process.execPath)

    const started = performance.now()
    let err: unknown
    try {
      await git(tmp, [fakeGit], { timeoutMs: 300 })
    } catch (caught) {
      err = caught
    }

    expect(err).toBeInstanceOf(Error)
    expect((err as { timedOut?: boolean }).timedOut).toBe(true)
    expect(performance.now() - started).toBeLessThan(1_500)
  })
})
