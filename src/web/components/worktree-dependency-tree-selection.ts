import type {
  WorktreeBootstrapSelection,
  WorktreeBootstrapSelectionMode,
} from '#/shared/worktree-bootstrap-summary.ts'

export function isWorktreeDependencyDescendant(path: string, ancestor: string): boolean {
  return path.startsWith(`${ancestor}/`)
}

export function hasSelectedWorktreeDependencyAncestor(
  selections: readonly WorktreeBootstrapSelection[],
  path: string,
): boolean {
  return selections.some((selection) => isWorktreeDependencyDescendant(path, selection.path))
}

export function selectWorktreeDependency(
  selections: readonly WorktreeBootstrapSelection[],
  path: string,
  selected: boolean,
): WorktreeBootstrapSelection[] {
  if (!selected) return selections.filter((selection) => selection.path !== path)
  if (
    selections.some((selection) => selection.path === path) ||
    hasSelectedWorktreeDependencyAncestor(selections, path)
  ) {
    return [...selections]
  }
  return [
    ...selections.filter((selection) => !isWorktreeDependencyDescendant(selection.path, path)),
    { path, mode: 'symlink' },
  ]
}

export function setWorktreeDependencyMode(
  selections: readonly WorktreeBootstrapSelection[],
  path: string,
  mode: WorktreeBootstrapSelectionMode,
): WorktreeBootstrapSelection[] {
  return selections.map((selection) => (selection.path === path ? { ...selection, mode } : selection))
}
