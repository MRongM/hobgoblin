import { createContext, useContext } from 'react'

export interface BranchWorkspaceMemberScope {
  workspaceRootId: string
  branchWorkspaceId: string
  repositoryName: string
}

export const BranchWorkspaceMemberContext = createContext<BranchWorkspaceMemberScope | null>(null)

export function useBranchWorkspaceMemberScope(): BranchWorkspaceMemberScope | null {
  return useContext(BranchWorkspaceMemberContext)
}
