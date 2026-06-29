export interface FilePathTarget {
  path: string
  line?: number
  column?: number
}

export interface FilePathTargetSpan {
  text: string
  target: FilePathTarget
  startIndex: number
  endIndex: number
}

export type EditorOpenTarget = string | FilePathTarget

const PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<])(?<token>(?:\.\/)?(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>])/gu
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[A-Za-z]:[\\/]/u
const LEADING_PUNCTUATION_PATTERN = /^[`"'([{<]+/u
const TRAILING_PUNCTUATION_PATTERN = /[`"',;)\]}>]+$/u
const LINE_COLUMN_TARGET_PATTERN = /^(?<path>.+):(?<line>\d+):(?<column>\d+)$/u
const LINE_TARGET_PATTERN = /^(?<path>.+):(?<line>\d+)$/u
const INVALID_COLON_SUFFIX_PATTERN = /:\d*:?\d*$/u

function safePositiveInteger(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null
}

function splitLineTarget(value: string): FilePathTarget | null {
  const lineColumnMatch = LINE_COLUMN_TARGET_PATTERN.exec(value)
  if (lineColumnMatch) {
    const path = lineColumnMatch.groups?.path ?? ''
    const line = safePositiveInteger(lineColumnMatch.groups?.line)
    const column = safePositiveInteger(lineColumnMatch.groups?.column)
    return line === null || column === null ? null : { path, line, column }
  }

  const match = LINE_TARGET_PATTERN.exec(value)
  if (!match) {
    if (INVALID_COLON_SUFFIX_PATTERN.test(value)) return null
    return { path: value }
  }

  const path = match.groups?.path ?? ''
  const line = safePositiveInteger(match.groups?.line)
  if (line === null) return null
  return { path, line }
}

export function parseFilePathTarget(raw: string): FilePathTarget | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null
  if (trimmed.startsWith('/') || WINDOWS_ABSOLUTE_PATH_PATTERN.test(trimmed)) return null

  const target = splitLineTarget(trimmed)
  if (!target) return null

  let relativePath = target.path
  while (relativePath.startsWith('./')) relativePath = relativePath.slice(2)
  if (!relativePath || relativePath.startsWith('/') || relativePath.includes('\\')) return null

  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return target.column === undefined
    ? target.line === undefined
      ? { path: relativePath }
      : { path: relativePath, line: target.line }
    : { path: relativePath, line: target.line, column: target.column }
}

export function filePathTargetsForText(text: string): FilePathTargetSpan[] {
  const spans: FilePathTargetSpan[] = []
  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const target = parseFilePathTarget(token)
    if (!target) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    spans.push({ text: token, target, startIndex, endIndex: startIndex + token.length })
  }
  return spans
}

export function editorTargetPath(target: EditorOpenTarget): string {
  return typeof target === 'string' ? target : target.path
}

export function editorTargetPathArgument(target: EditorOpenTarget): string {
  if (typeof target === 'string' || target.line === undefined) return editorTargetPath(target)
  return target.column === undefined ? `${target.path}:${target.line}` : `${target.path}:${target.line}:${target.column}`
}
