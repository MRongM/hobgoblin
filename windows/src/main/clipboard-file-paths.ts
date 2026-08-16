import { clipboard } from 'electron'

const FILE_URL_FORMATS = ['text/uri-list', 'public/file-url'] as const

export function readClipboardFilePathsFromSystem(): string[] {
  const values: string[] = []
  for (const format of FILE_URL_FORMATS) values.push(...parseUriList(readClipboardFormat(format)))
  values.push(...parseUriList(readClipboardBookmarkUrl()))
  return [...new Set(values)]
}

function readClipboardFormat(format: string): string {
  try {
    return clipboard.read(format)
  } catch {
    return ''
  }
}

function readClipboardBookmarkUrl(): string {
  try {
    return clipboard.readBookmark().url
  } catch {
    return ''
  }
}

function parseUriList(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map(fileUrlToPath)
    .filter((path): path is string => !!path)
}

function fileUrlToPath(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'file:') return null
    const decoded = decodeURIComponent(url.pathname)
    return /^\/[A-Za-z]:\//.test(decoded) ? decoded.slice(1) : decoded
  } catch {
    return null
  }
}
