import type {
  BranchWorkspaceBatchPushTargetInput,
  BranchWorkspaceSyncMemberPlan,
  BranchWorkspaceSyncPlan,
} from '#/shared/branch-workspace-git-actions.ts'

export function defaultBranchWorkspacePushRemote(member: BranchWorkspaceSyncMemberPlan): string | null {
  if (!member.requiresUpstreamCreation) return null
  if (member.pushRemotes.includes('origin')) return 'origin'
  return member.pushRemotes.length === 1 ? member.pushRemotes[0]! : null
}

export function initialBranchWorkspacePushRemotes(plan: BranchWorkspaceSyncPlan): Record<string, string> {
  if (plan.kind !== 'push') return {}
  return Object.fromEntries(
    plan.members.flatMap((member) => {
      const remote = defaultBranchWorkspacePushRemote(member)
      return remote ? [[member.repositoryName, remote]] : []
    }),
  )
}

export function branchWorkspacePushTargets(
  plan: BranchWorkspaceSyncPlan,
  repositoryNames: string[],
  selectedRemotes: Readonly<Record<string, string>>,
): BranchWorkspaceBatchPushTargetInput[] | null {
  if (plan.kind !== 'push' || repositoryNames.length === 0) return null
  const selected = new Set(repositoryNames)
  if (selected.size !== repositoryNames.length) return null
  const targets: BranchWorkspaceBatchPushTargetInput[] = []
  for (const member of plan.members) {
    if (!selected.has(member.repositoryName)) continue
    if (!member.ready) return null
    if (!member.requiresUpstreamCreation) {
      targets.push({ repositoryName: member.repositoryName, action: 'push' })
      continue
    }
    const remote = selectedRemotes[member.repositoryName]
    if (!remote || !member.pushRemotes.includes(remote)) return null
    targets.push({ repositoryName: member.repositoryName, action: 'create-upstream', remote })
  }
  return targets.length === selected.size ? targets : null
}
