import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const WEB_ROOT = new URL('../', import.meta.url)

const ALLOWED_PATH_PATTERNS = [
  /\/theme\/themes\/[^/]+\.css$/,
  /\.test\.[cm]?[tj]sx?$/,
  /\/terminal-theme-test-utils\.ts$/,
  /\/brand-assets\.test\.ts$/,
]

const FORBIDDEN_HEX = /#[0-9a-fA-F]{3,8}\b/
const FORBIDDEN_TAILWIND_PALETTE =
  /\b(?:bg|text|border|ring|decoration|from|via|to)-(?:white|black|zinc|slate|neutral|stone|gray|red|blue|green|yellow|orange|purple|pink|rose|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia)-\d{2,3}\b/

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const file = path.join(dir, entry)
    const stat = statSync(file)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      files.push(...walk(file))
    } else if (/\.(ts|tsx|css)$/.test(file)) {
      files.push(file)
    }
  }
  return files
}

function relative(file: string): string {
  return file.replace(process.cwd(), '').replaceAll(path.sep, '/')
}

function isAllowed(file: string): boolean {
  const normalized = relative(file)
  return ALLOWED_PATH_PATTERNS.some((pattern) => pattern.test(normalized))
}

describe('web theme color discipline', () => {
  test('does not add hard-coded colors in component source', () => {
    const offenders: string[] = []
    for (const file of walk(WEB_ROOT.pathname)) {
      if (isAllowed(file)) continue
      const text = readFileSync(file, 'utf8')
      if (FORBIDDEN_HEX.test(text) || FORBIDDEN_TAILWIND_PALETTE.test(text)) {
        offenders.push(relative(file))
      }
    }

    expect(offenders).toEqual([])
  })
})
