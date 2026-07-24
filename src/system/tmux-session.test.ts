import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execa } from 'execa'
import { describe, expect, test } from 'vitest'
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

const TMUX_AVAILABLE = process.platform !== 'win32' && spawnSync('tmux', ['-V'], { stdio: 'ignore' }).status === 0
const testWithTmux = TMUX_AVAILABLE ? test : test.skip

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
    expect(buildTmuxAttachShellCommand(REFERENCE_DESCRIPTOR)).toEqual({
      sessionName: 'hobgoblin-v1-aebf050981ac829e36100020',
      command:
        "exec tmux new-session -A -s 'hobgoblin-v1-aebf050981ac829e36100020' -c '/srv/projects/example/worktrees/feature'" +
        " \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' mouse on" +
        " \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_init_path '/srv/projects/example/worktrees/feature'" +
        " \\; set-option -t '=hobgoblin-v1-aebf050981ac829e36100020:' @hobgoblin_terminal_number '1'",
    })
  })

  test('quotes normalized path metadata and rejects invalid descriptors', () => {
    const invocation = buildTmuxAttachShellCommand({
      ...REFERENCE_DESCRIPTOR,
      workingDirectory: "/srv/user's feature/./",
    })

    expect(invocation?.command).toContain("@hobgoblin_init_path '/srv/user'\\''s feature'")
    expect(buildTmuxAttachShellCommand({ ...REFERENCE_DESCRIPTOR, terminalNumber: 0 })).toBeNull()
  })

  testWithTmux('persists fixed identity metadata in an isolated tmux server', async () => {
    const workingDirectory = await mkdtemp(join(tmpdir(), 'hobgoblin-tmux-metadata-'))
    const socketName = `hobgoblin-test-${process.pid}-${Date.now()}`
    const env = { ...process.env }
    delete env.TMUX

    try {
      const invocation = buildTmuxAttachShellCommand({
        projectRoot: workingDirectory,
        workingDirectory,
        terminalNumber: 7,
      })
      expect(invocation).not.toBeNull()
      const detachedCommand = invocation!.command.replace(
        /^exec tmux new-session -A/u,
        `tmux -L '${socketName}' -f /dev/null new-session -d`,
      )
      expect(detachedCommand).not.toBe(invocation!.command)

      await execa('sh', ['-c', detachedCommand], { env })
      const result = await execa(
        'tmux',
        [
          '-L',
          socketName,
          'list-sessions',
          '-F',
          '#{session_name}\t#{@hobgoblin_init_path}\t#{@hobgoblin_terminal_number}\t#{session_attached}',
        ],
        { env },
      )

      expect(result.stdout).toBe(`${invocation!.sessionName}\t${workingDirectory}\t7\t0`)
    } finally {
      await execa('tmux', ['-L', socketName, 'kill-server'], { env, reject: false })
      await rm(workingDirectory, { recursive: true, force: true })
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
})
