import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import electronBuilderConfig from '../../electron-builder.ts'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readText(relativePath)) as T
}

describe('desktop identity', () => {
  test('uses the Hobgoblin package and Electron identity', () => {
    const pkg = readJson<{ name: string; productName: string; description: string }>('package.json')

    expect(pkg.name).toBe('hobgoblin')
    expect(pkg.productName).toBe('Hobgoblin')
    expect(pkg.description).toBe('Hobgoblin - Git Branch List, desktop edition')
    expect(electronBuilderConfig.appId).toBe('hobgoblin.app')
    expect(electronBuilderConfig.productName).toBe('Hobgoblin')
  })

  test('keeps desktop install and release scripts pointed at Hobgoblin only', () => {
    expect(readText('install.sh')).toContain('APP_NAME=Hobgoblin')

    const buildScript = readText('scripts/build.ts')
    expect(buildScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(buildScript).toContain("const APP_ID = 'hobgoblin.app'")
    expect(buildScript).toContain('Hobgoblin.app')
    expect(buildScript).not.toContain('Goblin.app')

    const closeScript = readText('scripts/close-app.ts')
    expect(closeScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(closeScript).toContain('/${APP_NAME}.app/Contents/MacOS/')
    expect(closeScript).not.toContain('Goblin.app')

    const publishScript = readText('scripts/publish.ts')
    expect(publishScript).toContain("const APP_NAME = 'Hobgoblin'")
    expect(publishScript).toContain('/Applications/${APP_NAME}.app')
  })

  test('keeps visible desktop entry points branded as Hobgoblin', () => {
    expect(readText('src/main/main.ts')).toContain("dialog.showErrorBox('Hobgoblin failed to start'")
    expect(readText('src/web/index.html')).toContain('<title>Hobgoblin</title>')
    expect(readText('src/web/components/settings/pages/AboutSettings.tsx')).toContain('alt="Hobgoblin"')
    expect(readText('src/web/renderer-bridge.ts')).toContain('Hobgoblin bridge is unavailable')
    expect(readText('src/web/renderer-terminal-bridge.ts')).toContain(
      "showBrowserNotification('Hobgoblin', 'Test notification')",
    )
  })

  test('updates lockfile workspace identity without changing dependency versions', () => {
    expect(readText('bun.lock')).toContain('"workspaces": {\n    "": {\n      "name": "hobgoblin",')
  })
})
