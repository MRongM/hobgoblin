import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const readText = (url: URL) => readFileSync(url, 'utf8')

describe('font contract', () => {
  test('uses Mono as the default app font stacks', () => {
    const contractCss = readText(new URL('./contract.css', import.meta.url))

    expect(contractCss).toContain('--font-sans: ui-monospace')
    expect(contractCss).toContain('--font-mono: ui-monospace')
  })

  test('registers Maple Mono NF CN from bundled Maple Font assets', () => {
    const stylesCss = readText(new URL('../styles.css', import.meta.url))

    expect(stylesCss.match(/font-family: 'Maple Mono NF CN';/g) ?? []).toHaveLength(4)
    expect(stylesCss).toContain('MapleMono-NF-CN-Regular.woff2')
    expect(stylesCss).toContain('MapleMono-NF-CN-Italic.woff2')
    expect(stylesCss).toContain('MapleMono-NF-CN-Bold.woff2')
    expect(stylesCss).toContain('MapleMono-NF-CN-BoldItalic.woff2')
  })

  test('defines stable application and file-area font size defaults before hydration', () => {
    const stylesCss = readText(new URL('../styles.css', import.meta.url))

    expect(stylesCss).toContain('--goblin-app-font-size: 14px')
    expect(stylesCss).toContain('--goblin-file-tree-font-size: var(--goblin-app-font-size)')
    expect(stylesCss).toContain(
      '--goblin-project-titlebar-font-size: max(10px, calc(var(--goblin-app-font-size) - 2px))',
    )
    expect(stylesCss).toContain('--goblin-file-tree-topbar-font-size: var(--goblin-project-titlebar-font-size)')
  })

  test('uses the shared project titlebar font size across project navigation headings', () => {
    const titlebarClass = 'text-[length:var(--goblin-project-titlebar-font-size)]'
    const sources = [
      [new URL('../components/repo-workspace/SidebarProjectHeader.tsx', import.meta.url), 1],
      [new URL('../components/repo-workspace/WorkspaceRepositoryRail.tsx', import.meta.url), 1],
      [new URL('../components/repo-workspace/WorkspaceRepositoryListPane.tsx', import.meta.url), 1],
      [new URL('../components/repo-workspace/RepoExplorerPane.tsx', import.meta.url), 1],
    ] as const

    for (const [url, expectedCount] of sources) {
      const source = readText(url)
      expect(source.split(titlebarClass)).toHaveLength(expectedCount + 1)
    }
  })

  test('uses icon-sm for project titlebar actions', () => {
    const sources = [
      [new URL('../components/repo-workspace/WorkspaceRepositoryRail.tsx', import.meta.url), 6],
      [new URL('../components/repo-workspace/RepoExplorerPane.tsx', import.meta.url), 3],
    ] as const

    for (const [url, expectedCount] of sources) {
      const source = readText(url)
      expect(source).not.toContain('size="icon-xs"')
      expect(source.split('size="icon-sm"')).toHaveLength(expectedCount + 1)
    }
  })

  test('mounts both global font projections at the renderer root', () => {
    const mainSource = readText(new URL('../main.tsx', import.meta.url))

    expect(mainSource).toContain(
      "import { GlobalFontSizeProjection } from '#/web/components/GlobalFontSizeProjection.tsx'",
    )
    expect(mainSource).toContain('<GlobalFontSizeProjection />')
  })
})
