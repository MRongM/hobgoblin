export const FILE_TREE_CLIPBOARD_FORMAT = 'application/x-hobgoblin-file-content+json;version=1'
export const FILE_TREE_CLIPBOARD_SCHEMA_VERSION = 1

export interface FileTreeClipboardFilePayload {
  name: string
  bytesBase64: string
  byteLength: number
  text?: string
  mimeType?: string
}

export type FileTreeClipboardWriteResult = { ok: true } | { ok: false; message: string }
export type FileTreeClipboardReadResult =
  | { ok: true; file: FileTreeClipboardFilePayload }
  | { ok: false; message: string }

export function fileTreeClipboardMaxBytes(maxBytesMb: number): number {
  return Math.max(1, Math.round(maxBytesMb)) * 1024 * 1024
}
