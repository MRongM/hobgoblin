import { createHash, randomBytes } from 'node:crypto'
import { open } from 'node:fs/promises'
import path from 'node:path'
import {
  WORKSPACE_SNAPSHOT_CHUNK_BYTES,
  WORKSPACE_SNAPSHOT_MAX_BYTES,
  WORKSPACE_SNAPSHOT_MAX_ENTRIES,
  isWorkspaceSnapshotRelativePath,
  type WorkspaceSnapshotArtifact,
  type WorkspaceSnapshotExport,
  type WorkspaceSnapshotInspection,
} from '#/shared/branch-workspace-clone.ts'
import { parseRemoteRepoId, type RemoteRepoTarget } from '#/shared/remote-repo.ts'
import { resolveRepositoryRemoteTarget } from '#/system/remote/target.ts'
import { runRemoteCommand } from '#/system/ssh/commands.ts'
import type {
  WorkspaceSnapshotCommand,
  WorkspaceSnapshotSourceInput,
  WorkspaceSnapshotSourceReply,
} from '#/system/ssh/workspace-snapshot-script.ts'

export async function resolveWorkspaceSnapshotSource(rootId: string, signal?: AbortSignal): Promise<RemoteRepoTarget> {
  const source = parseRemoteRepoId(rootId)
  if (!source) throw new Error('Clone source must be an SSH or WSL workspace')
  return (await resolveRepositoryRemoteTarget(source, signal)).target
}

async function command<T>(target: RemoteRepoTarget, input: WorkspaceSnapshotCommand, signal?: AbortSignal): Promise<T> {
  const result = await runRemoteCommand(target, input, {
    signal,
    timeoutMs: input.type === 'workspaceSnapshotExport' || input.type === 'workspaceSnapshotInspect' ? 610_000 : 30_000,
    maxBuffer: 2 * 1024 * 1024,
  })
  if (!result.ok) throw new Error(result.stderr || result.message || 'Snapshot transport failed')
  const reply = JSON.parse(result.stdout) as WorkspaceSnapshotSourceReply<T>
  if (!reply.ok) throw new Error(reply.detail)
  return reply.value
}

export async function inspectWorkspaceSnapshot(
  target: RemoteRepoTarget,
  input: WorkspaceSnapshotSourceInput,
  signal?: AbortSignal,
): Promise<WorkspaceSnapshotInspection> {
  const value = await command<WorkspaceSnapshotInspection>(
    target,
    { type: 'workspaceSnapshotInspect', ...input },
    signal,
  )
  validateSnapshot(value)
  return value
}

export async function withWorkspaceSnapshotExport<T>(
  target: RemoteRepoTarget,
  input: WorkspaceSnapshotSourceInput,
  fingerprint: string,
  signal: AbortSignal,
  action: (snapshot: WorkspaceSnapshotExport) => Promise<T>,
): Promise<T> {
  const operationId = randomBytes(16).toString('hex')
  let cleanupError: unknown
  try {
    const snapshot = await command<WorkspaceSnapshotExport>(
      target,
      { type: 'workspaceSnapshotExport', ...input, operationId, fingerprint },
      signal,
    )
    validateSnapshot(snapshot)
    if (snapshot.operationId !== operationId || snapshot.fingerprint !== fingerprint)
      throw new Error('Snapshot identity mismatch')
    return await action(snapshot)
  } finally {
    // Cleanup is addressable even when export was cancelled before returning its handle.
    try {
      await command(target, { type: 'workspaceSnapshotCleanup', operationId }, AbortSignal.timeout(20_000))
    } catch (error) {
      cleanupError = error
    }
    if (cleanupError) console.warn('Workspace snapshot source cleanup failed', operationId, String(cleanupError))
  }
}

