import type { BranchWorkspaceLifecycle } from '#/shared/branch-workspaces.ts'
import {
  ProjectFileTree,
  type ProjectFileTreeContext,
} from '#/web/components/file-tree/ProjectFileTree.tsx'

export interface BranchWorkspaceFolderContext {
  rootId: string
  id: string
  branch: string
  path: string
  lifecycle: BranchWorkspaceLifecycle
  available: boolean
  managedRootNames: string[]
}

export function BranchWorkspaceFileTree({ context }: { context: BranchWorkspaceFolderContext }) {
  const folderContext: ProjectFileTreeContext = {
    repoId: context.rootId,
    worktreePath: context.path,
    branch: context.branch,
    isGitRepo: false,
    status: [],
    protectedRootNames: context.managedRootNames,
  }
  return <ProjectFileTree repoId={context.rootId} folderContext={folderContext} />
}
