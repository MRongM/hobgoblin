import type { ColorTheme } from '#/shared/color-theme.ts'

export interface RepoSettingsEntry {
  repoId: string
  colorTheme?: ColorTheme
}

export function repoSettingsEntryForRepo(
  repoSettings: readonly RepoSettingsEntry[],
  repoId: string,
): RepoSettingsEntry | undefined {
  return repoSettings.find((entry) => entry.repoId === repoId)
}

export function repoSettingsEntryColorTheme(
  repoSettings: readonly RepoSettingsEntry[],
  repoId: string,
): ColorTheme | undefined {
  return repoSettingsEntryForRepo(repoSettings, repoId)?.colorTheme
}

export function repoSettingsEntryHasPersistedFields(entry: RepoSettingsEntry): boolean {
  return entry.colorTheme !== undefined
}

export function setRepoSettingsEntryColorTheme(
  entries: readonly RepoSettingsEntry[],
  repoId: string,
  colorTheme: ColorTheme,
): RepoSettingsEntry[] {
  const existing = repoSettingsEntryForRepo(entries, repoId)
  const next: RepoSettingsEntry = { ...existing, repoId, colorTheme }
  return [next, ...entries.filter((entry) => entry.repoId !== repoId)]
}

export function clearRepoSettingsEntryColorTheme(
  entries: readonly RepoSettingsEntry[],
  repoId: string,
): RepoSettingsEntry[] {
  const existing = repoSettingsEntryForRepo(entries, repoId)
  if (!existing) return [...entries]
  const next: RepoSettingsEntry = { repoId }
  if (!repoSettingsEntryHasPersistedFields(next)) return entries.filter((entry) => entry.repoId !== repoId)
  return [next, ...entries.filter((entry) => entry.repoId !== repoId)]
}
