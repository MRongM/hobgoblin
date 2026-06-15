import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

describe('install.sh', () => {
  test('defaults Electron caches from HOME and exports them to the build script', () => {
    const script = readFileSync(path.join(repoRoot, 'install.sh'), 'utf8')

    expect(script).toContain('ELECTRON_CACHE="${ELECTRON_CACHE:-$HOME/Library/Caches/electron}"')
    expect(script).toContain('electron_config_cache="${electron_config_cache:-$HOME/Library/Caches/electron}"')
    expect(script).toContain('ELECTRON_BUILDER_CACHE="${ELECTRON_BUILDER_CACHE:-$HOME/Library/Caches/electron-builder}"')
    expect(script).toContain('export ELECTRON_CACHE electron_config_cache ELECTRON_BUILDER_CACHE')
  })

  test('forwards install build flags to the build script', () => {
    const script = readFileSync(path.join(repoRoot, 'install.sh'), 'utf8')

    expect(script).toContain('--typecheck')
    expect(script).toContain('--skip-typecheck')
    expect(script).toContain('--force-install')
    expect(script).toContain('EXTRA_ARGS+=("$1")')
    expect(script).toContain('bun scripts/build.ts install ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"}')
  })
})
