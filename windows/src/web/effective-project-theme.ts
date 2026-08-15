import type { ColorTheme } from '#/shared/color-theme.ts'
import { repoSettingsEntryColorTheme, type RepoSettingsEntry } from '#/shared/repo-settings.ts'

export function effectiveProjectColorTheme(input: {
  activeRepoId: string | null
  globalColorTheme: ColorTheme
  repoSettings: readonly RepoSettingsEntry[]
}): ColorTheme {
  if (!input.activeRepoId) return input.globalColorTheme
  return repoSettingsEntryColorTheme(input.repoSettings, input.activeRepoId) ?? input.globalColorTheme
}
