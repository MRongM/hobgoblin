import { windowsPathIdentityKey } from '#/shared/path-semantics.ts'

export function terminalPathIdentityKey(value: string): string {
  return windowsPathIdentityKey(value) ?? value
}

export function worktreeTerminalKey(repoRoot: string, worktreePath: string): string {
  return `${terminalPathIdentityKey(repoRoot)}\0${terminalPathIdentityKey(worktreePath)}`
}

export function parseWorktreeTerminalKey(key: string): { repoRoot: string; worktreePath: string } | null {
  const parts = key.split('\0')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { repoRoot: parts[0], worktreePath: parts[1] }
}

export function terminalSessionKey(repoRoot: string, worktreePath: string, terminalId: string): string {
  return `${worktreeTerminalKey(repoRoot, worktreePath)}\0${terminalId}`
}

export function parseTerminalSessionKey(
  key: string,
): { repoRoot: string; worktreePath: string; terminalId: string } | null {
  const parts = key.split('\0')
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null
  return { repoRoot: parts[0], worktreePath: parts[1], terminalId: parts[2] }
}
