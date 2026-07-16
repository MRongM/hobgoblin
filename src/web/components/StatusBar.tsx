// Bottom status bar. Mirrors the topbar's token family so the workspace is
// framed by the same chrome band top and bottom. Left corner is the ambient
// app chrome (settings entry + project theme); the right side shows where
// the user is (active repository · selected branch).

import { GitBranch, Settings } from 'lucide-react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useT } from '#/web/stores/i18n.ts'
import { Tip } from '#/web/components/Tip.tsx'
import { Button } from '#/web/components/ui/button.tsx'
import { ProjectThemeMenuConnected } from '#/web/components/repo-toolbar/ProjectThemeMenu.tsx'

interface Props {
  repoId: string | null
  onOpenSettings: () => void
}

interface StatusBarRepoSummary {
  name: string
  branch: string | null
}

export function StatusBar({ repoId, onOpenSettings }: Props) {
  const t = useT()
  const summary = useStoreWithEqualityFn(
    useReposStore,
    (s): StatusBarRepoSummary | null => {
      const repo = repoId ? s.repos[repoId] : undefined
      if (!repo) return null
      return {
        name: repo.name,
        branch: repo.ui.selectedBranch ?? repo.data.currentBranch ?? null,
      }
    },
    (a, b) => a === b || (!!a && !!b && a.name === b.name && a.branch === b.branch),
  )

  return (
    <footer
      data-testid="statusbar"
      className="flex h-7 shrink-0 items-center gap-1 border-t border-topbar-border bg-topbar px-1.5 text-xs text-topbar-muted-foreground"
    >
      <Tip label={t('topbar.settings')}>
        <Button variant="ghost" size="icon-sm" onClick={onOpenSettings} aria-label={t('topbar.settings')}>
          <Settings />
        </Button>
      </Tip>
      {repoId && <ProjectThemeMenuConnected repoId={repoId} />}
      <div className="min-w-0 flex-1" aria-hidden="true" />
      {summary && (
        <div className="flex min-w-0 items-center gap-1.5 pr-1">
          <span className="min-w-0 truncate">{summary.name}</span>
          {summary.branch && (
            <>
              <GitBranch className="size-3 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate text-topbar-foreground">{summary.branch}</span>
            </>
          )}
        </div>
      )}
    </footer>
  )
}
