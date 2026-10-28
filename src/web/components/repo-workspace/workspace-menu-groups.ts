export const WORKSPACE_MENU_CATEGORIES = ['open', 'git', 'terminals', 'dependencies', 'manage'] as const
export type WorkspaceMenuCategory = (typeof WORKSPACE_MENU_CATEGORIES)[number]

export type WorkspaceMenuIcon =
  | 'files'
  | 'folder'
  | 'editor'
  | 'remote'
  | 'refresh'
  | 'fetch'
  | 'pull'
  | 'push'
  | 'upstream'
  | 'branch-add'
  | 'branch-switch'
  | 'tag'
  | 'commit'
  | 'merge-in'
  | 'merge-out'
  | 'patch'
  | 'align'
  | 'discard'
  | 'branch-remove'
  | 'terminal'
  | 'tmux'
  | 'restore'
  | 'inventory'
  | 'terminal-close'
  | 'cleanup'
  | 'dependency-add'
  | 'dependency-remove'
  | 'folder-add'
  | 'folder-import'
  | 'folder-copy'
  | 'rename'
  | 'worktree-remove'
  | 'forget'
  | 'close'
  | 'detect'
  | 'recovery'

export interface CategorizedWorkspaceAction {
  id: string
  category?: WorkspaceMenuCategory
  destructive?: boolean
}

export interface WorkspaceMenuSection<T> {
  category: WorkspaceMenuCategory
  groups: T[][]
}

interface MenuActionDefinition {
  category: WorkspaceMenuCategory
  group: number
  order: number
  icon: WorkspaceMenuIcon
  preserveIcon?: boolean
  destructive?: boolean
  topLevel?: boolean
}

