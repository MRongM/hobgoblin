import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import * as tmuxSession from '#/system/tmux-session.ts'
import {
  buildTmuxAttachShellCommand,
  buildTmuxSessionName,
  isHobgoblinTmuxSessionName,
  normalizeTmuxSessionDescriptor,
  normalizeTmuxSessionPath,
} from '#/system/tmux-session.ts'

const REFERENCE_DESCRIPTOR = {
  projectRoot: '/srv/projects/example',
  workingDirectory: '/srv/projects/example/worktrees/feature',
  terminalNumber: 1,
}
const testWithTmux = process.platform !== 'win32' && spawnSync('tmux', ['-V']).status === 0 ? test : test.skip

describe('buildTmuxServerName', () => {
  test('derives a stable project-scoped server name from the normalized project root', () => {
    const buildServerName = (
      tmuxSession as typeof tmuxSession & { buildTmuxServerName?: (projectRoot: string) => string | null }
    ).buildTmuxServerName

    expect(buildServerName).toBeTypeOf('function')
    expect(buildServerName?.('/srv/projects/example')).toBe('hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0')
    expect(buildServerName?.('/srv//projects/example/./')).toBe('hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0')
    expect(buildServerName?.('srv/projects/example')).toBeNull()
  })
})

describe('buildTmuxSessionName', () => {
  test('matches the public v1 reference vector', () => {
    expect(buildTmuxSessionName(REFERENCE_DESCRIPTOR)).toBe('hobgoblin-v1-aebf050981ac829e36100020')
  })

  test('normalizes equivalent absolute POSIX paths lexically', () => {
    expect(
      buildTmuxSessionName({
        projectRoot: '//srv/projects/./example/',
        workingDirectory: '/srv/projects/example/worktrees/other/../feature/',
        terminalNumber: 1,
      }),
    ).toBe(buildTmuxSessionName(REFERENCE_DESCRIPTOR))
  })

  test('preserves logical path identity without resolving symbolic links', () => {
    const logical = buildTmuxSessionName({
      projectRoot: '/workspace/api-link',
      workingDirectory: '/workspace/api-link',
      terminalNumber: 1,
    })
    const physical = buildTmuxSessionName({
      projectRoot: '/repositories/api',
      workingDirectory: '/repositories/api',
      terminalNumber: 1,
    })

    expect(logical).not.toBe(physical)
  })

  test('changes for a different project root, working directory, or terminal number', () => {
    const base = buildTmuxSessionName(REFERENCE_DESCRIPTOR)

    expect(buildTmuxSessionName({ ...REFERENCE_DESCRIPTOR, projectRoot: '/srv/projects/other' })).not.toBe(base)
    expect(buildTmuxSessionName({ ...REFERENCE_DESCRIPTOR, workingDirectory: '/srv/projects/example' })).not.toBe(base)
    expect(buildTmuxSessionName({ ...REFERENCE_DESCRIPTOR, terminalNumber: 2 })).not.toBe(base)
  })

  test('supports Unicode, spaces, and apostrophes as path data', () => {
    expect(
      buildTmuxSessionName({
        projectRoot: '/srv/示例 project',
        workingDirectory: "/srv/示例 project/user's feature",
        terminalNumber: 3,
      }),
    ).toMatch(/^hobgoblin-v1-[a-f0-9]{24}$/)
  })

  test.each([
    { ...REFERENCE_DESCRIPTOR, projectRoot: 'srv/projects/example' },
    { ...REFERENCE_DESCRIPTOR, workingDirectory: 'worktrees/feature' },
    { ...REFERENCE_DESCRIPTOR, projectRoot: '/srv/projects/\0example' },
    { ...REFERENCE_DESCRIPTOR, workingDirectory: '/srv/projects/\nexample' },
    { ...REFERENCE_DESCRIPTOR, terminalNumber: 0 },
    { ...REFERENCE_DESCRIPTOR, terminalNumber: -1 },
    { ...REFERENCE_DESCRIPTOR, terminalNumber: 1.5 },
    { ...REFERENCE_DESCRIPTOR, terminalNumber: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects an invalid descriptor %#', (descriptor) => {
    expect(buildTmuxSessionName(descriptor)).toBeNull()
  })
})

describe('normalizeTmuxSessionDescriptor', () => {
  test('returns canonical descriptor fields', () => {
    expect(
      normalizeTmuxSessionDescriptor({
        projectRoot: '/srv/projects/./example/',
        workingDirectory: '/srv/projects/example/worktrees/feature//',
        terminalNumber: 7,
      }),
    ).toEqual({
      projectRoot: '/srv/projects/example',
      workingDirectory: '/srv/projects/example/worktrees/feature',
      terminalNumber: 7,
    })
  })
})

describe('buildTmuxAttachShellCommand', () => {
  test('writes fixed Hobgoblin identity metadata on the exact session', () => {
    const invocation = buildTmuxAttachShellCommand(REFERENCE_DESCRIPTOR)

    expect(invocation?.sessionName).toBe('hobgoblin-v1-aebf050981ac829e36100020')
    expect(invocation?.command).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature'",
    )
    expect(invocation?.command).toContain(
      "set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'",
    )
  })

  test('prefers the project server and falls back only to an existing legacy default session', () => {
    const invocation = buildTmuxAttachShellCommand(REFERENCE_DESCRIPTOR)
    const serverName = 'hobgoblin-project-v1-bfd9f8d97e0d5a8f0eb819d0'
    const target = '=hobgoblin-v1-aebf050981ac829e36100020'

    expect(invocation?.command).toContain(`tmux -L '${serverName}' has-session -t '${target}'`)
    expect(invocation?.command).toContain(`! tmux has-session -t '${target}'`)
    expect(invocation?.command).toContain(`exec tmux -L '${serverName}' new-session -A`)
    expect(invocation?.command).toContain('else\n  exec tmux new-session -A')
  })

  test('quotes normalized path metadata and rejects invalid descriptors', () => {
    const invocation = buildTmuxAttachShellCommand({
      ...REFERENCE_DESCRIPTOR,
      workingDirectory: "/srv/user's feature/./",
    })

    expect(invocation?.command).toContain("@hobgoblin_init_path '/srv/user'\\''s feature'")
    expect(buildTmuxAttachShellCommand({ ...REFERENCE_DESCRIPTOR, terminalNumber: 0 })).toBeNull()
  })

  testWithTmux('persists identity metadata in an isolated real tmux server', () => {
    const testRoot = mkdtempSync(path.join('/tmp', 'hobgoblin-tmux-metadata-'))
    const environment = { ...process.env, TERM: 'xterm-256color', TMUX_TMPDIR: testRoot }
    const invocation = buildTmuxAttachShellCommand({
      projectRoot: testRoot,
      workingDirectory: testRoot,
      terminalNumber: 1,
    })
    if (!invocation) throw new Error('expected a valid tmux invocation')
    const serverName = buildServerNameForTest(testRoot)

    try {
      const detachedCommand = invocation.command.replace(
        `exec tmux -L '${serverName}' new-session -A `,
        `exec tmux -L '${serverName}' -f /dev/null new-session -Ad `,
      )
      execFileSync('/bin/sh', ['-lc', detachedCommand], { env: environment, stdio: 'pipe' })
      const listed = execFileSync(
        'tmux',
        [
          '-L',
          serverName,
          '-f',
          '/dev/null',
          '-u',
          'list-sessions',
          '-F',
          '#{session_name}\t#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}\t#{session_attached}',
        ],
        { encoding: 'utf8', env: environment },
      ).trim()

      expect(listed).toBe(`${invocation.sessionName}\t${testRoot}\t1\t0`)
    } finally {
      spawnSync('tmux', ['-L', serverName, '-f', '/dev/null', 'kill-server'], { env: environment, stdio: 'ignore' })
      rmSync(testRoot, { force: true, recursive: true })
    }
  })
})

