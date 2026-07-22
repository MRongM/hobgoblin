import type { ReactNode } from 'react'
import { describe, expect, test, vi } from 'vitest'
import type { BranchActionItem, BranchActionItemGroups } from '#/web/hooks/useBranchActionItems.tsx'
import type { BranchActionItemId } from '#/web/hooks/useBranchActions.tsx'
import { projectWorktreeListItemActions } from '#/web/components/branch-list/worktree-list-item-actions.ts'

function action(id: BranchActionItemId, overrides: Partial<BranchActionItem> = {}): BranchActionItem {
  return {
    id,
    label: id,
    disabled: false,
    visible: true,
    icon: null as ReactNode,
    onSelect: vi.fn(),
    ...overrides,
  }
}

function actionGroups(): BranchActionItemGroups {
  return {
    externalItems: [action('editor'), action('terminal'), action('externalTerminal'), action('remote')],
    mainItems: [
      action('checkout', { visible: false }),
      action('pull', { disabled: true }),
      action('push'),
      action('createWorktree'),
      action('sync'),
      action('createBranch'),
      action('pullRemoteBranch'),
      action('checkoutTo'),
      action('merge'),
      action('commit'),
      action('copyPatch'),
    ],
    patchItems: [action('createTag')],
    destructiveItems: [
      action('closeAllTerminals', { menuOnly: true }),
      action('removeWorktree', { destructive: true }),
      action('cleanupWorktree', { destructive: true }),
      action('deleteBranch', { destructive: true }),
      action('resetHard', { destructive: true }),
    ],
    dialogs: null,
  }
}

function ids(groups: ReturnType<typeof projectWorktreeListItemActions>['menuGroups']): string[][] {
  return groups.map((group) => group.map((item) => item.id))
}

describe('projectWorktreeListItemActions', () => {
  test('preserves the ordinary worktree quick actions and existing menu projection', () => {
    const projection = projectWorktreeListItemActions(actionGroups(), {
      policy: 'ordinary-worktree',
      hasWorktree: true,
    })

    expect(projection.editor?.id).toBe('editor')
    expect(projection.internalTerminal?.id).toBe('terminal')
    expect(ids(projection.menuGroups)).toEqual([
      ['externalTerminal', 'remote'],
      ['pull', 'push', 'createBranch', 'pullRemoteBranch', 'checkoutTo', 'merge', 'commit', 'copyPatch'],
      ['createTag'],
      ['closeAllTerminals', 'removeWorktree', 'cleanupWorktree', 'resetHard'],
    ])
    expect(projection.menuGroups[1]?.[0]?.disabled).toBe(true)
    expect(projection.contextMenu.editor.disabled).toBe(false)
    expect(projection.contextMenu.internalTerminal.disabled).toBe(false)
  })

  test('retains the ordinary non-worktree branch projection', () => {
    const projection = projectWorktreeListItemActions(actionGroups(), {
      policy: 'ordinary-worktree',
      hasWorktree: false,
    })

    expect(projection.editor).toBeUndefined()
    expect(projection.internalTerminal).toBeUndefined()
    expect(ids(projection.menuGroups)).toEqual([
      ['editor', 'terminal', 'externalTerminal', 'remote'],
      [
        'checkout',
        'pull',
        'push',
        'createWorktree',
        'sync',
        'createBranch',
        'pullRemoteBranch',
        'checkoutTo',
        'merge',
        'commit',
        'copyPatch',
      ],
      ['createTag'],
      ['closeAllTerminals', 'removeWorktree', 'cleanupWorktree', 'deleteBranch', 'resetHard'],
    ])
  })

  test('projects only safe member worktree actions in stable groups', () => {
    const projection = projectWorktreeListItemActions(actionGroups(), {
      policy: 'branch-workspace-member',
      hasWorktree: true,
    })

    expect(ids(projection.menuGroups)).toEqual([
      ['externalTerminal', 'remote'],
      ['pull', 'push', 'createBranch', 'pullRemoteBranch', 'merge', 'commit', 'copyPatch'],
      ['createTag'],
      ['closeAllTerminals', 'resetHard'],
    ])
    expect(projection.menuGroups[1]?.[0]?.disabled).toBe(true)
  })

  test('keeps allowed member actions visible but disabled when the row is unavailable', () => {
    const projection = projectWorktreeListItemActions(actionGroups(), {
      policy: 'branch-workspace-member',
      hasWorktree: true,
      forceDisabled: true,
    })

    expect(projection.menuGroups.flat()).not.toHaveLength(0)
    expect(projection.menuGroups.flat().every((item) => item.disabled)).toBe(true)
    expect(projection.editor?.disabled).toBe(true)
    expect(projection.internalTerminal?.disabled).toBe(true)
    expect(projection.contextMenu.externalTerminal.disabled).toBe(true)
  })
})
