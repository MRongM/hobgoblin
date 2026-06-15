import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

describe('install.ts', () => {
  test('forwards --clean to the build script as the only passthrough', () => {
    const script = readFileSync(path.join(repoRoot, 'install.ts'), 'utf8')

    // The other install flags in build.ts (--typecheck, --skip-typecheck,
    // --force-install) are translated into env vars inside this script;
    // only --clean is forwarded as a CLI flag.
    expect(script).toContain("if (values.clean) passthrough.push('--clean')")
    expect(script).toContain("spawnSync('bun', ['scripts/build.ts', 'install', ...passthrough]")
  })

  test('--full translates to SKIP_TYPECHECK=0 and SKIP_REBUILD=0 env vars', () => {
    const script = readFileSync(path.join(repoRoot, 'install.ts'), 'utf8')

    expect(script).toContain("if (values.full) {")
    expect(script).toContain("env.SKIP_TYPECHECK = '0'")
    expect(script).toContain("env.SKIP_REBUILD = '0'")
  })

  test('--npmmirror sets both ELECTRON_MIRROR and ELECTRON_BUILDER_BINARIES_MIRROR env vars', () => {
    const script = readFileSync(path.join(repoRoot, 'install.ts'), 'utf8')

    expect(script).toContain("NPM_MIRROR_ELECTRON = 'https://npmmirror.com/mirrors/electron/'")
    expect(script).toContain("NPM_MIRROR_BINARIES = 'https://npmmirror.com/mirrors/electron-builder-binaries/'")
    expect(script).toContain('env.ELECTRON_MIRROR = NPM_MIRROR_ELECTRON')
    expect(script).toContain('env.ELECTRON_BUILDER_BINARIES_MIRROR = NPM_MIRROR_BINARIES')
  })
})
