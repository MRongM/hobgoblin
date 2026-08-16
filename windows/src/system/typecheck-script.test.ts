import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('typecheck script', () => {
  test('runs TypeScript through the package entry instead of a platform-specific bin shim', () => {
    const typecheckScript = readText('scripts/typecheck.ts')

    expect(typecheckScript).toContain("path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc')")
    expect(typecheckScript).not.toContain('tsc.cmd')
    expect(typecheckScript).not.toContain("node_modules', '.bin'")
  })
})
