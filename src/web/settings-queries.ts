import { useEffect } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ExternalAppsSnapshot,
  GitHubCliState,
  LanInfo,
  SettingsSnapshot,
} from '#/shared/rpc.ts'
import {
  getExternalAppsSnapshot,
  getGitHubCliState,
  getLanInfo,
  getSettingsSnapshot,
} from '#/web/settings-client.ts'
import { getInitialBootstrap } from '#/web/bootstrap.ts'
import { subscribeSettingsInvalidation } from '#/web/settings-invalidation-ingress.ts'
import { DEFAULT_COLOR_THEME } from '#/shared/color-theme.ts'
import {
  externalAppsQueryKey,
  githubCliQueryKey,
  lanInfoQueryKey,
  settingsSnapshotQueryKey,
} from '#/web/settings-query-cache.ts'
import {
  DEFAULT_DETAIL_COLLAPSED,
  DEFAULT_DETAIL_PANE_SIZES,
  DEFAULT_WORKSPACE_LAYOUT,
} from '#/shared/workspace-layout.ts'
import { qrCodeDataUrls } from '#/web/lib/qr-code-images.ts'

function initialSettingsSnapshot(): SettingsSnapshot | undefined {
  const initialSettings = getInitialBootstrap().initialSettings
  const initialI18n = getInitialBootstrap().initialI18n
  if (!initialSettings) return undefined
  return {
    lang: initialI18n?.pref ?? 'auto',
    theme: 'auto',
    colorTheme: DEFAULT_COLOR_THEME,
    ...initialSettings,
    session: {
      openRepos: [],
      activeRepo: null,
      detailCollapsed: DEFAULT_DETAIL_COLLAPSED,
      detailFocusMode: false,
      workspaceLayout: DEFAULT_WORKSPACE_LAYOUT,
      detailPaneSizes: DEFAULT_DETAIL_PANE_SIZES,
      selectedTerminalByWorktree: {},
    },
    recentRepos: [],
  }
}

function initialExternalAppsSnapshot(): ExternalAppsSnapshot | undefined {
  const initialSettings = getInitialBootstrap().initialSettings
  if (!initialSettings) return undefined
  return {
    terminal: {
      pref: initialSettings.terminalApp,
      resolved: null,
      available: false,
      appAvailability: { ghostty: false, terminal: false },
      detectedAt: 0,
    },
    editor: {
      pref: initialSettings.editorApp,
      resolved: null,
      available: false,
      appAvailability: { vscode: false, cursor: false, windsurf: false },
      detectedAt: 0,
    },
  }
}

function initialGitHubCliState(): GitHubCliState {
  return {
    available: false,
    version: null,
    detectedAt: 0,
    hosts: {},
  }
}

export { externalAppsQueryKey, githubCliQueryKey, lanInfoQueryKey, settingsSnapshotQueryKey } from '#/web/settings-query-cache.ts'

export function settingsSnapshotQueryOptions() {
  return queryOptions<SettingsSnapshot>({
    queryKey: settingsSnapshotQueryKey(),
    queryFn: getSettingsSnapshot,
    initialData: initialSettingsSnapshot,
    staleTime: 0,
    gcTime: 5 * 60_000,
  })
}

export function externalAppsQueryOptions() {
  return queryOptions<ExternalAppsSnapshot>({
    queryKey: externalAppsQueryKey(),
    queryFn: getExternalAppsSnapshot,
    initialData: initialExternalAppsSnapshot,
    staleTime: 0,
    gcTime: 5 * 60_000,
  })
}

export function githubCliQueryOptions(hosts?: string[]) {
  return queryOptions<GitHubCliState>({
    queryKey: githubCliQueryKey(hosts),
    queryFn: () => getGitHubCliState(hosts),
    initialData: initialGitHubCliState,
    staleTime: 0,
    gcTime: 5 * 60_000,
  })
}

export interface LanInfoWithQrCodes extends LanInfo {
  qrCodes: Record<string, string>
}

export function lanInfoQueryOptions() {
  return queryOptions<LanInfoWithQrCodes>({
    queryKey: lanInfoQueryKey(),
    queryFn: async () => {
      const info = await getLanInfo()
      return { ...info, qrCodes: await qrCodeDataUrls(info.lanUrls) }
    },
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  })
}

export function useSettingsSnapshotQuery() {
  return useQuery(settingsSnapshotQueryOptions())
}

export function useExternalAppsQuery() {
  return useQuery(externalAppsQueryOptions())
}

export function useGitHubCliQuery(hosts?: string[]) {
  return useQuery(githubCliQueryOptions(hosts))
}

export function useLanInfoQuery() {
  return useQuery(lanInfoQueryOptions())
}

export function useSettingsQueryInvalidationSync() {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      subscribeSettingsInvalidation((event) => {
        if (event.scopes.includes('settings-snapshot')) {
          void queryClient.invalidateQueries({ queryKey: settingsSnapshotQueryKey(), exact: true })
        }
        if (event.scopes.includes('external-apps')) {
          void queryClient.invalidateQueries({ queryKey: externalAppsQueryKey(), exact: true })
        }
      }),
    [queryClient],
  )
}
