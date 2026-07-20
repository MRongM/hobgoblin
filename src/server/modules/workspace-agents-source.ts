import path from 'node:path'
import { readWorkspaceConfig } from '#/server/modules/workspace-config-source.ts'
import {
  workspaceRepositoryId,
  workspaceRepositoryPath,
  workspaceRootId,
} from '#/server/modules/workspace-paths.ts'
import {
  getRepositorySnapshot,
  readRepositoryFileTreeTextFile,
} from '#/server/modules/repo-read-paths.ts'
import { replaceRepositoryFileTreeTextFile } from '#/server/modules/repo-write-paths.ts'
import { isRemoteRepoId } from '#/shared/remote-repo.ts'
import type { RepoSnapshot } from '#/shared/rpc.ts'

const startMarker = '<!-- hobgoblin:workspace-inventory:start -->'
const endMarker = '<!-- hobgoblin:workspace-inventory:end -->'
const writeFailedMessage = 'workspace.agents.write-failed'

export interface WorkspaceAgentsRepository {
  name: string
  checkedOutBranches: string[]
}

export interface WorkspaceAgentsSnapshot {
  repositories: WorkspaceAgentsRepository[]
}

interface WorkspaceAgentsSourceDependencies {
  readConfig?: typeof readWorkspaceConfig
  getSnapshot?: typeof getRepositorySnapshot
  readTextFile?: typeof readRepositoryFileTreeTextFile
  replaceTextFile?: typeof replaceRepositoryFileTreeTextFile
}

const syncQueues = new Map<string, Promise<void>>()

export function upsertWorkspaceAgentsBlock(raw: string, snapshot: WorkspaceAgentsSnapshot): string {
  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n'
  const lines = raw.split(lineEnding)
  const starts = markerIndices(lines, startMarker)
  const ends = markerIndices(lines, endMarker)
  const block = renderWorkspaceAgentsBlock(snapshot, lineEnding)

  if (starts.length === 0 && ends.length === 0) {
    if (raw.length === 0) return `${block}${lineEnding}`
    const separator = raw.endsWith(`${lineEnding}${lineEnding}`)
      ? ''
      : raw.endsWith(lineEnding)
        ? lineEnding
        : `${lineEnding}${lineEnding}`
    return `${raw}${separator}${block}${lineEnding}`
  }

  if (starts.length !== 1 || ends.length !== 1 || starts[0]! >= ends[0]!) {
    throw new Error(writeFailedMessage)
  }
  return [
    ...lines.slice(0, starts[0]),
    ...block.split(lineEnding),
    ...lines.slice(ends[0]! + 1),
  ].join(lineEnding)
}

export async function syncWorkspaceAgents(
  rootId: string,
  dependencies: WorkspaceAgentsSourceDependencies = {},
): Promise<void> {
  const normalizedRootId = workspaceRootId(rootId)
  await enqueueSync(normalizedRootId, async () => {
    try {
      await syncWorkspaceAgentsNow(normalizedRootId, dependencies)
    } catch {
      throw new Error(writeFailedMessage)
    }
  })
}

async function syncWorkspaceAgentsNow(
  rootId: string,
  dependencies: WorkspaceAgentsSourceDependencies,
): Promise<void> {
  const rootPath = workspaceRepositoryPath(rootId)
  if (!rootPath) throw new Error(writeFailedMessage)
  const agentsPath = (isRemoteRepoId(rootId) ? path.posix : path).join(rootPath, 'AGENTS.md')
  const read = await (dependencies.readTextFile ?? readRepositoryFileTreeTextFile)(rootId, rootPath, agentsPath)
  if (!read.ok) {
    if (read.message === 'error.path-not-found') return
    throw new Error(writeFailedMessage)
  }

  const configuration = await (dependencies.readConfig ?? readWorkspaceConfig)(rootId)
  if (configuration.kind !== 'ready') throw new Error(writeFailedMessage)
  const repositories: WorkspaceAgentsRepository[] = []
  for (const name of configuration.config.repo) {
    const repoId = workspaceRepositoryId(rootId, name)
    if (!repoId) throw new Error(writeFailedMessage)
    const snapshot = await (dependencies.getSnapshot ?? getRepositorySnapshot)(repoId)
    if (!snapshot) throw new Error(writeFailedMessage)
    repositories.push({ name, checkedOutBranches: checkedOutBranches(snapshot) })
  }

  const updated = upsertWorkspaceAgentsBlock(read.content, { repositories })
  if (updated === read.content) return
  const replaced = await (dependencies.replaceTextFile ?? replaceRepositoryFileTreeTextFile)(
    rootId,
    rootPath,
    agentsPath,
    updated,
  )
  if (!replaced.ok) throw new Error(writeFailedMessage)
}

function checkedOutBranches(snapshot: RepoSnapshot): string[] {
  const current = snapshot.current
  const linked = snapshot.branches
    .filter((branch) => branch.worktree && branch.name !== current)
    .map((branch) => branch.name)
    .filter((name) => name.length > 0)
    .sort(compareStrings)
  return [...new Set([...(current ? [current] : []), ...linked])]
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function markerIndices(lines: string[], marker: string): number[] {
  return lines.flatMap((line, index) => (line === marker ? [index] : []))
}

function renderWorkspaceAgentsBlock(snapshot: WorkspaceAgentsSnapshot, lineEnding: string): string {
  const json = JSON.stringify(snapshot, null, 2)
    .split('\n')
    .map((line) => `    ${line}`)
    .join(lineEnding)
  return [startMarker, '## Hobgoblin workspace inventory', '', json, endMarker].join(lineEnding)
}

async function enqueueSync(rootId: string, sync: () => Promise<void>): Promise<void> {
  const previous = syncQueues.get(rootId) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(sync)
  syncQueues.set(rootId, operation)
  try {
    await operation
  } finally {
    if (syncQueues.get(rootId) === operation) syncQueues.delete(rootId)
  }
}
