import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  ClipboardCopy,
  Code2,
  Download,
  ExternalLink,
  FileMinus2,
  FilePlus2,
  FolderDown,
  FolderInput,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  FolderSearch,
  GitBranch,
  GitBranchMinus,
  GitBranchPlus,
  GitCommitHorizontal,
  GitCompareArrows,
  GitFork,
  GitMerge,
  ListMinus,
  ListRestart,
  ListTree,
  Package,
  PanelRightOpen,
  PanelsTopLeft,
  Pencil,
  RefreshCw,
  ReplaceAll,
  RotateCcw,
  Settings2,
  SquareX,
  Tag,
  Terminal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import {
  workspaceMenuActionDefinition,
  type WorkspaceMenuCategory,
  type WorkspaceMenuIcon,
} from '#/web/components/repo-workspace/workspace-menu-groups.ts'

const categoryIcons: Record<WorkspaceMenuCategory, LucideIcon> = {
  open: FolderOpen,
  git: GitBranch,
  terminals: Terminal,
  dependencies: Package,
  manage: Settings2,
}

const actionIcons: Record<WorkspaceMenuIcon, LucideIcon> = {
  files: PanelRightOpen,
  folder: FolderOpen,
  editor: Code2,
  remote: ExternalLink,
  refresh: RefreshCw,
  fetch: Download,
  pull: ArrowDown,
  push: ArrowUp,
  upstream: GitFork,
  'branch-add': GitBranchPlus,
  'branch-switch': ArrowRightLeft,
  tag: Tag,
  commit: GitCommitHorizontal,
  'merge-in': GitMerge,
  'merge-out': GitCompareArrows,
  patch: ClipboardCopy,
  align: ReplaceAll,
  discard: RotateCcw,
  'branch-remove': GitBranchMinus,
  terminal: Terminal,
  tmux: PanelsTopLeft,
  restore: RotateCcw,
  inventory: ListTree,
  'terminal-close': SquareX,
  cleanup: Trash2,
  'dependency-add': FilePlus2,
  'dependency-remove': FileMinus2,
  'folder-add': FolderPlus,
  'folder-import': FolderInput,
  'folder-copy': FolderDown,
  rename: Pencil,
  'worktree-remove': FolderMinus,
  forget: ListMinus,
  close: X,
  detect: FolderSearch,
  recovery: ListRestart,
}

export function WorkspaceMenuCategoryIcon({ category }: { category: WorkspaceMenuCategory }) {
  const Icon = categoryIcons[category]
  return <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
}

/** Retain configured app/provider branding while normalizing the meaning and size of action icons. */
export function WorkspaceMenuActionIcon({
  action,
}: {
  action: { id: string; icon?: ReactNode; category?: WorkspaceMenuCategory; destructive?: boolean }
}) {
  const definition = workspaceMenuActionDefinition(action.id)
  const Icon = definition ? actionIcons[definition.icon] : categoryIcons[action.category ?? 'manage']
  const icon =
    definition?.preserveIcon && action.icon ? (
      action.icon
    ) : definition || !action.icon ? (
      <Icon className="size-4 text-current" />
    ) : (
      action.icon
    )
  const destructive = definition?.destructive ?? action.destructive
  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4 [&_img]:size-4 ${destructive ? 'text-danger' : 'text-muted-foreground'}`}
    >
      {icon}
    </span>
  )
}
