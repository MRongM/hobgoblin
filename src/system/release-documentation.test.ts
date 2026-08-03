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
    expect(content).toContain('linux-source.tar.gz')
    expect(content).toContain('scripts/serve-systemd.sh')
  })

  test('Pages provides workspace, Android, tmux, and Linux copy in every locale', () => {
    const page = readText('docs/index.html')

    expect((page.match(/install_android_title:/g) ?? []).length).toBe(4)
    expect((page.match(/install_linux_title:/g) ?? []).length).toBe(4)
    expect((page.match(/Branch workspace/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((page.match(/tmux/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(page).toContain('Hobgoblin-&lt;version&gt;-linux-source.tar.gz')
  })

  test('v2.2.2 English release notes enumerate every published asset', () => {
    const relativePath = 'docs/releases/v2.2.2.md'
    expect(existsSync(path.join(repoRoot, relativePath))).toBe(true)
    if (!existsSync(path.join(repoRoot, relativePath))) return

    const notes = readText(relativePath)
    for (const asset of [
      'Hobgoblin-2.2.2-arm64.dmg',
      'Hobgoblin-2.2.2-x64.dmg',
      'Hobgoblin-2.2.2-x64.exe',
      'Hobgoblin-2.2.2-android.apk',
      'Hobgoblin-2.2.2-linux-source.tar.gz',
    ]) {
      expect(notes).toContain(asset)
    }
  })
})
