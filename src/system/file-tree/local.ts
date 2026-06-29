import { constants as fsConstants, promises as fs } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'
import type { ExecResult } from '#/shared/git-types.ts'
import {
  FILE_TREE_MAX_ENTRIES,
  FILE_TREE_TEXT_FILE_MAX_BYTES,
  type RepoFileTreeBinaryFileReadResult,
  type RepoFileTreeBinaryFileReplaceResult,
  type RepoFileTreeEntry,
  type RepoFileTreeResult,
  type RepoFileTreeTextFileReadResult,
  type RepoFileTreeTextFileReplaceResult,
} from '#/shared/file-tree.ts'

export function pathInsideRoot(rootPath: string, candidatePath: string): boolean {
  const root = path.resolve(rootPath)
  const candidate = path.resolve(candidatePath)
  return candidate === root || candidate.startsWith(root + path.sep)
}

function classifyFsError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : ''
  if (code === 'ENOENT') return 'error.path-not-found'
  if (code === 'ENOTDIR') return 'error.path-not-directory'
  if (code === 'EACCES' || code === 'EPERM') return 'error.path-permission-denied'
  return 'error.failed-read-repo'
}

function classifyFsWriteError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : ''
  if (code === 'ENOENT') return 'error.path-not-found'
  if (code === 'ENOTDIR') return 'error.path-not-directory'
  if (code === 'EACCES' || code === 'EPERM') return 'error.path-permission-denied'
  if (code === 'EEXIST' || code === 'ENOTEMPTY') return 'error.file-exists'
  return 'error.failed-read-repo'
}

function isAbsolutePathInput(value: string): boolean {
  return value.length > 0 && !value.includes('\0') && path.isAbsolute(value)
}

function isValidFileTreeBasename(value: string): boolean {
  return (
    value.length > 0 &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('\0') &&
    !value.includes('/') &&
    !value.includes('\\')
  )
}

function isDirectoryStat(value: unknown): value is { isDirectory(): boolean } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isDirectory' in value &&
    typeof value.isDirectory === 'function'
  )
}

const STRICT_UTF8_DECODER = new TextDecoder('utf-8', { fatal: true })

function isFileStat(value: unknown): value is { isFile(): boolean; size: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'isFile' in value &&
    typeof value.isFile === 'function' &&
    'size' in value &&
    typeof value.size === 'number'
  )
}

function decodeUtf8Text(bytes: Buffer): { ok: true; content: string } | { ok: false; message: string } {
  if (bytes.byteLength > FILE_TREE_TEXT_FILE_MAX_BYTES) {
    return { ok: false, message: 'error.file-tree-text-file-too-large' }
  }
  try {
    const content = STRICT_UTF8_DECODER.decode(bytes)
    if (content.includes('\0')) return { ok: false, message: 'error.file-tree-binary-file' }
    return { ok: true, content }
  } catch {
    return { ok: false, message: 'error.file-tree-binary-file' }
  }
}

function validateReplacementText(content: string): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  if (content.includes('\0')) return { ok: false, message: 'error.file-tree-binary-file' }
  const bytes = Buffer.from(content, 'utf8')
  if (bytes.byteLength > FILE_TREE_TEXT_FILE_MAX_BYTES) {
    return { ok: false, message: 'error.file-tree-text-file-too-large' }
  }
  return { ok: true, bytes }
}

function validateBinaryMaxBytes(maxBytes: number): boolean {
  return Number.isSafeInteger(maxBytes) && maxBytes > 0
}

function isBase64String(value: string): boolean {
  return /^[A-Za-z0-9+/]*={0,2}$/.test(value) && value.length % 4 === 0
}

function decodeReplacementBase64(
  bytesBase64: string,
  maxBytes: number,
): { ok: true; bytes: Buffer } | { ok: false; message: string } {
  if (!validateBinaryMaxBytes(maxBytes) || typeof bytesBase64 !== 'string') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  if (!isBase64String(bytesBase64)) return { ok: false, message: 'error.invalid-arguments' }
  const bytes = Buffer.from(bytesBase64, 'base64')
  if (bytes.toString('base64') !== bytesBase64) return { ok: false, message: 'error.invalid-arguments' }
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return { ok: true, bytes }
}

