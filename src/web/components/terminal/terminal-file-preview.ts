import type { FilePathTarget } from '#/shared/file-path-target.ts'
import { isKnownTextFilePreviewName } from '#/shared/file-preview.ts'
import type { RepoFileTreeBinaryFileReadResult, RepoFileTreeTextFileReadResult } from '#/shared/file-tree.ts'
import {
  joinWorktreeRelativePath,
  pathStyle,
  safeRelativePath,
  worktreeRelativePathFromAbsolute,
  windowsPathIdentityKey,
} from '#/shared/path-semantics.ts'
import {
  readRepositoryFilePreview,
  readRepositoryFileTreeBinaryFile,
  readRepositoryFileTreeTextFile,
} from '#/web/repo-client.ts'

export type TerminalFilePreviewKind = 'text' | 'image'

export interface TerminalFilePreviewTarget {
  repoId: string
  worktreePath: string
  target: FilePathTarget
  relativePath: string | null
  kind: TerminalFilePreviewKind
}

export type TerminalFilePreviewReadResult =
  | (RepoFileTreeTextFileReadResult & { kind: 'text'; relativePath: string | null })
  | (RepoFileTreeBinaryFileReadResult & { kind: 'image'; relativePath: string | null })

const TEXT_EXTENSIONS = new Set([
  'txt',
  'text',
  'md',
  'mdx',
  'markdown',
  'log',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'xml',
  'csv',
  'tsv',
  'ini',
  'conf',
  'config',
  'sh',
  'bash',
  'zsh',
  'fish',
  'ps1',
  'bat',
  'cmd',
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'mts',
  'cts',
  'py',
  'rb',
  'go',
  'rs',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'java',
  'kt',
  'swift',
  'php',
  'html',
  'css',
  'scss',
  'sql',
  'vue',
  'svelte',
])
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'])
const IMAGE_MAX_BYTES = 20 * 1024 * 1024

export function terminalFilePreviewKind(path: string): TerminalFilePreviewKind | null {
  const name = path.split(/[\\/]/u).at(-1)?.toLowerCase() ?? ''
  if (isKnownTextFilePreviewName(name)) return 'text'
  const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : ''
  if (IMAGE_EXTENSIONS.has(extension)) return 'image'
  return TEXT_EXTENSIONS.has(extension) ? 'text' : null
}

export function createTerminalFilePreviewTarget(
  repoId: string,
  worktreePath: string,
  target: FilePathTarget,
): TerminalFilePreviewTarget | null {
  const style = pathStyle(target.path)
  if (target.path.includes('\0') || style === 'windowsUncAbsolute') return null
  if (style !== 'relative' && style !== pathStyle(worktreePath)) return null
  const relativePath =
    style === 'relative' ? safeRelativePath(target.path) : worktreeRelativePathFromAbsolute(worktreePath, target.path)
  if (style === 'relative' && !relativePath) return null
  if (relativePath !== null && !safeRelativePath(relativePath)) return null
  const kind = terminalFilePreviewKind(relativePath ?? target.path)
  return kind ? { repoId, worktreePath, target, relativePath, kind } : null
}

export function terminalFilePreviewPath(target: TerminalFilePreviewTarget): string {
  if (target.relativePath !== null) return joinWorktreeRelativePath(target.worktreePath, target.relativePath)
  const path = target.target.path
  const root = pathStyle(path) === 'posixAbsolute' ? '/' : `${path.slice(0, 2)}/`
  const relative = worktreeRelativePathFromAbsolute(root, path)
  return relative ? joinWorktreeRelativePath(root, relative) : path
}

export function terminalFilePreviewIdentity(target: TerminalFilePreviewTarget): string {
  const path = terminalFilePreviewPath(target)
  return JSON.stringify([target.repoId, windowsPathIdentityKey(path) ?? path])
}

export async function readTerminalFilePreview(
  target: TerminalFilePreviewTarget,
  signal?: AbortSignal,
): Promise<TerminalFilePreviewReadResult> {
  const filePath = terminalFilePreviewPath(target)
  if (target.kind === 'text') {
    const result =
      target.relativePath === null
        ? await readRepositoryFilePreview(target.repoId, filePath, 'text', signal)
        : await readRepositoryFileTreeTextFile(target.repoId, target.worktreePath, filePath, signal)
    return { ...result, kind: 'text', relativePath: target.relativePath }
  }
  const result =
    target.relativePath === null
      ? await readRepositoryFilePreview(target.repoId, filePath, 'image', signal)
      : await readRepositoryFileTreeBinaryFile(target.repoId, target.worktreePath, filePath, IMAGE_MAX_BYTES, signal)
  return { ...result, kind: 'image', relativePath: target.relativePath }
}
