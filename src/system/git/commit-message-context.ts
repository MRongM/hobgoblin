import path from 'node:path'
import { lstat, readFile } from 'node:fs/promises'
import { git } from '#/system/git/helper.ts'
import { parseStatus } from '#/system/git/parsers.ts'

const MAX_TRACKED_DIFF_LENGTH = 40_000
const MAX_UNTRACKED_TOTAL_LENGTH = 16_000
const MAX_UNTRACKED_FILE_LENGTH = 8_000
const MAX_UNTRACKED_FILES_WITH_CONTENT = 10

export interface CommitMessageContext {
  status: string[]
  stat: string
  diff: string
  untracked: string
  omitted: string[]
  truncated: boolean
}

export async function getWorktreeCommitMessageContext(
  worktreePath: string,
  options?: { signal?: AbortSignal },
): Promise<CommitMessageContext> {
  const signal = options?.signal
  const statusOutput = await git(worktreePath, ['status', '--porcelain', '-z', '-uall'], { signal })
  const statusEntries = parseStatus(statusOutput)
  const status = statusEntries.map((entry) => {
    const code = `${entry.x}${entry.y}`.trimEnd().padEnd(2, ' ')
    return entry.originalPath ? `${code} ${entry.originalPath} -> ${entry.path}` : `${code} ${entry.path}`
  })

  const stat = await git(worktreePath, ['diff', '--stat', 'HEAD', '--'], { signal })
  const trackedDiff = await git(worktreePath, ['diff', 'HEAD', '--'], { signal })
  const cappedDiff = capText(trackedDiff, MAX_TRACKED_DIFF_LENGTH)
  const untrackedPaths = statusEntries.filter((entry) => entry.x === '?' && entry.y === '?').map((entry) => entry.path)
  const untracked = await collectUntrackedExcerpts(worktreePath, untrackedPaths, signal)

  return {
    status,
    stat,
    diff: cappedDiff.text,
    untracked: untracked.text,
    omitted: untracked.omitted,
    truncated: cappedDiff.truncated || untracked.truncated,
  }
}

export function isEmptyCommitMessageContext(context: CommitMessageContext): boolean {
  return (
    context.status.length === 0 &&
    !context.stat.trim() &&
    !context.diff.trim() &&
    !context.untracked.trim() &&
    context.omitted.length === 0
  )
}

export function formatCommitMessageContext(context: CommitMessageContext): string {
  const sections: string[] = []
  if (context.status.length > 0) {
    sections.push(['Changed files:', ...context.status].join('\n'))
  }
  if (context.stat.trim()) {
    sections.push(['Diff stat:', context.stat.trim()].join('\n'))
  }
  if (context.diff.trim()) {
    sections.push(['Tracked text diff:', context.diff.trim()].join('\n'))
  }
  if (context.untracked.trim()) {
    sections.push(['Untracked file excerpts:', context.untracked.trim()].join('\n'))
  }
  if (context.omitted.length > 0 || context.truncated) {
    const notes = [...context.omitted]
    if (context.truncated) notes.push('[tracked diff truncated]')
    sections.push(['Omissions and limits:', ...notes].join('\n'))
  }
  return sections.join('\n\n').trim()
}

async function collectUntrackedExcerpts(
  worktreePath: string,
  untrackedPaths: string[],
  signal?: AbortSignal,
): Promise<{ text: string; omitted: string[]; truncated: boolean }> {
  const excerpts: string[] = []
  const omitted: string[] = []
  let totalLength = 0
  let truncated = false

  for (let index = 0; index < untrackedPaths.length; index += 1) {
    if (signal?.aborted) throw new Error('cancelled')
    if (index >= MAX_UNTRACKED_FILES_WITH_CONTENT) {
      omitted.push(`${untrackedPaths.length - index} untracked files omitted after limit ${MAX_UNTRACKED_FILES_WITH_CONTENT}`)
      break
    }

    const relativePath = untrackedPaths[index]!
    const resolved = path.resolve(worktreePath, relativePath)
    if (!isInsideWorktree(worktreePath, resolved)) {
      omitted.push(`unsafe untracked path omitted: ${relativePath}`)
      continue
    }

    const stat = await lstat(resolved)
    if (!stat.isFile() || stat.isSymbolicLink()) {
      omitted.push(`non-regular untracked path omitted: ${relativePath}`)
      continue
    }
    if (stat.size > MAX_UNTRACKED_FILE_LENGTH) {
      omitted.push(`oversized untracked file omitted: ${relativePath}`)
      continue
    }

    const content = await readFile(resolved)
    if (isBinary(content)) {
      omitted.push(`binary untracked file omitted: ${relativePath}`)
      continue
    }

    const text = content.toString('utf8')
    const nextExcerpt = `--- ${relativePath}\n${text.trimEnd()}`
    if (totalLength + nextExcerpt.length > MAX_UNTRACKED_TOTAL_LENGTH) {
      omitted.push(`untracked text excerpts truncated before: ${relativePath}`)
      truncated = true
      break
    }

    excerpts.push(nextExcerpt)
    totalLength += nextExcerpt.length
  }

  return { text: excerpts.join('\n\n'), omitted, truncated }
}

function capText(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) return { text, truncated: false }
  return { text: text.slice(0, maxLength).trimEnd(), truncated: true }
}

function isBinary(content: Buffer): boolean {
  return content.includes(0)
}

function isInsideWorktree(worktreePath: string, candidate: string): boolean {
  const root = path.resolve(worktreePath)
  return candidate === root || candidate.startsWith(`${root}${path.sep}`)
}