describe('tmux cleanup protocol helpers', () => {
  test('accepts only current Hobgoblin v1 session names', () => {
    expect(isHobgoblinTmuxSessionName('hobgoblin-v1-aebf050981ac829e36100020')).toBe(true)
    expect(isHobgoblinTmuxSessionName('hobgoblin-v1-AEBF050981AC829E36100020')).toBe(false)
    expect(isHobgoblinTmuxSessionName('hobgoblin-aebf050981ac829e36100020')).toBe(false)
    expect(isHobgoblinTmuxSessionName('goblin-aebf050981ac829e36100020')).toBe(false)
  })

  test('exposes the protocol lexical path normalizer', () => {
    expect(normalizeTmuxSessionPath('/srv//repo/./feature/')).toBe('/srv/repo/feature')
    expect(normalizeTmuxSessionPath('/srv/repo/feature/../other')).toBe('/srv/repo/other')
    expect(normalizeTmuxSessionPath('srv/repo')).toBeNull()
    expect(normalizeTmuxSessionPath('/srv/repo\nfeature')).toBeNull()
  })

  test('accepts only sessions whose initial path, terminal number, and name hash all match', () => {
    const resolveTerminalNumbers = (
      tmuxSession as typeof tmuxSession & {
        resolveTmuxSessionTerminalNumbers?: (
          projectRoot: string,
          sessions: Array<{ sessionName: string; initialPath: string; terminalNumber: number }>,
        ) => Map<string, number>
      }
    ).resolveTmuxSessionTerminalNumbers
    expect(resolveTerminalNumbers).toBeTypeOf('function')

    const terminalSevenName = buildTmuxSessionName({ ...REFERENCE_DESCRIPTOR, terminalNumber: 7 })!
    const unknownName = 'hobgoblin-v1-0123456789abcdef01234567'
    const resolved = resolveTerminalNumbers!(REFERENCE_DESCRIPTOR.projectRoot, [
      {
        sessionName: REFERENCE_DESCRIPTOR_NAME,
        initialPath: REFERENCE_DESCRIPTOR.workingDirectory,
        terminalNumber: 1,
      },
      {
        sessionName: terminalSevenName,
        initialPath: REFERENCE_DESCRIPTOR.workingDirectory,
        terminalNumber: 7,
      },
      {
        sessionName: terminalSevenName,
        initialPath: '/srv/projects/example/worktrees/other',
        terminalNumber: 7,
      },
      {
        sessionName: terminalSevenName,
        initialPath: REFERENCE_DESCRIPTOR.workingDirectory,
        terminalNumber: 8,
      },
      {
        sessionName: unknownName,
        initialPath: REFERENCE_DESCRIPTOR.workingDirectory,
        terminalNumber: 3,
      },
    ])

    expect([...resolved]).toEqual([
      [REFERENCE_DESCRIPTOR_NAME, 1],
      [terminalSevenName, 7],
    ])
  })
})

const REFERENCE_DESCRIPTOR_NAME = 'hobgoblin-v1-aebf050981ac829e36100020'

function buildServerNameForTest(projectRoot: string): string {
  const serverName = (
    tmuxSession as typeof tmuxSession & { buildTmuxServerName?: (projectRoot: string) => string | null }
  ).buildTmuxServerName?.(projectRoot)
  if (!serverName) throw new Error('expected a valid tmux server name')
  return serverName
}
