import { constants } from 'node:fs'
import { access, chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { execa } from 'execa'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const scriptPath = path.join(repoRoot, 'scripts/cleanup-detached-hobgoblin-tmux.sh')
const temporaryDirectories = new Set<string>()

afterEach(async () => {
  await Promise.all([...temporaryDirectories].map((directory) => rm(directory, { recursive: true, force: true })))
  temporaryDirectories.clear()
})

type Scenario =
  | 'eligible'
  | 'list-error'
  | 'missing-on-kill'
  | 'missing-on-recheck'
  | 'no-server'
  | 'reattached'
  | 'unrelated-only'

async function runScenario(scenario: Scenario) {
  const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), 'hobgoblin-tmux-cleanup-'))
  temporaryDirectories.add(fixtureDirectory)

  const callsPath = path.join(fixtureDirectory, 'calls.log')
  const fakeTmuxPath = path.join(fixtureDirectory, 'tmux')
  const fakeTmux = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    'printf \'%s\\n\' "$*" >> "${FAKE_TMUX_CALLS}"',
    'case "${1:-}" in',
    '  list-sessions)',
    '    case "${FAKE_TMUX_SCENARIO}" in',
    '      eligible)',
    "        printf '%s\\t%s\\n' '$1' 'hobgoblin-v1-0123456789abcdef01234567'",
    "        printf '%s\\t%s\\n' '$2' 'user-session'",
    '        ;;',
    '      reattached)',
    "        printf '%s\\t%s\\n' '$3' 'hobgoblin-v1-89abcdef0123456789abcdef'",
    '        ;;',
    '      no-server)',
    "        printf 'no server running on /tmp/tmux-test\\n' >&2",
    '        exit 1',
    '        ;;',
    '      list-error)',
    "        printf 'error connecting to tmux socket: Operation not permitted\\n' >&2",
    '        exit 1',
    '        ;;',
    '      missing-on-recheck)',
    "        printf '%s\\t%s\\n' '$4' 'hobgoblin-v1-111111111111111111111111'",
    '        ;;',
    '      missing-on-kill)',
    "        printf '%s\\t%s\\n' '$5' 'hobgoblin-v1-222222222222222222222222'",
    '        ;;',
    '      unrelated-only)',
    "        printf '%s\\t%s\\n' '$6' 'user-session'",
    '        ;;',
    '      *)',
    '        printf \'unsupported scenario: %s\\n\' "${FAKE_TMUX_SCENARIO}" >&2',
    '        exit 2',
    '        ;;',
    '    esac',
    '    ;;',
    '  display-message)',
    '    case "${FAKE_TMUX_SCENARIO}" in',
    "      eligible | missing-on-kill) printf '0\\n' ;;",
    "      reattached) printf '1\\n' ;;",
    '      missing-on-recheck)',
    '        printf "can\'t find session: \\$4\\n" >&2',
    '        exit 1',
    '        ;;',
    '    esac',
    '    ;;',
    '  kill-session)',
    '    if [[ "${FAKE_TMUX_SCENARIO}" == missing-on-kill ]]; then',
    '      printf "can\'t find session: \\$5\\n" >&2',
    '      exit 1',
    '    fi',
    '    ;;',
    '  *)',
    '    printf \'unsupported command: %s\\n\' "${1:-}" >&2',
    '    exit 2',
    '    ;;',
    'esac',
    '',
  ].join('\n')

  await writeFile(fakeTmuxPath, fakeTmux, 'utf8')
  await chmod(fakeTmuxPath, 0o755)

  const result = await execa('/bin/bash', [scriptPath], {
    env: {
      ...process.env,
      PATH: `${fixtureDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
      FAKE_TMUX_CALLS: callsPath,
      FAKE_TMUX_SCENARIO: scenario,
    },
    reject: false,
  })
  const calls = await readFile(callsPath, 'utf8').catch(() => '')

  return { calls, result }
}

describe.skipIf(process.platform === 'win32')('cleanup detached Hobgoblin tmux script', () => {
  test('is directly executable', async () => {
    await expect(access(scriptPath, constants.X_OK)).resolves.toBeUndefined()
  })

  test('kills detached current-protocol sessions by ID and ignores unrelated sessions', async () => {
    const run = await runScenario('eligible')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toContain('Closed hobgoblin-v1-0123456789abcdef01234567 ($1)')
    expect(run.calls).toContain('kill-session -t $1')
    expect(run.calls).not.toContain('kill-session -t $2')
  })

  test('skips a detached candidate that becomes attached before cleanup', async () => {
    const run = await runScenario('reattached')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toContain('Skipped hobgoblin-v1-89abcdef0123456789abcdef ($3): attached by 1 client(s)')
    expect(run.calls).not.toContain('kill-session -t $3')
  })

  test('treats a missing tmux server as an empty cleanup', async () => {
    const run = await runScenario('no-server')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toBe('No detached Hobgoblin tmux sessions.')
  })

  test('surfaces unexpected list failures', async () => {
    const run = await runScenario('list-error')

    expect(run.result.exitCode).toBe(1)
    expect(run.result.stderr).toContain('unable to list detached sessions')
    expect(run.result.stderr).toContain('Operation not permitted')
  })

  test('treats a session missing during the attachment recheck as already cleaned', async () => {
    const run = await runScenario('missing-on-recheck')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toContain('Skipped hobgoblin-v1-111111111111111111111111 ($4): session no longer exists')
    expect(run.calls).not.toContain('kill-session -t $4')
  })

  test('treats a session missing during kill as already cleaned', async () => {
    const run = await runScenario('missing-on-kill')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toContain('Skipped hobgoblin-v1-222222222222222222222222 ($5): session no longer exists')
    expect(run.calls).toContain('kill-session -t $5')
  })

  test('reports an empty cleanup when detached sessions belong to other tools', async () => {
    const run = await runScenario('unrelated-only')

    expect(run.result.exitCode).toBe(0)
    expect(run.result.stdout).toBe('No detached Hobgoblin tmux sessions.')
    expect(run.calls).not.toContain('kill-session')
  })
})