export async function downloadWorkspaceSnapshot(
  target: RemoteRepoTarget,
  snapshot: WorkspaceSnapshotExport,
  directory: string,
  signal: AbortSignal,
  onBytes: (bytes: number) => void,
): Promise<void> {
  const artifacts = [
    snapshot.bundle,
    snapshot.staged,
    snapshot.unstaged,
    ...snapshot.entries.map((entry) => entry.artifact),
  ].filter((item): item is WorkspaceSnapshotArtifact => Boolean(item))
  let total = 0
  const seen = new Set<string>()
  for (const artifact of artifacts) {
    if (
      !/^(bundle|staged|unstaged|file-[0-9]+)$/.test(artifact.id) ||
      seen.has(artifact.id) ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size < 0 ||
      !/^[a-f0-9]{64}$/.test(artifact.sha256)
    )
      throw new Error('Invalid snapshot artifact')
    seen.add(artifact.id)
    total += artifact.size
  }
  if (total > WORKSPACE_SNAPSHOT_MAX_BYTES) throw new Error('Snapshot exceeds the 16 GiB transfer budget')
  for (const artifact of artifacts) {
    const file = await open(path.join(directory, artifact.id), 'wx', 0o600)
    const hash = createHash('sha256')
    try {
      let offset = 0
      while (offset < artifact.size) {
        signal.throwIfAborted()
        const length = Math.min(WORKSPACE_SNAPSHOT_CHUNK_BYTES, artifact.size - offset)
        const chunk = await command<{ offset: number; bytesBase64: string }>(
          target,
          {
            type: 'workspaceSnapshotReadChunk',
            operationId: snapshot.operationId,
            artifactId: artifact.id,
            offset,
            length,
          },
          signal,
        )
        if (
          chunk.offset !== offset ||
          typeof chunk.bytesBase64 !== 'string' ||
          chunk.bytesBase64.length > Math.ceil(length / 3) * 4
        )
          throw new Error('Invalid snapshot chunk')
        const raw = Buffer.from(chunk.bytesBase64, 'base64')
        if (raw.length !== length) throw new Error('Truncated snapshot artifact')
        let written = 0
        while (written < raw.length) {
          const result = await file.write(raw, written, raw.length - written, offset + written)
          if (result.bytesWritten === 0) throw new Error('Unable to write snapshot artifact')
          written += result.bytesWritten
        }
        hash.update(raw)
        offset += raw.length
        onBytes(raw.length)
      }
      if (hash.digest('hex') !== artifact.sha256) throw new Error('Snapshot artifact checksum mismatch')
      await file.sync()
    } finally {
      await file.close()
    }
  }
}

function validateSnapshot(value: WorkspaceSnapshotInspection): void {
  if (
    !value ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    !Array.isArray(value.entries) ||
    value.entries.length > WORKSPACE_SNAPSHOT_MAX_ENTRIES ||
    !Number.isSafeInteger(value.totalBytes) ||
    value.totalBytes < 0 ||
    value.totalBytes > WORKSPACE_SNAPSHOT_MAX_BYTES ||
    !Array.isArray(value.ignoredPaths)
  )
    throw new Error('Invalid snapshot manifest')
  const seen = new Set<string>()
  for (const entry of value.entries) {
    if (
      !isWorkspaceSnapshotRelativePath(entry.path) ||
      seen.has(entry.path) ||
      !['file', 'directory', 'symlink'].includes(entry.kind) ||
      !Number.isSafeInteger(entry.mode) ||
      entry.mode < 0 ||
      entry.mode > 0o7777 ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0
    )
      throw new Error('Invalid snapshot file')
    seen.add(entry.path)
    if (entry.kind === 'file' && !/^[a-f0-9]{64}$/.test(entry.sha256 ?? ''))
      throw new Error('Missing snapshot file digest')
    if (
      entry.kind === 'symlink' &&
      (typeof entry.linkTarget !== 'string' ||
        path.posix.isAbsolute(entry.linkTarget) ||
        entry.linkTarget.includes('\0') ||
        entry.linkTarget.includes('\\'))
    )
      throw new Error('Unsafe snapshot symbolic link')
  }
  for (const entry of value.entries) {
    const parts = entry.path.split('/')
    for (let count = 1; count < parts.length; count++) {
      const ancestor = value.entries.find((candidate) => candidate.path === parts.slice(0, count).join('/'))
      if (ancestor && ancestor.kind !== 'directory') throw new Error('Snapshot file traverses another entry')
    }
  }
  if (
    value.repository &&
    (!/^[a-f0-9]{40,64}$/.test(value.repository.head) || !['sha1', 'sha256'].includes(value.repository.objectFormat))
  )
    throw new Error('Invalid Git snapshot metadata')
}
