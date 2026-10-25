import type { RepoFileTreeBinaryFileReadResult, RepoFileTreeTextFileReadResult } from '#/shared/file-tree.ts'

export type FilePreviewKind = 'text' | 'image'

const TEXT_FILE_PREVIEW_NAMES = new Set([
  'dockerfile',
  'makefile',
  'readme',
  'license',
  '.gitignore',
  '.env',
  '.editorconfig',
])

export function isKnownTextFilePreviewName(name: string): boolean {
  const normalized = name.toLowerCase()
  return TEXT_FILE_PREVIEW_NAMES.has(normalized) || normalized.startsWith('.env.')
}

export type FilePreviewReadResult<K extends FilePreviewKind = FilePreviewKind> = {
  text: RepoFileTreeTextFileReadResult
  image: RepoFileTreeBinaryFileReadResult
}[K]
