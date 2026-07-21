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
    expect(stylesCss).toContain('calc(var(--goblin-app-font-size) - 1px)')
  })

  test('mounts both global font projections at the renderer root', () => {
    const mainSource = readText(new URL('../main.tsx', import.meta.url))

    expect(mainSource).toContain(
      "import { GlobalFontSizeProjection } from '#/web/components/GlobalFontSizeProjection.tsx'",
    )
    expect(mainSource).toContain('<GlobalFontSizeProjection />')
  })
})
