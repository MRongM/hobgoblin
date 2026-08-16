import { isSafeBranchName } from '#/shared/refnames.ts'

export type WorktreeCreationBase = { kind: 'localBranch'; branch: string } | { kind: 'remoteBranch'; remoteRef: string }

export type CreateWorktreeMode =
  | { kind: 'newBranch'; newBranch: string; creationBase: WorktreeCreationBase }
  | { kind: 'existingBranch'; branch: string }
  | { kind: 'trackRemoteBranch'; remoteRef: string; localBranch: string }
  | { kind: 'detached'; ref: string }

export interface CreateWorktreeInput {
  worktreePath: string
  mode: CreateWorktreeMode
  syncBeforeCreate: boolean
}

export function parseRemoteTrackingRefs(output: string): string[] {
  return output
    .split('\n')
    .map((line) => line.trim())
    .filter((ref) => isRemoteTrackingRef(ref))
}

export function deriveLocalBranchFromRemoteRef(remoteRef: string): string | null {
  if (!isRemoteTrackingRef(remoteRef)) return null
  const slash = remoteRef.indexOf('/')
  const branch = slash >= 0 ? remoteRef.slice(slash + 1) : ''
  return isSafeBranchName(branch) ? branch : null
}

export function normalizeCreateWorktreeInput(input: unknown): CreateWorktreeInput | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as { worktreePath?: unknown; mode?: unknown; syncBeforeCreate?: unknown }
  const worktreePath = typeof raw.worktreePath === 'string' ? raw.worktreePath.trim() : ''
  if (!isAbsoluteWorktreePath(worktreePath)) return null
  const mode = normalizeCreateWorktreeMode(raw.mode)
  if (!mode) return null
  const syncBeforeCreate = raw.syncBeforeCreate ?? false
  if (typeof syncBeforeCreate !== 'boolean') return null
  if (syncBeforeCreate && mode.kind !== 'newBranch' && mode.kind !== 'existingBranch') return null
  return { worktreePath, mode, syncBeforeCreate }
}

export function isAbsoluteWorktreePath(value: string): boolean {
  if (!value || value.includes('\0')) return false
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

function normalizeCreateWorktreeMode(input: unknown): CreateWorktreeMode | null {
  if (!input || typeof input !== 'object') return null
  const mode = input as Record<string, unknown>
  switch (mode.kind) {
    case 'newBranch': {
      const newBranch = stringField(mode.newBranch)
      const creationBase = normalizeWorktreeCreationBase(mode.creationBase) ?? normalizeLegacyCreationBase(mode.baseRef)
      return newBranch && creationBase && isSafeBranchName(newBranch)
        ? { kind: 'newBranch', newBranch, creationBase }
        : null
    }
    case 'existingBranch': {
      const branch = stringField(mode.branch)
      return branch && isSafeBranchName(branch) ? { kind: 'existingBranch', branch } : null
    }
    case 'trackRemoteBranch': {
      const remoteRef = stringField(mode.remoteRef)
      const localBranch = stringField(mode.localBranch)
      return remoteRef && localBranch && isRemoteTrackingRef(remoteRef) && isSafeBranchName(localBranch)
        ? { kind: 'trackRemoteBranch', remoteRef, localBranch }
        : null
    }
    case 'detached': {
      const ref = stringField(mode.ref)
      return ref && isSafeRefInput(ref) ? { kind: 'detached', ref } : null
    }
    default:
      return null
  }
}

function stringField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function isRemoteTrackingRef(ref: string): boolean {
  const slash = ref.indexOf('/')
  if (slash <= 0) return false
  if (ref.endsWith('/HEAD')) return false
  const remote = ref.slice(0, slash)
  const branch = ref.slice(slash + 1)
  return isSafeRemoteName(remote) && isSafeBranchName(branch)
}

export function isSafeRemoteName(remote: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)
}

export function normalizeWorktreeCreationBase(input: unknown): WorktreeCreationBase | null {
  if (!input || typeof input !== 'object') return null
  const base = input as Record<string, unknown>
  if (base.kind === 'localBranch') {
    const branch = stringField(base.branch)
    return branch && isSafeBranchName(branch) ? { kind: 'localBranch', branch } : null
  }
  if (base.kind === 'remoteBranch') {
    const remoteRef = stringField(base.remoteRef)
    return remoteRef && isRemoteTrackingRef(remoteRef) ? { kind: 'remoteBranch', remoteRef } : null
  }
  return null
}

export function worktreeCreationBaseRef(base: WorktreeCreationBase): string {
  return base.kind === 'localBranch' ? base.branch : base.remoteRef
}

function normalizeLegacyCreationBase(input: unknown): WorktreeCreationBase | null {
  const branch = stringField(input)
  return branch && isSafeBranchName(branch) ? { kind: 'localBranch', branch } : null
}

function isSafeRefInput(ref: string): boolean {
  return isSafeBranchName(ref) || isRemoteTrackingRef(ref)
}
