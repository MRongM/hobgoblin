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

export async function readFileTreeClipboardFile(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return { ok: false, message: 'error.invalid-arguments' }
  const custom = readCustomClipboard(maxBytes)
  if (custom.ok) return custom
  const fromPath = await readFirstClipboardPath(maxBytes)
  if (fromPath.ok) return fromPath
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
