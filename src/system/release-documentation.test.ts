import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../..')

function readText(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('release documentation', () => {
  const readmes = ['README.md', 'README.zh-CN.md', 'README.ja.md', 'README.ko.md']

  test.each(readmes)('%s documents the complete release surface', (relativePath) => {
    const content = readText(relativePath)

    expect(content).toContain('Branch workspace')
    expect(content).toContain('Android')
    expect(content).toContain('tmux')
    expect(content).toContain('Windows x64 / ARM64')
    expect(content).toContain('linux-source.tar.gz')
    expect(content).toContain('scripts/serve-systemd.sh')
  })

  test('Pages provides workspace, Android, tmux, and Linux copy in every locale', () => {
    const page = readText('docs/index.html')

    expect((page.match(/install_android_title:/g) ?? []).length).toBe(4)
    expect((page.match(/install_linux_title:/g) ?? []).length).toBe(4)
    expect((page.match(/Branch workspace/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((page.match(/tmux/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((page.match(/Windows x64 \/ ARM64/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(page).toContain('Hobgoblin-&lt;version&gt;-linux-source.tar.gz')
  })

  test('Pages highlights the v2.3.1 release', () => {
    const page = readText('docs/index.html')

    expect(page).toContain('v2.3.1')
    expect(page).toContain('searchable branch merges')
    expect(page).toContain('concurrent batch Git actions')
    expect(page).toContain('immediate in-app feedback')
    expect((page.match(/WSL/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(page).toContain('hob .')
    expect(page).toContain('Cmd+Option+Up/Down')
    expect(page).toContain('Ctrl+Alt+Up/Down')
  })

  test('v2.3.1 release identity and English notes cover every published asset', () => {
    expect(JSON.parse(readText('package.json'))).toMatchObject({ version: '2.3.1' })
    expect(JSON.parse(readText('windows/package.json'))).toMatchObject({ version: '2.3.1' })
    expect(readText('android/app/build.gradle.kts')).toContain('versionCode = 12')
    expect(readText('android/app/build.gradle.kts')).toContain('versionName = "2.3.1"')

    const relativePath = 'docs/releases/v2.3.1.md'
    expect(existsSync(path.join(repoRoot, relativePath))).toBe(true)
    if (!existsSync(path.join(repoRoot, relativePath))) return

    const notes = readText(relativePath)
    for (const asset of [
      'Hobgoblin-2.3.1-arm64.dmg',
      'Hobgoblin-2.3.1-x64.dmg',
      'Hobgoblin-2.3.1-arm64.exe',
      'Hobgoblin-2.3.1-x64.exe',
      'Hobgoblin-2.3.1-android.apk',
      'Hobgoblin-2.3.1-linux-source.tar.gz',
    ]) {
      expect(notes).toContain(asset)
    }
    expect(notes).toContain('compare/v2.3.0...v2.3.1')
  })

  test('assigns official Windows release artifacts to the primary application', () => {
    const context = readText('CONTEXT.md')
    const releaseNotes = readText('docs/releases/v2.3.1.md')
    const independentReadme = readText('windows/README.md')

    expect(context).toContain('**Official Windows release artifact**:')
    expect(context).toContain('built from the primary application Windows version')
    expect(releaseNotes).toContain('built from the primary application')
    expect(releaseNotes).not.toContain('matching behavior in the independent Windows version')
    expect(independentReadme).toContain('not the source of official GitHub Release Windows installers')
  })
})