// IDs describe operations, not their localized labels or the surface that rendered them.
const definitions: Record<string, MenuActionDefinition> = {
  fileArea: { category: 'open', group: 0, order: 0, icon: 'files' },
  openDirectory: { category: 'open', group: 0, order: 1, icon: 'folder' },
  editor: { category: 'open', group: 0, order: 2, icon: 'editor', preserveIcon: true },
  remote: { category: 'open', group: 0, order: 3, icon: 'remote', preserveIcon: true },

  refreshChanges: { category: 'git', group: 0, order: 0, icon: 'refresh' },
  sync: { category: 'git', group: 0, order: 1, icon: 'refresh' },
  fetchAllRepositories: { category: 'git', group: 0, order: 2, icon: 'fetch' },
  commit: { category: 'git', group: 1, order: 0, icon: 'commit' },
  copyPatch: { category: 'git', group: 1, order: 1, icon: 'patch' },
  checkout: { category: 'git', group: 2, order: 0, icon: 'branch-switch' },
  checkoutTo: { category: 'git', group: 2, order: 1, icon: 'branch-switch' },
  createBranch: { category: 'git', group: 2, order: 2, icon: 'branch-add' },
  pullRemoteBranch: { category: 'git', group: 2, order: 3, icon: 'fetch' },
  createTag: { category: 'git', group: 2, order: 4, icon: 'tag' },
  pull: { category: 'git', group: 3, order: 0, icon: 'pull' },
  push: { category: 'git', group: 3, order: 1, icon: 'push' },
  upstream: { category: 'git', group: 3, order: 2, icon: 'upstream' },
  merge: { category: 'git', group: 3, order: 3, icon: 'merge-in' },
  mergeOut: { category: 'git', group: 3, order: 4, icon: 'merge-out' },
  deleteBranch: { category: 'git', group: 4, order: 0, icon: 'branch-remove', destructive: true },
  alignRemote: { category: 'git', group: 4, order: 1, icon: 'align', destructive: true },
  resetHard: { category: 'git', group: 4, order: 2, icon: 'discard', destructive: true },

  terminal: { category: 'terminals', group: 0, order: 0, icon: 'terminal' },
  terminalPowerShell: { category: 'terminals', group: 0, order: 1, icon: 'terminal' },
  terminalWsl: { category: 'terminals', group: 0, order: 2, icon: 'terminal' },
  terminalTmux: { category: 'terminals', group: 0, order: 3, icon: 'tmux' },
  externalTerminal: { category: 'terminals', group: 0, order: 4, icon: 'terminal', preserveIcon: true },
  restoreTmuxTerminals: { category: 'terminals', group: 1, order: 0, icon: 'restore' },
  tmuxInventory: { category: 'terminals', group: 1, order: 1, icon: 'inventory' },
  closeAllTerminals: { category: 'terminals', group: 2, order: 0, icon: 'terminal-close', destructive: true },
  cleanupTmuxSessions: { category: 'terminals', group: 2, order: 1, icon: 'cleanup', destructive: true },

  addDependencies: { category: 'dependencies', group: 0, order: 0, icon: 'dependency-add' },
  removeDependencies: { category: 'dependencies', group: 1, order: 0, icon: 'dependency-remove', destructive: true },

  createWorktree: { category: 'manage', group: 0, order: 0, icon: 'folder-add' },
  addWorkspaceWorktree: { category: 'manage', group: 0, order: 1, icon: 'folder-add' },
  addMembers: { category: 'manage', group: 0, order: 2, icon: 'folder-add' },
  addWorkspaceFolder: { category: 'manage', group: 0, order: 3, icon: 'folder-import' },
  createWorkspaceFolder: { category: 'manage', group: 0, order: 4, icon: 'folder-add' },
  cloneWorkspace: { category: 'manage', group: 0, order: 5, icon: 'folder-copy' },
  renameWorkspace: { category: 'manage', group: 1, order: 0, icon: 'rename' },
  refreshFolder: { category: 'manage', group: 1, order: 1, icon: 'refresh', topLevel: true },
  detectWorkspaceRepositories: { category: 'manage', group: 1, order: 2, icon: 'detect' },
  cleanupWorktree: { category: 'manage', group: 1, order: 3, icon: 'recovery', destructive: false },
  unregisterWorkspace: { category: 'manage', group: 2, order: 0, icon: 'forget', destructive: false },
  closeProject: { category: 'manage', group: 2, order: 1, icon: 'close', destructive: false },
  removeWorktree: { category: 'manage', group: 3, order: 0, icon: 'worktree-remove', destructive: true },
  removeWorkspaceWorktree: { category: 'manage', group: 3, order: 1, icon: 'worktree-remove', destructive: true },
  removeMembers: { category: 'manage', group: 3, order: 2, icon: 'worktree-remove', destructive: true },
  deleteWorkspace: { category: 'manage', group: 3, order: 4, icon: 'worktree-remove', destructive: true },
  recoverWorkspace: { category: 'manage', group: 3, order: 3, icon: 'recovery', destructive: true },
}

