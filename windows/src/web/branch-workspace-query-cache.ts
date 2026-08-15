export function branchWorkspaceQueryKey(rootId: string) {
  return ['branch-workspaces', rootId] as const
}
