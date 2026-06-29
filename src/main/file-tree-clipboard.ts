import { randomBytes } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, clipboard } from 'electron'
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'
import {
  FILE_TREE_CLIPBOARD_FORMAT,
  FILE_TREE_CLIPBOARD_SCHEMA_VERSION,
  type FileTreeClipboardFilePayload,
  type FileTreeClipboardReadResult,
  type FileTreeClipboardWriteResult,
} from '#/shared/file-tree-clipboard.ts'

const MAX_TEMP_FILE_AGE_MS = 24 * 60 * 60 * 1000

export async function writeFileTreeClipboardFile(
  file: FileTreeClipboardFilePayload,
  options: { now?: Date; randomHex?: () => string } = {},
): Promise<FileTreeClipboardWriteResult> {
  if (!isValidPayload(file, Number.POSITIVE_INFINITY)) return { ok: false, message: 'error.invalid-arguments' }
  const payload = { version: FILE_TREE_CLIPBOARD_SCHEMA_VERSION, ...file }
  const buffer = Buffer.from(JSON.stringify(payload), 'utf8')
  const fileUrl = await writeClipboardTempFile(file, options).catch((err) => {
    console.warn('[file-tree-clipboard] file-url compatibility write failed', err)
    return null
  })

  if (file.text !== undefined || fileUrl) {
    clipboard.write({
      text: file.text ?? fileUrl ?? '',
      ...(file.text === undefined && fileUrl && process.platform === 'darwin' ? { bookmark: file.name } : {}),
    })
  }
  clipboard.writeBuffer(FILE_TREE_CLIPBOARD_FORMAT, buffer)
  if (fileUrl) writeFileUrlClipboardFormats(fileUrl)
  return { ok: true }
}

export async function readFileTreeClipboardFile(
  maxBytes: number,
  targetName?: string,
): Promise<FileTreeClipboardReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return { ok: false, message: 'error.invalid-arguments' }
  const custom = readCustomClipboard(maxBytes)
  if (custom.ok) return custom
  const fromPath = await readFirstClipboardPath(maxBytes)
  if (fromPath.ok) return fromPath
  const commonBinary = readCommonBinaryClipboardFormat(maxBytes, targetName)
  if (
    commonBinary.ok ||
    commonBinary.message === 'error.file-tree-clipboard-file-too-large' ||
    commonBinary.message === 'error.file-tree-clipboard-ambiguous-binary-format'
  ) {
    return commonBinary
  }
  const image = readClipboardImage(maxBytes)
  if (image.ok) return image
  const text = clipboard.readText()
  if (!text) return { ok: false, message: 'error.invalid-arguments' }
  const bytes = Buffer.from(text, 'utf8')
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return {
    ok: true,
    file: {
      name: 'clipboard.txt',
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
      text,
      mimeType: 'text/plain',
    },
  }
}

function isValidPayload(file: FileTreeClipboardFilePayload, maxBytes: number): boolean {
  if (
    typeof file.name !== 'string' ||
    file.name.length === 0 ||
    typeof file.bytesBase64 !== 'string' ||
    !Number.isSafeInteger(file.byteLength) ||
    file.byteLength < 0 ||
    file.byteLength > maxBytes ||
    (file.text !== undefined && typeof file.text !== 'string') ||
    (file.mimeType !== undefined && typeof file.mimeType !== 'string')
  ) {
    return false
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.bytesBase64) || file.bytesBase64.length % 4 !== 0) return false
  const bytes = Buffer.from(file.bytesBase64, 'base64')
  return bytes.toString('base64') === file.bytesBase64 && bytes.byteLength === file.byteLength
}

function readCustomClipboard(maxBytes: number): FileTreeClipboardReadResult {
  try {
    const raw = clipboard.readBuffer(FILE_TREE_CLIPBOARD_FORMAT)
    if (!raw || raw.byteLength === 0) return { ok: false, message: 'error.invalid-arguments' }
    const parsed = JSON.parse(raw.toString('utf8')) as { version?: unknown } & Partial<FileTreeClipboardFilePayload>
    if (parsed.version !== FILE_TREE_CLIPBOARD_SCHEMA_VERSION) return { ok: false, message: 'error.invalid-arguments' }
    const file = {
      name: parsed.name,
      bytesBase64: parsed.bytesBase64,
      byteLength: parsed.byteLength,
      ...(typeof parsed.text === 'string' ? { text: parsed.text } : {}),
      ...(typeof parsed.mimeType === 'string' ? { mimeType: parsed.mimeType } : {}),
    } as FileTreeClipboardFilePayload
    return isValidPayload(file, maxBytes) ? { ok: true, file } : { ok: false, message: 'error.invalid-arguments' }
  } catch {
    return { ok: false, message: 'error.invalid-arguments' }
  }
}