const aliases: Record<string, string> = {
  'file-area.open': 'fileArea',
  'directory-open.action': 'openDirectory',
  'worktrees.open-in-editor-label': 'editor',
  'action.remote': 'remote',
  'action.refresh': 'sync',
  'workspace.repository.refresh-changes': 'refreshChanges',
  'workspace.branch-workspace.refresh-changes': 'refreshChanges',
  'workspace.branch-workspace.fetch-all': 'fetchAllRepositories',
  'workspace.branch-workspace.git-action.batch-commit': 'commit',
  'workspace.branch-workspace.git-action.batch-set-upstream': 'upstream',
  'workspace.branch-workspace.git-action.pull': 'pull',
  'workspace.branch-workspace.git-action.push': 'push',
  'workspace.branch-workspace.git-action.batch-merge-in': 'merge',
  'workspace.branch-workspace.git-action.batch-merge-out': 'mergeOut',
  'workspace.branch-workspace.git-action.batch-align-remote': 'alignRemote',
  'workspace.branch-workspace.git-action.batch-discard': 'resetHard',
  discardDetachedWorktreeChanges: 'resetHard',
  'terminal.internal': 'terminal',
  'terminal.internal-powershell': 'terminalPowerShell',
  'terminal.internal-wsl': 'terminalWsl',
  'terminal.new-with-tmux': 'terminalTmux',
  'terminal.restore-directory-tmux': 'restoreTmuxTerminals',
  'terminal.external': 'externalTerminal',
  'tmux.host-inventory.action': 'tmuxInventory',
  'tmux.cleanup.action': 'cleanupTmuxSessions',
  'workspace.branch-workspace.dependency.add.action': 'addDependencies',
  'workspace.branch-workspace.dependency.remove.action': 'removeDependencies',
  'workspace.branch-workspace.add-members': 'addMembers',
  'workspace.branch-workspace.member.add-worktree': 'addWorkspaceWorktree',
  'workspace.branch-workspace.member.remove-worktree': 'removeWorkspaceWorktree',
  'workspace.branch-workspace.folder-register.title': 'addWorkspaceFolder',
  'workspace.branch-workspace.create': 'createWorkspaceFolder',
  'workspace.branch-workspace.clone.title': 'cloneWorkspace',
  'workspace.branch-workspace.rename.action': 'renameWorkspace',
  'workspace.branch-workspace.refresh-folder': 'refreshFolder',
  'workspace.branch-workspace.remove-members': 'removeMembers',
  'workspace.branch-workspace.delete': 'deleteWorkspace',
  'workspace.branch-workspace.unregister': 'unregisterWorkspace',
  'workspace.recovery.action': 'recoverWorkspace',
}

export function workspaceMenuActionDefinition(id: string): MenuActionDefinition | undefined {
  return definitions[aliases[id] ?? id]
}

export function workspaceMenuCategory(id: string): WorkspaceMenuCategory | undefined {
  const defined = workspaceMenuActionDefinition(id)
  if (defined) return defined.category
  if (id.startsWith('terminal.') || id.startsWith('tmux.')) return 'terminals'
  if (id.startsWith('workspace.branch-workspace.git-action.')) return 'git'
  if (id.startsWith('workspace.branch-workspace.dependency.')) return 'dependencies'
  if (id.startsWith('workspace.recovery.')) return 'manage'
  return undefined
}

export function branchMenuCategory(id: string): WorkspaceMenuCategory {
  return workspaceMenuCategory(id) ?? 'git'
}

/** Fixed categories and semantic groups keep every surface independent of its caller's array order. */
export function groupWorkspaceMenuActions<T extends CategorizedWorkspaceAction>(
  groups: readonly (readonly T[])[],
): WorkspaceMenuSection<T>[] {
  const seen = new Set<string>()
  const entries = groups.flat().flatMap((action, index) => {
    const identity = aliases[action.id] ?? action.id
    if (seen.has(identity)) return []
    seen.add(identity)
    const definition = workspaceMenuActionDefinition(action.id)
    const destructive = definition?.destructive ?? action.destructive ?? false
    const category = workspaceMenuCategory(action.id) ?? action.category ?? 'manage'
    return [
      {
        action,
        index,
        category,
        destructive,
        group: destructive ? 100 : (definition?.group ?? 50),
        order: definition ? definition.group * 100 + definition.order : 999,
      },
    ]
  })
  return WORKSPACE_MENU_CATEGORIES.flatMap((category) => {
    const items = entries
      .filter((entry) => entry.category === category)
      .sort((left, right) => left.group - right.group || left.order - right.order || left.index - right.index)
    if (!items.length) return []
    const actionGroups: T[][] = []
    let currentGroup: number | undefined
    for (const item of items) {
      if (item.group !== currentGroup) {
        actionGroups.push([])
        currentGroup = item.group
      }
      actionGroups[actionGroups.length - 1]!.push(item.action)
    }
    return [{ category, groups: actionGroups }]
  })
}
