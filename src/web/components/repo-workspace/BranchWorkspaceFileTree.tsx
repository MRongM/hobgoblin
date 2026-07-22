import type { ReactNode } from 'react'
import { ProjectFileTree, type ProjectFileTreeContext } from '#/web/components/file-tree/ProjectFileTree.tsx'

export interface BranchWorkspaceFolderContext {
  rootId: string
  id: string
  branch: string
  path: string
  available: boolean
  busy: boolean
  managedRootNames: string[]
}

export function BranchWorkspaceFileTree({
  context,
  toolbarLeading,
}: {
  context: BranchWorkspaceFolderContext
  toolbarLeading?: ReactNode
}) {
  const folderContext: ProjectFileTreeContext = {
    repoId: context.rootId,
    worktreePath: context.path,
    branch: context.branch,
    isGitRepo: false,
    status: [],
    protectedRootNames: context.managedRootNames,
  }
  return <ProjectFileTree repoId={context.rootId} folderContext={folderContext} toolbarLeading={toolbarLeading} />
}