function readClipboardImage(maxBytes: number): FileTreeClipboardReadResult {
  try {
    const image = clipboard.readImage()
    if (image.isEmpty()) return { ok: false, message: 'error.invalid-arguments' }
    const bytes = image.toPNG()
    if (bytes.byteLength === 0) return { ok: false, message: 'error.invalid-arguments' }
    if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
    return {
      ok: true,
      file: {
        name: 'clipboard.png',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: 'image/png',
      },
    }
  } catch {
    return { ok: false, message: 'error.invalid-arguments' }
  }
}

async function readFirstClipboardPath(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  const [first] = readClipboardFilePathsFromSystem()
  if (!first) return { ok: false, message: 'error.invalid-arguments' }
  const info = await stat(first).catch(() => null)
  if (!info?.isFile()) return { ok: false, message: 'error.invalid-arguments' }
  if (info.size > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  const bytes = await readFile(first)
  if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
  return {
    ok: true,
    file: {
      name: path.basename(first),
      byteLength: bytes.byteLength,
      bytesBase64: bytes.toString('base64'),
    },
  }
}

interface ClipboardFormatGroup {
  id: string
  extensions: string[]
  formats: string[]
  fallback?: boolean
}

const COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS: ClipboardFormatGroup[] = [
  { id: 'pdf', extensions: ['.pdf'], formats: ['application/pdf', 'public.pdf'] },
  { id: 'rtf', extensions: ['.rtf'], formats: ['text/rtf', 'application/rtf', 'public.rtf'] },
  { id: 'html', extensions: ['.html', '.htm'], formats: ['text/html', 'public.html'] },
  { id: 'png', extensions: ['.png'], formats: ['image/png', 'public.png'] },
  { id: 'jpeg', extensions: ['.jpg', '.jpeg'], formats: ['image/jpeg', 'public.jpeg'] },
  { id: 'gif', extensions: ['.gif'], formats: ['image/gif', 'com.compuserve.gif'] },
  { id: 'webp', extensions: ['.webp'], formats: ['image/webp'] },
  { id: 'tiff', extensions: ['.tif', '.tiff'], formats: ['image/tiff', 'public.tiff'] },
  {
    id: 'zip',
    extensions: ['.zip'],
    formats: ['application/zip', 'application/x-zip-compressed', 'com.pkware.zip-archive'],
  },
  {
    id: 'docx',
    extensions: ['.docx'],
    formats: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  {
    id: 'xlsx',
    extensions: ['.xlsx'],
    formats: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  {
    id: 'pptx',
    extensions: ['.pptx'],
    formats: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  },
  { id: 'doc', extensions: ['.doc'], formats: ['application/msword'] },
  { id: 'xls', extensions: ['.xls'], formats: ['application/vnd.ms-excel'] },
  { id: 'ppt', extensions: ['.ppt'], formats: ['application/vnd.ms-powerpoint'] },
  { id: 'mp3', extensions: ['.mp3'], formats: ['audio/mpeg'] },
  { id: 'wav', extensions: ['.wav'], formats: ['audio/wav'] },
  { id: 'mp4', extensions: ['.mp4'], formats: ['video/mp4'] },
  { id: 'mov', extensions: ['.mov'], formats: ['video/quicktime'] },
  { id: 'octet-stream', extensions: [], formats: ['application/octet-stream'], fallback: true },
]

const COMMON_BINARY_CLIPBOARD_GROUPS_BY_EXTENSION = new Map(
  COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS.flatMap((group) =>
    group.extensions.map((extension) => [extension, group] as const),
  ),
)

function readCommonBinaryClipboardFormat(maxBytes: number, targetName?: string): FileTreeClipboardReadResult {
  const availableFormats = availableClipboardFormats()
  if (availableFormats.length === 0) return { ok: false, message: 'error.invalid-arguments' }
  const availableByNormalizedFormat = new Map(
    availableFormats.map((format) => [normalizeClipboardFormat(format), format] as const),
  )
  const targetGroup = clipboardFormatGroupForTargetName(targetName)
  if (targetGroup) {
    return (
      readFirstAvailableGroupFormat(targetGroup, availableByNormalizedFormat, maxBytes) ?? {
        ok: false,
        message: 'error.invalid-arguments',
      }
    )
  }
  return (
    readUniqueCommonBinaryFormat(availableByNormalizedFormat, maxBytes) ?? {
      ok: false,
      message: 'error.invalid-arguments',
    }
  )
}

function availableClipboardFormats(): string[] {
  try {
    return clipboard.availableFormats()
  } catch {
    return []
  }
}

function clipboardFormatGroupForTargetName(targetName?: string): ClipboardFormatGroup | null {
  if (!targetName) return null
  return COMMON_BINARY_CLIPBOARD_GROUPS_BY_EXTENSION.get(path.extname(targetName).toLowerCase()) ?? null
}

function readUniqueCommonBinaryFormat(
  availableByNormalizedFormat: Map<string, string>,
  maxBytes: number,
): FileTreeClipboardReadResult | null {
  const availableGroups = COMMON_BINARY_CLIPBOARD_FORMAT_GROUPS.filter((group) =>
    group.formats.some((format) => availableByNormalizedFormat.has(normalizeClipboardFormat(format))),
  )
  const specificGroups = availableGroups.filter((group) => group.fallback !== true)
  if (specificGroups.length > 1) {
    return { ok: false, message: 'error.file-tree-clipboard-ambiguous-binary-format' }
  }
  if (specificGroups.length === 1) {
    return readFirstAvailableGroupFormat(specificGroups[0]!, availableByNormalizedFormat, maxBytes)
  }
  const fallbackGroup = availableGroups.find((group) => group.fallback === true)
  return fallbackGroup ? readFirstAvailableGroupFormat(fallbackGroup, availableByNormalizedFormat, maxBytes) : null
}

function readFirstAvailableGroupFormat(
  group: ClipboardFormatGroup,
  availableByNormalizedFormat: Map<string, string>,
  maxBytes: number,
): FileTreeClipboardReadResult | null {
  for (const format of group.formats) {
    const availableFormat = availableByNormalizedFormat.get(normalizeClipboardFormat(format))
    if (!availableFormat) continue
    const result = readClipboardBufferFormat(availableFormat, maxBytes)
    if (result.ok || result.message === 'error.file-tree-clipboard-file-too-large') return result
  }
  return null
}

function readClipboardBufferFormat(format: string, maxBytes: number): FileTreeClipboardReadResult {
  try {
    const bytes = clipboard.readBuffer(format)
    if (!bytes || bytes.byteLength === 0) return { ok: false, message: 'error.invalid-arguments' }
    if (bytes.byteLength > maxBytes) return { ok: false, message: 'error.file-tree-clipboard-file-too-large' }
    return {
      ok: true,
      file: {
        name: 'clipboard.bin',
        byteLength: bytes.byteLength,
        bytesBase64: bytes.toString('base64'),
        mimeType: format,
      },
    }
  } catch {
    return { ok: false, message: 'error.invalid-arguments' }
  }
}

function normalizeClipboardFormat(format: string): string {
  return format.trim().toLowerCase()
}

async function writeClipboardTempFile(
  file: FileTreeClipboardFilePayload,
  options: { now?: Date; randomHex?: () => string },
): Promise<string> {
  const now = options.now ?? new Date()
  const dir = path.join(app.getPath('userData'), 'file-tree-clipboard')
  await cleanupOldClipboardTempFiles(dir, now)
  await mkdir(dir, { recursive: true })
  const safeName = path.basename(file.name).replace(/[^A-Za-z0-9._-]/g, '_') || 'clipboard.bin'
  const filePath = path.join(dir, `${now.getTime()}-${options.randomHex?.() ?? randomBytes(4).toString('hex')}-${safeName}`)
  await writeFile(filePath, Buffer.from(file.bytesBase64, 'base64'), { flag: 'wx' })
  return pathToFileURL(filePath).toString()
}

function writeFileUrlClipboardFormats(fileUrl: string): void {
  clipboard.writeBuffer('text/uri-list', Buffer.from(`${fileUrl}\n`, 'utf8'))
  if (process.platform === 'darwin') {
    clipboard.writeBuffer('public/file-url', Buffer.from(fileUrl, 'utf8'))
  }
}

async function cleanupOldClipboardTempFiles(dir: string, now: Date): Promise<void> {
  const entries = await readdir(dir).catch(() => [])
  await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(dir, entry)
      const info = await stat(target).catch(() => null)
      if (info && now.getTime() - info.mtimeMs > MAX_TEMP_FILE_AGE_MS) await rm(target, { force: true })
    }),
  )
}
