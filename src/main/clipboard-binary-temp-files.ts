import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_CLIPBOARD_BINARY_FILE_BYTES,
  MAX_CLIPBOARD_BINARY_TOTAL_BYTES,
  type SaveClipboardBinaryFilesInput,
  type SaveClipboardBinaryFilesResult,
} from '#/shared/clipboard-binary-temp-files.ts'
import { isValidAbsolutePath } from '#/shared/input-validation.ts'

interface SaveOptions {
  now?: Date
  randomHex?: () => string
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
}

export async function saveClipboardBinaryFilesToTemp(
  input: SaveClipboardBinaryFilesInput,
  options: SaveOptions = {},
): Promise<SaveClipboardBinaryFilesResult> {
  if (!isValidAbsolutePath(input.worktreePath)) return { ok: false, message: 'error.invalid-path' }
  const files = Array.isArray(input.files) ? input.files : []
  const sourcePaths = Array.isArray(input.sourcePaths) ? input.sourcePaths : []
  if (files.length === 0 && sourcePaths.length === 0) return { ok: true, paths: [] }

  try {
    const sourceFiles = await sourceFilesFromPaths(sourcePaths)
    const sizes = [
      ...files.map((file) => file.bytes?.byteLength ?? -1),
      ...sourceFiles.map((file) => file.byteLength),
    ]
    if (sizes.some((size) => size < 0 || size > MAX_CLIPBOARD_BINARY_FILE_BYTES)) {
      return { ok: false, message: 'error.file-too-large' }
    }
    const total = sizes.reduce((sum, size) => sum + size, 0)
    if (total > MAX_CLIPBOARD_BINARY_TOTAL_BYTES) return { ok: false, message: 'error.file-too-large' }

    const targetDir = resolveTargetDirectory(input.worktreePath, input.temporaryFilesDirectory)
    if (!targetDir) return { ok: false, message: 'error.invalid-path' }

    await mkdir(targetDir, { recursive: true })
    const paths: string[] = []
    for (const file of files) {
      if (!(file.bytes instanceof ArrayBuffer)) return { ok: false, message: 'error.invalid-arguments' }
      const extension = extensionForFile(file.name, file.type)
      const filePath = await writeUniqueFile(targetDir, extension, new Uint8Array(file.bytes), options)
      paths.push(filePath)
    }
    for (const file of sourceFiles) {
      paths.push(await copyUniqueFile(targetDir, extensionForFile(file.path, undefined), file.path, options))
    }
    return { ok: true, paths }
  } catch (err) {
    if ((err as { message?: string }).message === 'invalid-source-path') return { ok: false, message: 'error.invalid-path' }
    if ((err as { message?: string }).message === 'invalid-source-file') return { ok: false, message: 'error.invalid-arguments' }
    return { ok: false, message: 'error.failed-write-file' }
  }
}

async function sourceFilesFromPaths(sourcePaths: string[]): Promise<Array<{ path: string; byteLength: number }>> {
  const files: Array<{ path: string; byteLength: number }> = []
  for (const sourcePath of sourcePaths) {
    if (!isValidAbsolutePath(sourcePath)) throw new Error('invalid-source-path')
    const info = await stat(sourcePath)
    if (!info.isFile()) throw new Error('invalid-source-file')
    files.push({ path: path.normalize(sourcePath), byteLength: info.size })
  }
  return files
}

function resolveTargetDirectory(worktreePath: string, configured: string | undefined): string | null {
  const trimmed = typeof configured === 'string' ? configured.trim() : ''
  if (trimmed) return isValidAbsolutePath(trimmed) ? path.normalize(trimmed) : null
  return path.join(path.normalize(worktreePath), 'tmp')
}

function extensionForFile(name: string | undefined, type: string | undefined): string {
  const basename = path.basename(name ?? '')
  const extension = path.extname(basename)
  if (isSafeExtension(extension)) return extension
  return MIME_EXTENSIONS[(type ?? '').toLowerCase()] ?? '.bin'
}

function isSafeExtension(extension: string): boolean {
  return /^\.[A-Za-z0-9]{1,16}$/.test(extension)
}

async function writeUniqueFile(
  targetDir: string,
  extension: string,
  bytes: Uint8Array,
  options: SaveOptions,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const filePath = path.join(targetDir, `pasted-${formatStamp(options.now ?? new Date())}-${randomHex(options)}${extension}`)
    try {
      await writeFile(filePath, bytes, { flag: 'wx' })
      return filePath
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') throw err
    }
  }
  throw new Error('unique clipboard paste filename exhausted')
}

async function copyUniqueFile(
  targetDir: string,
  extension: string,
  sourcePath: string,
  options: SaveOptions,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const filePath = path.join(targetDir, `pasted-${formatStamp(options.now ?? new Date())}-${randomHex(options)}${extension}`)
    try {
      await copyFile(sourcePath, filePath, constants.COPYFILE_EXCL)
      return filePath
    } catch (err) {
      if ((err as { code?: string }).code !== 'EEXIST') throw err
    }
  }
  throw new Error('unique clipboard paste filename exhausted')
}

function randomHex(options: SaveOptions): string {
  return options.randomHex?.() ?? randomBytes(4).toString('hex')
}

function formatStamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  ]
  const [year, month, day, hour, minute, second] = parts
  return `${year}${pad(month)}${pad(day)}-${pad(hour)}${pad(minute)}${pad(second)}`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
