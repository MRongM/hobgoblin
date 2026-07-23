import { describe, expect, test } from 'vitest'
import { buildTmuxSessionName, normalizeTmuxSessionDescriptor } from '#/system/tmux-session.ts'

const REFERENCE_DESCRIPTOR = {
  projectRoot: '/srv/projects/example',
  workingDirectory: '/srv/projects/example/worktrees/feature',
  terminalNumber: 1,
}

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