async function readRegularTextFile(root: string, filePath: string): Promise<RepoFileTreeTextFileReadResult> {
  const file = path.resolve(filePath)
  if (!pathInsideRoot(root, file)) return { ok: false, message: 'error.invalid-path' }
  const stat = await fs.lstat(file).catch((err: unknown) => err)
  if (!isFileStat(stat)) return { ok: false, message: classifyFsWriteError(stat) }
  if (!stat.isFile()) return { ok: false, message: 'error.file-tree-not-regular-file' }
  if (stat.size > FILE_TREE_TEXT_FILE_MAX_BYTES) return { ok: false, message: 'error.file-tree-text-file-too-large' }
  try {
    const bytes = await fs.readFile(file)
    const decoded = decodeUtf8Text(bytes)
    if (!decoded.ok) return decoded
    return { ok: true, content: decoded.content, byteLength: bytes.byteLength }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

async function pathExists(value: string): Promise<boolean> {
  try {
    await fs.access(value, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

function relativePath(worktreePath: string, absolutePath: string): string {
  return path.relative(path.resolve(worktreePath), path.resolve(absolutePath)).split(path.sep).join('/')
}

async function symlinkTargetKind(absolutePath: string): Promise<RepoFileTreeEntry['targetKind']> {
  try {
    const stat = await fs.stat(absolutePath)
    if (stat.isDirectory()) return 'directory'
    if (stat.isFile()) return 'file'
    return 'other'
  } catch {
    return 'missing'
  }
}

function sortEntries(entries: RepoFileTreeEntry[]): RepoFileTreeEntry[] {
  return entries.sort((a, b) => {
    const aDirectory = a.kind === 'directory'
    const bDirectory = b.kind === 'directory'
    if (aDirectory !== bDirectory) return aDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })
}

export async function listLocalFileTreeDirectory(
  worktreePath: string,
  dirPath: string,
): Promise<RepoFileTreeResult> {
  if (!worktreePath || !dirPath || worktreePath.includes('\0') || dirPath.includes('\0')) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const dir = path.resolve(dirPath)
  if (!pathInsideRoot(root, dir)) return { ok: false, message: 'error.invalid-path' }

  try {
    const stat = await fs.stat(dir)
    if (!stat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }
    const dirents = await fs.readdir(dir, { withFileTypes: true })
    if (dirents.length > FILE_TREE_MAX_ENTRIES) return { ok: false, message: 'error.file-tree-directory-too-large' }
    const entries: RepoFileTreeEntry[] = []
    for (const dirent of dirents) {
      const absolutePath = path.join(dir, dirent.name)
      const kind = dirent.isDirectory() ? 'directory' : dirent.isSymbolicLink() ? 'symlink' : 'file'
      entries.push({
        name: dirent.name,
        absolutePath,
        relativePath: relativePath(root, absolutePath),
        kind,
        ...(kind === 'symlink' ? { targetKind: await symlinkTargetKind(absolutePath) } : {}),
      })
    }
    return { ok: true, worktreePath: root, dirPath: dir, entries: sortEntries(entries) }
  } catch (err) {
    return { ok: false, message: classifyFsError(err) }
  }
}

export async function renameLocalFileTreeEntry(
  worktreePath: string,
  oldPath: string,
  newName: string,
): Promise<ExecResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(oldPath) || !isValidFileTreeBasename(newName)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const oldAbsolute = path.resolve(oldPath)
  if (!pathInsideRoot(root, oldAbsolute)) return { ok: false, message: 'error.invalid-path' }
  if (oldAbsolute === root) return { ok: false, message: 'error.delete-root-forbidden' }
  const newAbsolute = path.join(path.dirname(oldAbsolute), newName)
  if (!pathInsideRoot(root, newAbsolute)) return { ok: false, message: 'error.invalid-path' }
  if (await pathExists(newAbsolute)) return { ok: false, message: 'error.file-exists' }
  try {
    await fs.rename(oldAbsolute, newAbsolute)
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function createLocalFileTreeDirectory(
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(parentDirPath) || !isValidFileTreeBasename(name)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const parentDir = path.resolve(parentDirPath)
  if (!pathInsideRoot(root, parentDir)) return { ok: false, message: 'error.invalid-path' }
  const parentStat = await fs.stat(parentDir).catch((err: unknown) => err)
  if (!isDirectoryStat(parentStat)) {
    return { ok: false, message: classifyFsWriteError(parentStat) }
  }
  if (!parentStat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }

  const target = path.join(parentDir, name)
  if (!pathInsideRoot(root, target)) return { ok: false, message: 'error.invalid-path' }
  if (await pathExists(target)) return { ok: false, message: 'error.file-exists' }

  try {
    await fs.mkdir(target)
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function createLocalFileTreeFile(
  worktreePath: string,
  parentDirPath: string,
  name: string,
): Promise<ExecResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(parentDirPath) || !isValidFileTreeBasename(name)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const parentDir = path.resolve(parentDirPath)
  if (!pathInsideRoot(root, parentDir)) return { ok: false, message: 'error.invalid-path' }
  const parentStat = await fs.stat(parentDir).catch((err: unknown) => err)
  if (!isDirectoryStat(parentStat)) return { ok: false, message: classifyFsWriteError(parentStat) }
  if (!parentStat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }

  const target = path.join(parentDir, name)
  if (!pathInsideRoot(root, target)) return { ok: false, message: 'error.invalid-path' }
  try {
    const handle = await fs.open(target, 'wx')
    await handle.close()
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function readLocalFileTreeTextFile(
  worktreePath: string,
  filePath: string,
): Promise<RepoFileTreeTextFileReadResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  return await readRegularTextFile(path.resolve(worktreePath), filePath)
}

export async function replaceLocalFileTreeTextFile(
  worktreePath: string,
  filePath: string,
  content: string,
): Promise<RepoFileTreeTextFileReplaceResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath) || typeof content !== 'string') {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const replacement = validateReplacementText(content)
  if (!replacement.ok) return replacement
  const root = path.resolve(worktreePath)
  const previous = await readRegularTextFile(root, filePath)
  if (!previous.ok) return previous
  try {
    await fs.writeFile(path.resolve(filePath), replacement.bytes)
    return { ok: true, previousContent: previous.content, previousByteLength: previous.byteLength }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function readLocalFileTreeBinaryFile(
  worktreePath: string,
  filePath: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReadResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath) || !validateBinaryMaxBytes(maxBytes)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const file = path.resolve(filePath)
  if (!pathInsideRoot(root, file)) return { ok: false, message: 'error.invalid-path' }
  const info = await fs.lstat(file).catch((err: unknown) => err)
  if (!isFileStat(info)) return { ok: false, message: classifyFsWriteError(info) }
  if (!info.isFile()) return { ok: false, message: 'error.file-tree-not-regular-file' }
  if (info.size > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  try {
    const bytes = await fs.readFile(file)
    if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
    const decoded = decodeUtf8Text(bytes)
    return {
      ok: true,
      name: path.basename(file),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
      ...(decoded.ok ? { text: decoded.content } : {}),
    }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function replaceLocalFileTreeBinaryFile(
  worktreePath: string,
  filePath: string,
  bytesBase64: string,
  maxBytes: number,
): Promise<RepoFileTreeBinaryFileReplaceResult> {
  if (!isAbsolutePathInput(worktreePath) || !isAbsolutePathInput(filePath)) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const next = decodeReplacementBase64(bytesBase64, maxBytes)
  if (!next.ok) return next
  const previous = await readLocalFileTreeBinaryFile(worktreePath, filePath, maxBytes)
  if (!previous.ok) return previous
  try {
    await fs.writeFile(path.resolve(filePath), next.bytes)
    return {
      ok: true,
      previousBytesBase64: previous.bytesBase64,
      previousByteLength: previous.byteLength,
    }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function deleteLocalFileTreeEntries(
  worktreePath: string,
  paths: string[],
): Promise<ExecResult> {
  if (!isAbsolutePathInput(worktreePath) || paths.length === 0 || paths.some((item) => !isAbsolutePathInput(item))) {
    return { ok: false, message: 'error.invalid-arguments' }
  }
  const root = path.resolve(worktreePath)
  const targets = paths.map((item) => path.resolve(item))
  for (const target of targets) {
    if (!pathInsideRoot(root, target)) return { ok: false, message: 'error.invalid-path' }
    if (target === root) return { ok: false, message: 'error.delete-root-forbidden' }
  }
  try {
    for (const target of targets) {
      await fs.rm(target, { recursive: true, force: false })
    }
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}

export async function moveLocalFileTreeEntries(
  worktreePath: string,
  paths: string[],
  targetDirPath: string,
): Promise<ExecResult> {
  if (
    !isAbsolutePathInput(worktreePath) ||
    !isAbsolutePathInput(targetDirPath) ||
    paths.length === 0 ||
    paths.some((item) => !isAbsolutePathInput(item))
  ) {
    return { ok: false, message: 'error.invalid-arguments' }
  }

  const root = path.resolve(worktreePath)
  const targetDir = path.resolve(targetDirPath)
  if (!pathInsideRoot(root, targetDir)) return { ok: false, message: 'error.invalid-path' }
  const targetStat = await fs.stat(targetDir).catch((err: unknown) => err)
  if (!isDirectoryStat(targetStat)) {
    return { ok: false, message: classifyFsWriteError(targetStat) }
  }
  if (!targetStat.isDirectory()) return { ok: false, message: 'error.path-not-directory' }

  const seenDestinations = new Set<string>()
  const moves: Array<{ source: string; destination: string }> = []
  for (const item of paths) {
    const source = path.resolve(item)
    if (!pathInsideRoot(root, source)) return { ok: false, message: 'error.invalid-path' }
    if (source === root) return { ok: false, message: 'error.delete-root-forbidden' }

    const sourceStat = await fs.lstat(source).catch((err: unknown) => err)
    if (!isDirectoryStat(sourceStat)) {
      return { ok: false, message: classifyFsWriteError(sourceStat) }
    }

    if (sourceStat.isDirectory() && pathInsideRoot(source, targetDir)) {
      return { ok: false, message: 'error.invalid-path' }
    }

    const destination = path.join(targetDir, path.basename(source))
    if (!pathInsideRoot(root, destination)) return { ok: false, message: 'error.invalid-path' }
    if (destination === source) continue
    if (seenDestinations.has(destination)) return { ok: false, message: 'error.file-exists' }
    seenDestinations.add(destination)
    if (await pathExists(destination)) return { ok: false, message: 'error.file-exists' }
    moves.push({ source, destination })
  }

  try {
    for (const move of moves) await fs.rename(move.source, move.destination)
    return { ok: true, message: '' }
  } catch (err) {
    return { ok: false, message: classifyFsWriteError(err) }
  }
}
