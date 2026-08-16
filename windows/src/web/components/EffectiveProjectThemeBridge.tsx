import { useEffect } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { effectiveProjectColorTheme } from '#/web/effective-project-theme.ts'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useThemeStore } from '#/web/stores/theme.ts'
import { projectNativeWindowChromeTheme } from '#/web/app-shell-client.ts'
import { DEFAULT_TOPBAR_HEIGHT_PX } from '#/shared/window-chrome.ts'

export function EffectiveProjectThemeBridge() {
  const resolved = useThemeStore((s) => s.resolved)
  const globalColorTheme = useThemeStore((s) => s.colorTheme)
  const activeRepoId = useStoreWithEqualityFn(useReposStore, (s) => s.activeProjectId ?? s.activeId, Object.is)
  const { data } = useSettingsSnapshotQuery()
  const effectiveColorTheme = effectiveProjectColorTheme({
    activeRepoId,
    globalColorTheme,
    repoSettings: data?.repoSettings ?? [],
  })
  const topbarHeightPx = data?.topbarHeightPx ?? DEFAULT_TOPBAR_HEIGHT_PX

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.setAttribute('data-color-theme', effectiveColorTheme)
    void projectNativeWindowChromeTheme({ theme: resolved, colorTheme: effectiveColorTheme, topbarHeightPx })
  }, [resolved, globalColorTheme, effectiveColorTheme, topbarHeightPx])

  return null
}
