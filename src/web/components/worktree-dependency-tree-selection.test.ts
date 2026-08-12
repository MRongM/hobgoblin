import { describe, expect, test } from 'vitest'
import {
  hasSelectedWorktreeDependencyAncestor,
  selectWorktreeDependency,
  setWorktreeDependencyMode,
} from '#/web/components/worktree-dependency-tree-selection.ts'

describe('worktree dependency tree selection', () => {
  test('selects new paths as copies by default', () => {
    expect(selectWorktreeDependency([], 'backend/.venv', true)).toEqual([
      { path: 'backend/.venv', mode: 'copy' },
    ])
  })

  test('replaces selected descendants when selecting their ancestor', () => {
    expect(
      selectWorktreeDependency(
        [
          { path: 'backend/.venv/bin', mode: 'copy' },
          { path: 'frontend/node_modules', mode: 'symlink' },
        ],
        'backend/.venv',
        true,
      ),
    ).toEqual([
      { path: 'frontend/node_modules', mode: 'symlink' },
      { path: 'backend/.venv', mode: 'copy' },
    ])
  })

  test('does not select a descendant while an ancestor is selected', () => {
    const current = [{ path: 'backend/.venv', mode: 'symlink' }] as const
    expect(selectWorktreeDependency(current, 'backend/.venv/bin', true)).toEqual(current)
    expect(hasSelectedWorktreeDependencyAncestor(current, 'backend/.venv/bin')).toBe(true)
    expect(hasSelectedWorktreeDependencyAncestor(current, 'backend/.venv')).toBe(false)
  })

  test('uses path segment boundaries for ancestry', () => {
    const current = [{ path: 'foo', mode: 'symlink' }] as const
    expect(hasSelectedWorktreeDependencyAncestor(current, 'foobar/cache')).toBe(false)
  })

  test('unselects a path and changes only its materialization mode', () => {
    const current = [
      { path: 'backend/.venv', mode: 'symlink' },
      { path: 'frontend/node_modules', mode: 'symlink' },
    ] as const
    expect(setWorktreeDependencyMode(current, 'backend/.venv', 'copy')).toEqual([
      { path: 'backend/.venv', mode: 'copy' },
      { path: 'frontend/node_modules', mode: 'symlink' },
    ])
    expect(selectWorktreeDependency(current, 'backend/.venv', false)).toEqual([
      { path: 'frontend/node_modules', mode: 'symlink' },
    ])
  })
})
