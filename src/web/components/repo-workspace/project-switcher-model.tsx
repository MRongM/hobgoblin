// Shared pieces of the project switcher, used by the sidebar header's
// inline list and the focus-mode dropdown: the open-project summaries
// selector and the per-project terminal status indicator.

import { Terminal } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { repoTerminalWorktreePaths } from '#/web/components/RepoTabs.tsx'
import { TerminalBellDot } from '#/web/components/terminal/TerminalBellDot.tsx'
import { TerminalOutputActivityIndicator } from '#/web/components/terminal/TerminalOutputActivityIndicator.tsx'
import {
  useRepoTerminalCount,
  useRepoTerminalHasBell,
  useRepoTerminalHasOutputActivity,
} from '#/web/components/terminal/terminal-session-store.ts'
import { Badge } from '#/web/components/ui/badge.tsx'
import { parseRemoteRepoId } from '#/shared/remote-repo.ts'

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
  worktreePaths: string[]
}

function stringArraysEqual(a: string[], b: string[]): boolean {
  return a === b || (a.length === b.length && a.every((item, index) => item === b[index]))
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
      stringArraysEqual(item.worktreePaths, b[index]!.worktreePaths),
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
          return repo
            ? {
                id: repo.id,
                name: repo.name,
                unavailable: repo.availability.phase === 'unavailable',
                isGitRepo: repo.isGitRepo !== false,
                worktreePaths: repoTerminalWorktreePaths(repo),
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
export function ProjectTerminalStatus({ repoId, worktreePaths }: { repoId: string; worktreePaths: string[] }) {
  const t = useT()
  const terminalCount = useRepoTerminalCount(repoId, worktreePaths)
  const hasBell = useRepoTerminalHasBell(repoId, worktreePaths)
  const hasOutputActivity = useRepoTerminalHasOutputActivity(repoId, worktreePaths)
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
