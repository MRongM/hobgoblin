import { useEffect } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { effectiveProjectColorTheme } from '#/web/effective-project-theme.ts'
import { useSettingsSnapshotQuery } from '#/web/settings-queries.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { useThemeStore } from '#/web/stores/theme.ts'

export function EffectiveProjectThemeBridge() {
  const resolved = useThemeStore((s) => s.resolved)
  const globalColorTheme = useThemeStore((s) => s.colorTheme)
  const activeRepoId = useStoreWithEqualityFn(useReposStore, (s) => s.activeId, Object.is)
  const { data } = useSettingsSnapshotQuery()
  const effectiveColorTheme = effectiveProjectColorTheme({
    activeRepoId,
    globalColorTheme,
    repoSettings: data?.repoSettings ?? [],
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved)
    document.documentElement.setAttribute('data-color-theme', effectiveColorTheme)
  }, [resolved, globalColorTheme, effectiveColorTheme])

  return null
}
