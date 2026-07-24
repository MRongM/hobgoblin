import { constants } from 'node:fs'
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { execa } from 'execa'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts/list-tmux-servers.sh')
const temporaryDirectories = new Set<string>()
const socketServers = new Set<Server>()

afterEach(async () => {
  await Promise.all(
    [...socketServers].map(
      async (server) =>
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()))
        }),
    ),
  )
  socketServers.clear()
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
})

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tmux-ls-'))
  temporaryDirectories.add(directory)
  return directory
}

function currentUid(): number {
  const uid = process.getuid?.()
  if (uid === undefined) throw new Error('expected a POSIX process UID')
  return uid
}

async function createSocket(socketDirectory: string, name: string): Promise<void> {
  await mkdir(socketDirectory, { recursive: true })
  const server = createServer()
  const socketPath = path.join(socketDirectory, name)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  })
  socketServers.add(server)
}

async function createFakeTmux(directory: string): Promise<string> {
  const binDirectory = path.join(directory, 'bin')
  const fakeTmuxPath = path.join(binDirectory, 'tmux')
  await mkdir(binDirectory, { recursive: true })
  await writeFile(
    fakeTmuxPath,
    [
      '#!/usr/bin/env bash',
      'set -euo pipefail',
      'printf \'%s\\n\' "$*" >> "${FAKE_TMUX_CALLS}"',
      'socket_path="${2:-}"',
      'server_name="${socket_path##*/}"',
      'if [[ "${3:-}" == "kill-server" ]]; then',
      '  case "${server_name}" in',
      '    kill-race)',
      "      printf 'no server running on %s\\n' \"${socket_path}\" >&2",
      '      exit 1',
      '      ;;',
      '    kill-error)',
      "      printf 'permission denied\\n' >&2",
      '      exit 1',
      '      ;;',
      '    *) exit 0 ;;',
      '  esac',
      'fi',
      'case "${server_name}" in',
      '  stale)',
      "    printf 'no server running on %s\\n' \"${socket_path}\" >&2",
      '    exit 1',
      '    ;;',
      '  broken)',
      "    printf 'operation not permitted\\n' >&2",
      '    exit 1',
      '    ;;',
      'esac',
      "printf 'name=%s-session\\twindows=1\\tattached=0\\n' \"${server_name}\"",
      '',
    ].join('\n'),
    'utf8',
  )
  await chmod(fakeTmuxPath, 0o755)
  return binDirectory
}

async function runScript(tmuxTmpDirectory: string, binDirectory: string, args: string[] = []) {
  return await execa('/bin/bash', [scriptPath, ...args], {
    env: {
      ...process.env,
      FAKE_TMUX_CALLS: path.join(path.dirname(binDirectory), 'tmux-calls.log'),
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      TMUX_TMPDIR: tmuxTmpDirectory,
    },
    reject: false,
  })
}

describe.skipIf(process.platform === 'win32')('list tmux servers script', () => {
  test('is directly executable', async () => {
    await expect(access(scriptPath, constants.X_OK)).resolves.toBeUndefined()
  })

  test('fails clearly when tmux is unavailable', async () => {
    const directory = await temporaryDirectory()
    const emptyBinDirectory = path.join(directory, 'empty-bin')
    await mkdir(emptyBinDirectory)

    const result = await execa('/bin/bash', [scriptPath], {
      env: { ...process.env, PATH: emptyBinDirectory, TMUX_TMPDIR: directory },
      reject: false,
    })

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('list-tmux-servers: tmux not found in PATH')
  })

  test('reports an absent socket directory as an empty result', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const binDirectory = await createFakeTmux(directory)

    const result = await runScript(tmuxTmpDirectory, binDirectory)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No running tmux servers found in ')
  })

  test('lists server sockets in deterministic order with their sessions', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'zulu')
    await createSocket(socketDirectory, 'alpha')

    const result = await runScript(tmuxTmpDirectory, binDirectory)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.indexOf('Server: alpha')).toBeLessThan(result.stdout.indexOf('Server: zulu'))
    expect(result.stdout).toContain(`Socket: ${path.join(socketDirectory, 'alpha')}`)
    expect(result.stdout).toContain('name=alpha-session\twindows=1\tattached=0')
    expect(result.stdout).toContain('name=zulu-session\twindows=1\tattached=0')
  })

  test('ignores stale sockets without failing the scan', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'stale')
    await createSocket(socketDirectory, 'zulu')

    const result = await runScript(tmuxTmpDirectory, binDirectory)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain('Server: stale')
    expect(result.stderr).toBe('')
    expect(result.stdout).toContain('Server: zulu')
  })

  test('continues after an unexpected query failure and exits nonzero', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'broken')
    await createSocket(socketDirectory, 'zulu')

    const result = await runScript(tmuxTmpDirectory, binDirectory)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Unable to query server broken')
    expect(result.stdout).toContain('name=zulu-session\twindows=1\tattached=0')
  })

  test('kills only the exact requested running server', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'alpha')
    await createSocket(socketDirectory, 'zulu')

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill', 'alpha'])
    const calls = await readFile(path.join(directory, 'tmux-calls.log'), 'utf8')
    const killCalls = calls.split('\n').filter((line) => line.endsWith(' kill-server'))

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('Closed server: alpha')
    expect(killCalls).toEqual([`-S ${path.join(socketDirectory, 'alpha')} kill-server`])
  })

  test('kills every running server while ignoring stale sockets', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'alpha')
    await createSocket(socketDirectory, 'stale')
    await createSocket(socketDirectory, 'zulu')

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill-all'])
    const calls = await readFile(path.join(directory, 'tmux-calls.log'), 'utf8')
    const killCalls = calls.split('\n').filter((line) => line.endsWith(' kill-server'))

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Closed server: alpha')
    expect(result.stdout).toContain('Closed server: zulu')
    expect(killCalls).toEqual([
      `-S ${path.join(socketDirectory, 'alpha')} kill-server`,
      `-S ${path.join(socketDirectory, 'zulu')} kill-server`,
    ])
  })

  test('treats a server that disappears during close as already stopped', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'kill-race')

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill', 'kill-race'])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('Server already stopped: kill-race')
  })

  test('continues closing remaining servers after one close failure', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const socketDirectory = path.join(tmuxTmpDirectory, `tmux-${currentUid()}`)
    const binDirectory = await createFakeTmux(directory)
    await createSocket(socketDirectory, 'kill-error')
    await createSocket(socketDirectory, 'zulu')

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill-all'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('Unable to stop server kill-error')
    expect(result.stdout).toContain('Closed server: zulu')
  })

  test('rejects a missing single-server target without closing anything', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const binDirectory = await createFakeTmux(directory)

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill', 'missing'])

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('No running tmux server named missing.')
  })

  test('rejects malformed arguments with usage and exit status 2', async () => {
    const directory = await temporaryDirectory()
    const tmuxTmpDirectory = path.join(directory, 'tmux-tmp')
    const binDirectory = await createFakeTmux(directory)

    const result = await runScript(tmuxTmpDirectory, binDirectory, ['--kill'])

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain('Usage:')
  })
})
