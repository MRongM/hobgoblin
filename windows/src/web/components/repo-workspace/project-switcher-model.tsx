// Shared pieces of the project switcher, used by the sidebar header's
// inline list and the focus-mode dropdown: the open-project summaries
// selector and the per-project terminal status indicator.

import { useMemo } from 'react'
import { Terminal } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoTerminalWorktreePaths } from '#/web/components/RepoTabs.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  useTerminalAggregateCount,
  useTerminalAggregateHasBell,
  useTerminalAggregateHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { worktreeTerminalKey } from '#/web/components/terminal/terminal-session-keys.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'
import { useBranchWorkspaceQuery } from '#/web/branch-workspace-queries.ts'

// The list identifies projects by where they live: local repos by their
// filesystem path, remote repos as "host:path". Same-named projects stay
// distinguishable.
export function projectLocation(repoId: string): string {
  const remote = parseRemoteRepoId(repoId)
  return remote ? `${remote.alias}:${remote.remotePath}` : repoId
}

export interface ProjectSummary {
  id: string
  name: string
  unavailable: boolean
  isGitRepo: boolean
  changeCount: number
  terminalWorktreeKeys: string[]
  branchWorkspaceRootId: string | null
}

interface ProjectTerminalRepo {
  id: string
  isGitRepo?: boolean
  remote?: Parameters<typeof repoTerminalWorktreePaths>[0]['remote']
  data: {
    branches: Array<{ worktree?: { path?: string } }>
    worktreesByPath: Record<string, unknown>
    status: Array<{ entries: readonly unknown[] }>
  }
}

export function projectTerminalWorktreeKeys(
  rootRepo: ProjectTerminalRepo,
  memberRepos: readonly ProjectTerminalRepo[],
): string[] {
  return Array.from(
    new Set(
      [rootRepo, ...memberRepos].flatMap((repo) =>
        repoTerminalWorktreePaths(repo).map((path) => worktreeTerminalKey(repo.id, path)),
      ),
    ),
  ).sort()
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  return a === b || (a.length === b.length && a.every((item, index) => item === b[index]))
}

function projectChangeCount(repos: readonly ProjectTerminalRepo[]): number {
  return repos.reduce(
    (projectTotal, repo) =>
      repo.isGitRepo === false
        ? projectTotal
        : projectTotal + repo.data.status.reduce((repoTotal, status) => repoTotal + status.entries.length, 0),
    0,
  )
}

function projectSummariesEqual(a: ProjectSummary[], b: ProjectSummary[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return a.every(
    (item, index) =>
      item.id === b[index]!.id &&
      item.name === b[index]!.name &&
      item.unavailable === b[index]!.unavailable &&
      item.isGitRepo === b[index]!.isGitRepo &&
      item.changeCount === b[index]!.changeCount &&
      item.branchWorkspaceRootId === b[index]!.branchWorkspaceRootId &&
      stringArraysEqual(item.terminalWorktreeKeys, b[index]!.terminalWorktreeKeys),
  )
}

// Every open project in store (tab) order.
export function useProjectSummaries(): ProjectSummary[] {
  return useStoreWithEqualityFn(
    useReposStore,
    (s) =>
      s.order
        .map<ProjectSummary | null>((id) => {
          const repo = s.repos[id]
          const memberRepos = (s.workspaceProjects[id]?.repositoryIds ?? []).flatMap((memberId) => {
            const member = s.repos[memberId]
            return member ? [member] : []
          })
          return repo
            ? {
                id: repo.id,
                name: repo.name,
                unavailable: repo.availability.phase === 'unavailable',
                isGitRepo: repo.isGitRepo !== false,
                changeCount: projectChangeCount([repo, ...memberRepos]),
                terminalWorktreeKeys: projectTerminalWorktreeKeys(repo, memberRepos),
                branchWorkspaceRootId: s.workspaceProjects[id]?.configured ? id : null,
              }
            : null
        })
        .filter((summary): summary is ProjectSummary => summary !== null),
    projectSummariesEqual,
  )
}

// Terminal state carried over from the old repo tab strip: open-session
// count with the output-activity pulse inside the badge, plus the unread
// bell dot.
export function ProjectTerminalStatus({
  terminalWorktreeKeys,
  branchWorkspaceRootId = null,
}: {
  terminalWorktreeKeys: readonly string[]
  branchWorkspaceRootId?: string | null
}) {
  return branchWorkspaceRootId ? (
    <BranchWorkspaceProjectTerminalStatus
      terminalWorktreeKeys={terminalWorktreeKeys}
      branchWorkspaceRootId={branchWorkspaceRootId}
    />
  ) : (
    <ProjectTerminalStatusForKeys terminalWorktreeKeys={terminalWorktreeKeys} />
  )
}

function BranchWorkspaceProjectTerminalStatus({
  terminalWorktreeKeys,
  branchWorkspaceRootId,
}: {
  terminalWorktreeKeys: readonly string[]
  branchWorkspaceRootId: string
}) {
  const branchWorkspaceQuery = useBranchWorkspaceQuery(branchWorkspaceRootId)
  const aggregateKeys = useMemo(() => {
    const branchWorkspaceKeys = branchWorkspaceQuery.data?.ok
      ? branchWorkspaceQuery.data.items.map((item) => worktreeTerminalKey(branchWorkspaceRootId, item.path))
      : []
    return Array.from(new Set([...terminalWorktreeKeys, ...branchWorkspaceKeys])).sort()
  }, [branchWorkspaceQuery.data, branchWorkspaceRootId, terminalWorktreeKeys])
  return <ProjectTerminalStatusForKeys terminalWorktreeKeys={aggregateKeys} />
}

function ProjectTerminalStatusForKeys({ terminalWorktreeKeys }: { terminalWorktreeKeys: readonly string[] }) {
  const t = useT()
  const terminalCount = useTerminalAggregateCount(terminalWorktreeKeys)
  const hasBell = useTerminalAggregateHasBell(terminalWorktreeKeys)
  const hasOutputActivity = useTerminalAggregateHasOutputActivity(terminalWorktreeKeys)
  if (terminalCount === 0 && !hasBell) return null
  const countLabel = terminalCount > 0 ? t('terminal.open-count', { count: terminalCount }) : undefined
  return (
    <span className="flex shrink-0 items-center gap-1" data-testid="project-terminal-status">
      {terminalCount > 0 && (
        <Badge
          variant="brand"
          className="h-4 gap-1 rounded-full px-1.5 text-[10px] font-semibold tabular-nums"
          aria-label={countLabel}
          title={countLabel}
        >
          {hasOutputActivity ? (
            <TerminalOutputActivityIndicator label={t('terminal.output-active')} className="size-2.5" size={10} />
          ) : (
            <Terminal size={10} aria-hidden="true" />
          )}
          {terminalCount}
        </Badge>
      )}
      {hasBell && <TerminalBellDot label={t('terminal.bell-unread')} />}
    </span>
  )
}
