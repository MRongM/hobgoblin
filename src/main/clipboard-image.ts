import { clipboard } from 'electron'
import {
  MAX_CLIPBOARD_BINARY_FILE_BYTES,
  type ClipboardBinaryFilePayload,
} from '#/shared/clipboard-binary-temp-files.ts'

export function readClipboardImageFromSystem(
  maxBytes = MAX_CLIPBOARD_BINARY_FILE_BYTES,
): ClipboardBinaryFilePayload | null {
  try {
    const image = clipboard.readImage()
    if (image.isEmpty()) return null
    const png = image.toPNG()
    if (png.byteLength === 0 || png.byteLength > maxBytes) return null
    return {
      name: 'clipboard.png',
      type: 'image/png',
      bytes: Uint8Array.from(png).buffer,
    }
  } catch {
    return null
  }
}
