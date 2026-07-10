import type { ColorTheme } from '#/shared/color-theme.ts'

export interface WorktreeBootstrapTrust {
  configHash: string
  trustedAt: string
}

export interface RepoSettingsEntry {
  repoId: string
  colorTheme?: ColorTheme
  worktreeBootstrapTrust?: WorktreeBootstrapTrust
}

export const WORKTREE_BOOTSTRAP_CONFIG_HASH_RE = /^sha256:[a-f0-9]{64}$/

export function isWorktreeBootstrapConfigHash(value: unknown): value is string {
  return typeof value === 'string' && WORKTREE_BOOTSTRAP_CONFIG_HASH_RE.test(value)
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
  return entry.colorTheme !== undefined || entry.worktreeBootstrapTrust !== undefined
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
  const next: RepoSettingsEntry = {
    repoId,
    ...(existing.worktreeBootstrapTrust ? { worktreeBootstrapTrust: existing.worktreeBootstrapTrust } : {}),
  }
  if (!repoSettingsEntryHasPersistedFields(next)) return entries.filter((entry) => entry.repoId !== repoId)
  return [next, ...entries.filter((entry) => entry.repoId !== repoId)]
}

export function isRepoWorktreeBootstrapConfigTrusted(
  repoSettings: readonly RepoSettingsEntry[],
  repoId: string,
  configHash: string | null | undefined,
): boolean {
  if (!configHash) return false
  return repoSettingsEntryForRepo(repoSettings, repoId)?.worktreeBootstrapTrust?.configHash === configHash
}
