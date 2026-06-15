export const MAX_CLIPBOARD_BINARY_FILE_BYTES = 100 * 1024 * 1024
export const MAX_CLIPBOARD_BINARY_TOTAL_BYTES = 200 * 1024 * 1024

export interface ClipboardBinaryFilePayload {
  name?: string
  type?: string
  bytes: ArrayBuffer
}

export interface SaveClipboardBinaryFilesInput {
  worktreePath: string
  temporaryFilesDirectory?: string
  files: ClipboardBinaryFilePayload[]
  sourcePaths?: string[]
}

export type SaveClipboardBinaryFilesResult =
  | { ok: true; paths: string[] }
  | { ok: false; message: string }
