import { describe, expect, test } from 'vitest'
import { classifySshFailure, testRemoteRepository } from '#/system/ssh/diagnostics.ts'
import type { RemoteCommandKind, RemoteCommandResult } from '#/system/ssh/commands.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'

describe('classifySshFailure', () => {
  test('classifies connection reset during ssh handshake as handshake failure', () => {
    expect(
      classifySshFailure({
        ok: false,
        stdout: '',
        stderr:
          'kex_exchange_identification: read: Connection reset by peer\nConnection reset by 100.64.1.18 port 2222',
        message: 'Command failed with exit code 255',
        timedOut: false,
      }),
    ).toBe('handshake-failed')
  })

  test('keeps shell-failed for generic post-connect ssh errors', () => {
    expect(
      classifySshFailure({
        ok: false,
        stdout: '',
        stderr: 'remote command failed unexpectedly',
        message: 'Command failed with exit code 255',
        timedOut: false,
      }),
    ).toBe('shell-failed')
  })
})

const target: RemoteRepoTarget = {
  id: 'ssh-config://prod/srv/app',
  alias: 'prod',
  host: 'example.com',
  user: 'alice',
  port: 22,
  remotePath: '/srv/app',
  displayName: 'prod:app',
}

function ok(stdout = 'ok'): RemoteCommandResult {
  return { ok: true, stdout, stderr: '', message: 'ok', timedOut: false }
}

function fail(message: string): RemoteCommandResult {
  return { ok: false, stdout: '', stderr: message, message, timedOut: false }
}

describe('testRemoteRepository', () => {
  test('passes when ssh, shell, and directory path checks pass without running git checks', async () => {
    const calls: RemoteCommandKind['type'][] = []

    const result = await testRemoteRepository(target, {
      run: async (command) => {
        calls.push(command.type)
        switch (command.type) {
          case 'checkShell':
            return ok('ok')
          case 'testDirectory':
            return ok('')
          case 'checkGit':
          case 'revParseTopLevel':
          case 'listDirectories':
          case 'printHome':
            throw new Error(`unexpected command: ${command.type}`)
        }
        throw new Error(`unexpected command: ${command.type}`)
      },
    })

    expect(result.ok).toBe(true)
    expect(calls).toEqual(['checkShell', 'testDirectory'])
    expect(result.stages).toEqual([
      { name: 'ssh', label: 'ssh', status: 'passed' },
      { name: 'shell', label: 'shell', status: 'passed' },
      { name: 'git', label: 'git', status: 'skipped' },
      { name: 'path', label: 'path', status: 'passed' },
      { name: 'repo', label: 'repo', status: 'skipped' },
    ])
  })

  test('fails on missing remote directory without running git checks', async () => {
    const calls: RemoteCommandKind['type'][] = []

    const result = await testRemoteRepository(target, {
      run: async (command) => {
        calls.push(command.type)
        switch (command.type) {
          case 'checkShell':
            return ok('ok')
          case 'testDirectory':
            return fail('missing')
          case 'checkGit':
          case 'revParseTopLevel':
          case 'listDirectories':
          case 'printHome':
            throw new Error(`unexpected command: ${command.type}`)
        }
        throw new Error(`unexpected command: ${command.type}`)
      },
    })

    expect(result.ok).toBe(false)
    expect(result.category).toBe('path-missing')
    expect(calls).toEqual(['checkShell', 'testDirectory'])
    expect(result.stages[2]).toEqual({ name: 'git', label: 'git', status: 'skipped' })
    expect(result.stages[3]).toMatchObject({ name: 'path', status: 'failed', category: 'path-missing' })
    expect(result.stages[4]).toEqual({ name: 'repo', label: 'repo', status: 'skipped' })
  })

  test('fails on shell command mismatch without running path or git checks', async () => {
    const calls: RemoteCommandKind['type'][] = []

    const result = await testRemoteRepository(target, {
      run: async (command) => {
        calls.push(command.type)
        switch (command.type) {
          case 'checkShell':
            return ok('unexpected')
          case 'testDirectory':
          case 'checkGit':
          case 'revParseTopLevel':
          case 'listDirectories':
          case 'printHome':
            throw new Error(`unexpected command: ${command.type}`)
        }
        throw new Error(`unexpected command: ${command.type}`)
      },
    })

    expect(result.ok).toBe(false)
    expect(result.category).toBe('shell-failed')
    expect(calls).toEqual(['checkShell'])
    expect(result.stages).toEqual([
      { name: 'ssh', label: 'ssh', status: 'passed' },
      {
        name: 'shell',
        label: 'shell',
        status: 'failed',
        category: 'shell-failed',
        message: 'shell-failed',
        details: 'unexpected',
      },
      { name: 'git', label: 'git', status: 'skipped' },
      { name: 'path', label: 'path', status: 'skipped' },
      { name: 'repo', label: 'repo', status: 'skipped' },
    ])
  })
})
