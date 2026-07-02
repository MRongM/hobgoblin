import { pathStyle, safeRelativePath } from '#/shared/path-semantics.ts'

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

export interface FilePathTargetParseOptions {
  allowAbsolute?: boolean
}

const PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<:：,，、;；（［【｛《〈「『])(?<token>(?:\.\/)?(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、])/gu
const HARD_WRAPPED_PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<:：,，、;；（［【｛《〈「『])(?<token>(?:\.\/)?(?:[A-Za-z0-9_@%+=.-]+\/)+(?:\r?\n[ \t]*)(?:(?:[A-Za-z0-9_@%+=.-]+\/)+[A-Za-z0-9_@%+=.,-]+|[A-Za-z0-9_@%+=-]+\.[A-Za-z0-9][A-Za-z0-9._-]*)(?::\d+(?::\d+)?)?)(?=$|[\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、])/gu
const ABSOLUTE_PATH_TOKEN_PATTERN =
  /(^|[\s"'`([{<:：,，、;；（［【｛《〈「『])(?<token>(?:[A-Za-z]:[\\/]|\/)[^\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、]+)(?=$|[\s"'`,;)\]}>，。、；：！？）］】｝》〉」』、])/gu
const PYTHON_FILE_LINE_PATTERN =
  /(^|[\s([{<（［【｛《〈「『])File\s+["'](?<path>[^"'\r\n]+)["'],\s+line\s+(?<line>\d+)/gu
const URL_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//u
const LEADING_PUNCTUATION_PATTERN = /^[`"'([{<（［【｛《〈「『]+/u
const TRAILING_PUNCTUATION_PATTERN = /[`"',;)\]}>，。、；：！？）］】｝》〉」』、]+$/u
const LINE_COLUMN_TARGET_PATTERN = /^(?<path>.+):(?<line>\d+):(?<column>\d+)$/u
const LINE_TARGET_PATTERN = /^(?<path>.+):(?<line>\d+)$/u
const INVALID_COLON_SUFFIX_PATTERN = /:\d*:?\d*$/u
const TOKEN_PREFIX_PATTERN = /[^\s"'`([{<,，、;；（［【｛《〈「『]+$/u
const LOOPBACK_HOST_PATTERN = /^(?:localhost|127(?:\.\d{1,3}){3})$/iu
const URL_SCHEME_PREFIX_PATTERN = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/.+$/u

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

export function parseFilePathTarget(raw: string, options: FilePathTargetParseOptions = {}): FilePathTarget | null {
  const trimmed = raw.trim().replace(LEADING_PUNCTUATION_PATTERN, '').replace(TRAILING_PUNCTUATION_PATTERN, '')
  if (!trimmed || URL_PATTERN.test(trimmed)) return null

  const target = splitLineTarget(trimmed)
  if (!target) return null

  const style = pathStyle(target.path)
  if (style !== 'relative') {
    if (!options.allowAbsolute || style === 'windowsUncAbsolute') return null
    return target.column === undefined
      ? target.line === undefined
        ? { path: target.path }
        : { path: target.path, line: target.line }
      : { path: target.path, line: target.line, column: target.column }
  }

  const relativePath = safeRelativePath(target.path)
  if (!relativePath) return null
  const segments = relativePath.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return null
  if (!relativePath.includes('/') && !relativePath.includes('.')) return null

  return target.column === undefined
    ? target.line === undefined
      ? { path: relativePath }
      : { path: relativePath, line: target.line }
    : { path: relativePath, line: target.line, column: target.column }
}

export function filePathTargetsForText(text: string, options: FilePathTargetParseOptions = {}): FilePathTargetSpan[] {
  const spans: FilePathTargetSpan[] = []
  for (const match of text.matchAll(PYTHON_FILE_LINE_PATTERN)) {
    const path = match.groups?.path
    const line = match.groups?.line
    if (!path || !line || match.index === undefined) continue
    const prefixLength = match[0].indexOf(path)
    if (prefixLength < 0) continue
    const startIndex = match.index + prefixLength
    const endIndex = match.index + match[0].length
    const target = parseFilePathTarget(`${path}:${line}`, options)
    if (!target || spanOverlaps(spans, startIndex, endIndex)) continue
    spans.push({ text: text.slice(startIndex, endIndex), target, startIndex, endIndex })
  }

  for (const match of text.matchAll(HARD_WRAPPED_PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const normalizedToken = token.replace(/\r?\n[ \t]*/gu, '')
    const target = parseFilePathTarget(normalizedToken, options)
    if (!target) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    const endIndex = startIndex + token.length
    if (startsInUrlLikeColonContext(text, startIndex, token)) continue
    if (spanOverlaps(spans, startIndex, endIndex)) continue
    spans.push({ text: token, target, startIndex, endIndex })
  }

  if (options.allowAbsolute) {
    for (const match of text.matchAll(ABSOLUTE_PATH_TOKEN_PATTERN)) {
      const token = match.groups?.token
      if (!token || match.index === undefined) continue
      const target = parseFilePathTarget(token, options)
      if (!target) continue
      const tokenOffset = match[0].indexOf(token)
      const startIndex = match.index + tokenOffset
      const endIndex = startIndex + token.length
      if (startsInUrlLikeColonContext(text, startIndex, token)) continue
      if (spanOverlaps(spans, startIndex, endIndex)) continue
      spans.push({ text: token, target, startIndex, endIndex })
    }
  }

  for (const match of text.matchAll(PATH_TOKEN_PATTERN)) {
    const token = match.groups?.token
    if (!token || match.index === undefined) continue
    const target = parseFilePathTarget(token, options)
    if (!target) continue
    const tokenOffset = match[0].indexOf(token)
    const startIndex = match.index + tokenOffset
    const endIndex = startIndex + token.length
    if (startsInUrlLikeColonContext(text, startIndex, token)) continue
    if (spanOverlaps(spans, startIndex, endIndex)) continue
    spans.push({ text: token, target, startIndex, endIndex })
  }
  return spans.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex)
}

function startsInUrlLikeColonContext(text: string, startIndex: number, token: string): boolean {
  if (text[startIndex - 1] !== ':') return false
  const prefix = TOKEN_PREFIX_PATTERN.exec(text.slice(0, startIndex - 1))?.[0] ?? ''
  if (!prefix) return false
  if (URL_SCHEME_PREFIX_PATTERN.test(prefix)) return true
  if (LOOPBACK_HOST_PATTERN.test(prefix) && /^\d+\//u.test(token)) return true
  return /[@.]/u.test(prefix)
}

function spanOverlaps(spans: FilePathTargetSpan[], startIndex: number, endIndex: number): boolean {
  return spans.some((span) => startIndex < span.endIndex && endIndex > span.startIndex)
}

export function editorTargetPath(target: EditorOpenTarget): string {
  return typeof target === 'string' ? target : target.path
}

export function editorTargetPathArgument(target: EditorOpenTarget): string {
  if (typeof target === 'string' || target.line === undefined) return editorTargetPath(target)
  return target.column === undefined ? `${target.path}:${target.line}` : `${target.path}:${target.line}:${target.column}`
}
