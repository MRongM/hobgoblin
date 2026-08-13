import { describe, expect, test } from 'vitest'
import {
  createFastWindowsBuildPlan,
  NPM_MIRROR_BINARIES,
  NPM_MIRROR_ELECTRON,
  parseFastWindowsBuildArgs,
} from './build-windows-fast.ts'

describe('parseFastWindowsBuildArgs', () => {
  test('defaults to the local 7890 proxy and x64 NSIS output', () => {
    expect(parseFastWindowsBuildArgs([])).toEqual({
      arch: 'x64',
      full: false,
      output: 'release-win-fast',
      proxy: 'http://127.0.0.1:7890',
    })
  })

  test('accepts explicit proxy, architecture, output, and full build options', () => {
    expect(
      parseFastWindowsBuildArgs([
        '--proxy=http://127.0.0.1:9000',
        '--arm64',
        '--output=release-custom',
        '--full',
      ]),
    ).toEqual({
      arch: 'arm64',
      full: true,
      output: 'release-custom',
      proxy: 'http://127.0.0.1:9000',
    })
  })

  test('rejects output directories that could delete source files', () => {
    expect(() => parseFastWindowsBuildArgs(['--output=src'])).toThrow(
      '--output must be a direct child directory named release-*',
    )
    expect(() => parseFastWindowsBuildArgs(['--output=release-custom/nested'])).toThrow(
      '--output must be a direct child directory named release-*',
    )
  })
})

describe('createFastWindowsBuildPlan', () => {
  test('reuses an exact local Electron distribution and skips native rebuilds', () => {
    const plan = createFastWindowsBuildPlan({
      electronVersion: '42.3.3',
      localElectronDist: 'C:\\repo\\node_modules\\electron\\dist',
      localElectronVersion: '42.3.3',
      options: parseFastWindowsBuildArgs([]),
      repoRoot: 'C:\\repo',
    })

    expect(plan.environment).toMatchObject({
      CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      ELECTRON_BUILDER_BINARIES_MIRROR: NPM_MIRROR_BINARIES,
      ELECTRON_GET_USE_PROXY: 'true',
      ELECTRON_MIRROR: NPM_MIRROR_ELECTRON,
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      HTTP_PROXY: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
      http_proxy: 'http://127.0.0.1:7890',
      npm_config_https_proxy: 'http://127.0.0.1:7890',
      npm_config_proxy: 'http://127.0.0.1:7890',
    })
    expect(plan.builderArgs).toContain('--config.npmRebuild=false')
    expect(plan.builderArgs).toContain('--config.electronDist=C:\\repo\\node_modules\\electron\\dist')
    expect(plan.runTypecheck).toBe(false)
  })

  test('falls back to mirrored downloads when the local Electron version differs', () => {
    const plan = createFastWindowsBuildPlan({
      electronVersion: '42.3.3',
      localElectronDist: 'C:\\repo\\node_modules\\electron\\dist',
      localElectronVersion: '42.2.0',
      options: parseFastWindowsBuildArgs(['--full']),
      repoRoot: 'C:\\repo',
    })

    expect(plan.builderArgs.some((arg) => arg.startsWith('--config.electronDist='))).toBe(false)
    expect(plan.builderArgs).not.toContain('--config.npmRebuild=false')
    expect(plan.runTypecheck).toBe(true)
  })
})
