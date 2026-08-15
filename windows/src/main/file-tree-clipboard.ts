import { clipboard, nativeImage } from 'electron'
import {
  type FileTreeClipboardFilePayload,
  type FileTreeClipboardReadResult,
  type FileTreeClipboardWriteResult,
} from '#/shared/file-tree-clipboard.ts'

export async function writeFileTreeClipboardFile(
  file: FileTreeClipboardFilePayload,
): Promise<FileTreeClipboardWriteResult> {
  if (!isValidPayload(file, Number.POSITIVE_INFINITY)) return { ok: false, message: 'error.invalid-arguments' }
  if (file.text !== undefined) {
    clipboard.clear()
    clipboard.writeText(file.text)
    return { ok: true }
  }

  const image = nativeImage.createFromBuffer(Buffer.from(file.bytesBase64, 'base64'))
  if (image.isEmpty()) return { ok: false, message: 'error.file-tree-clipboard-unsupported-content' }
  clipboard.clear()
  clipboard.writeImage(image)
  return { ok: true }
}

export async function readFileTreeClipboardFile(maxBytes: number): Promise<FileTreeClipboardReadResult> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return { ok: false, message: 'error.invalid-arguments' }
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
