import type { SettingsPage } from '#/shared/settings-pages.ts'
import type { RepoSessionEntry } from '#/shared/remote-repo.ts'
import type { LangPref, ThemePref } from '#/shared/settings.ts'

export type RendererEffectIntent =
  | { type: 'open-repo-requested' }
  | { type: 'open-repo-path-requested' }
  | { type: 'open-remote-repo-requested' }
  | { type: 'clone-repo-requested' }
  | { type: 'app-quitting' }
  | { type: 'close-repo-requested' }
  | { type: 'cycle-repo-requested'; direction: 1 | -1 }
  | { type: 'repo-refresh-requested' }
  | { type: 'show-detail-tab-requested'; tab: 'status' | 'changes' | 'terminal' }
  | { type: 'select-terminal-requested'; index: number }
  | { type: 'terminal-primary-action-requested' }
  | { type: 'open-settings-requested'; page: SettingsPage }
  | { type: 'theme-pref-set-requested'; pref: ThemePref }
  | { type: 'lang-pref-set-requested'; pref: LangPref }
  | { type: 'clear-recent-repos-requested' }
  | { type: 'open-recent-repo-requested'; entry: RepoSessionEntry }
  | { type: 'terminal-bell-click'; repoRoot: string; key?: string }
  | { type: 'external-open-enqueued' }
