import type {
  BranchWorkspaceAuxiliaryCandidate,
  BranchWorkspacePathInspection,
  BranchWorkspacePathKind,
} from '#/shared/branch-workspaces.ts'
import type { RemoteRepoTarget } from '#/shared/remote-repo.ts'
import {
  runRemoteCommand,
  type RemoteCommandKind,
  type RemoteCommandOptions,
  type RemoteCommandResult,
} from '#/system/ssh/commands.ts'

type RemoteBranchWorkspaceRunner = (
  command: RemoteCommandKind,
  target: RemoteRepoTarget,
  options?: RemoteCommandOptions,
) => Promise<RemoteCommandResult>

interface RemoteBranchWorkspaceOptions {
  signal?: AbortSignal
  run?: RemoteBranchWorkspaceRunner
}

export async function listRemoteBranchWorkspaceAuxiliaryCandidates(
  target: RemoteRepoTarget,
  rootPath: string,
  excludedNames: ReadonlySet<string>,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<BranchWorkspaceAuxiliaryCandidate[]> {
  const stdout = await executeRemoteBranchWorkspaceCommand(
    target,
    {
      type: 'listBranchWorkspaceCandidates',
      rootPath,
      excludedNames: [...excludedNames].sort(compareText),
    },
    options,
  )
  const payload = parsePayload(stdout)
  if (payload.ok !== true || !Array.isArray(payload.candidates)) throw payloadError(payload)
  return payload.candidates.map(normalizeCandidate)
}

export async function inspectRemoteBranchWorkspacePath(
  target: RemoteRepoTarget,
  rootPath: string,
  candidatePath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<BranchWorkspacePathInspection> {
  const stdout = await executeRemoteBranchWorkspaceCommand(
    target,
    { type: 'inspectBranchWorkspacePath', rootPath, candidatePath },
    options,
  )
  const payload = parsePayload(stdout)
  if (payload.ok !== true) throw payloadError(payload)
  return normalizeInspection(payload.inspection)
}

export async function createRemoteBranchWorkspaceDirectory(
  target: RemoteRepoTarget,
  rootPath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<void> {
  await executeMutation(target, { type: 'createBranchWorkspaceDirectory', rootPath, targetPath }, options)
}

export async function materializeRemoteBranchWorkspaceSymlink(
  target: RemoteRepoTarget,
  rootPath: string,
  sourcePath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<void> {
  await executeMutation(
    target,
    { type: 'materializeBranchWorkspaceSymlink', rootPath, sourcePath, targetPath },
    options,
  )
}

export async function copyRemoteBranchWorkspaceEntry(
  target: RemoteRepoTarget,
  rootPath: string,
  sourcePath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<void> {
  await executeMutation(target, { type: 'copyBranchWorkspaceEntry', rootPath, sourcePath, targetPath }, options)
}

export async function fingerprintRemoteBranchWorkspaceEntry(
  target: RemoteRepoTarget,
  rootPath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<string> {
  const stdout = await executeRemoteBranchWorkspaceCommand(
    target,
    { type: 'fingerprintBranchWorkspaceEntry', rootPath, targetPath },
    options,
  )
  if (/^[a-f0-9]{64}$/.test(stdout)) return stdout
  const payload = tryParsePayload(stdout)
  if (payload?.ok === false) throw payloadError(payload)
  throw invalidResponse()
}

export async function removeRemoteBranchWorkspaceEntry(
  target: RemoteRepoTarget,
  rootPath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<void> {
  await executeMutation(target, { type: 'removeBranchWorkspaceEntry', rootPath, targetPath }, options)
}

export async function listRemoteBranchWorkspaceChildren(
  target: RemoteRepoTarget,
  rootPath: string,
  targetPath: string,
  options: RemoteBranchWorkspaceOptions = {},
): Promise<string[]> {
  const stdout = await executeRemoteBranchWorkspaceCommand(
    target,
    { type: 'listBranchWorkspaceChildren', rootPath, targetPath },
    options,
  )
  const payload = parsePayload(stdout)
  if (payload.ok !== true || !Array.isArray(payload.children) || !payload.children.every(isSafeText)) {
    throw payloadError(payload)
  }
  return [...payload.children]
}

async function executeMutation(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
  options: RemoteBranchWorkspaceOptions,
): Promise<void> {
  const payload = parsePayload(await executeRemoteBranchWorkspaceCommand(target, command, options))
  if (payload.ok !== true) throw payloadError(payload)
}

async function executeRemoteBranchWorkspaceCommand(
  target: RemoteRepoTarget,
  command: RemoteCommandKind,
  options: RemoteBranchWorkspaceOptions,
): Promise<string> {
  if (options.signal?.aborted) throw new Error('cancelled')
  const run =
    options.run ?? ((nextCommand, nextTarget, nextOptions) => runRemoteCommand(nextTarget, nextCommand, nextOptions))
  const result = await run(command, target, { signal: options.signal })
  if (options.signal?.aborted || result.message === 'cancelled') throw new Error('cancelled')
  if (!result.ok) throw new Error('workspace.branch-workspace.remote-operation-failed')
  return result.stdout
}

function normalizeCandidate(value: unknown): BranchWorkspaceAuxiliaryCandidate {
  const candidate = asRecord(value)
  const kind = normalizePresentKind(candidate?.kind)
  if (
    !candidate ||
    !isSafeText(candidate.name) ||
    !isSafeText(candidate.path) ||
    !kind ||
    typeof candidate.outsideRoot !== 'boolean' ||
    (candidate.resolvedPath !== undefined && !isSafeText(candidate.resolvedPath))
  ) {
    throw invalidResponse()
  }
  return {
    name: candidate.name,
    path: candidate.path,
    kind,
    ...(typeof candidate.resolvedPath === 'string' ? { resolvedPath: candidate.resolvedPath } : {}),
    outsideRoot: candidate.outsideRoot,
  }
}

function normalizeInspection(value: unknown): BranchWorkspacePathInspection {
  const inspection = asRecord(value)
  const kind = normalizeKind(inspection?.kind)
  if (
    !inspection ||
    !isSafeText(inspection.path) ||
    typeof inspection.exists !== 'boolean' ||
    !kind ||
    typeof inspection.directChild !== 'boolean' ||
    typeof inspection.outsideRoot !== 'boolean' ||
    (inspection.resolvedPath !== undefined && !isSafeText(inspection.resolvedPath)) ||
    (inspection.linkTarget !== undefined && !isSafeText(inspection.linkTarget)) ||
    (inspection.exists && kind === 'missing') ||
    (!inspection.exists && kind !== 'missing')
  ) {
    throw invalidResponse()
  }
  return {
    path: inspection.path,
    exists: inspection.exists,
    kind,
    ...(typeof inspection.resolvedPath === 'string' ? { resolvedPath: inspection.resolvedPath } : {}),
    ...(typeof inspection.linkTarget === 'string' ? { linkTarget: inspection.linkTarget } : {}),
    directChild: inspection.directChild,
    outsideRoot: inspection.outsideRoot,
  }
}

function parsePayload(value: string): Record<string, unknown> {
  const payload = tryParsePayload(value)
  if (!payload) throw invalidResponse()
  return payload
}

function tryParsePayload(value: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(value))
  } catch {
    return null
  }
}

function payloadError(payload: Record<string, unknown>): Error {
  return typeof payload.message === 'string' && payload.message ? new Error(payload.message) : invalidResponse()
}

function invalidResponse(): Error {
  return new Error('workspace.branch-workspace.remote-invalid-response')
}

function normalizeKind(value: unknown): BranchWorkspacePathKind | null {
  return value === 'file' || value === 'directory' || value === 'symlink' || value === 'other' || value === 'missing'
    ? value
    : null
}

function normalizePresentKind(value: unknown): Exclude<BranchWorkspacePathKind, 'missing'> | null {
  const kind = normalizeKind(value)
  return kind && kind !== 'missing' ? kind : null
}

function isSafeText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !value.includes('\0')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
