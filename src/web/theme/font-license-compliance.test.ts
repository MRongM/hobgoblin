import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '../../..')

function repoPath(relativePath: string): string {
  return path.join(repoRoot, relativePath)
}

function readRepoText(relativePath: string): string {
  return readFileSync(repoPath(relativePath), 'utf8')
}

function gitBlobHash(relativePath: string): string {
  const content = readFileSync(repoPath(relativePath))
  return createHash('sha1')
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest('hex')
}

const bundledFonts = [
  'src/web/assets/fonts/MapleMono-NF-CN-Regular.woff2',
  'src/web/assets/fonts/MapleMono-NF-CN-Italic.woff2',
  'src/web/assets/fonts/MapleMono-NF-CN-Bold.woff2',
  'src/web/assets/fonts/MapleMono-NF-CN-BoldItalic.woff2',
] as const

const licenseFiles = [
  'LICENSES/Maple-Mono-OFL-1.1.txt',
  'LICENSES/Nerd-Fonts-LICENSE.txt',
  'LICENSES/Resource-Han-Rounded-LICENSE.md',
  'THIRD_PARTY_NOTICES.md',
] as const

describe('bundled font license compliance', () => {
  test('keeps every declared Maple Mono NF CN font artifact', () => {
    for (const font of bundledFonts) {
      expect(existsSync(repoPath(font)), font).toBe(true)
    }
  })

  test('keeps every required license document', () => {
    for (const licenseFile of licenseFiles) {
      expect(existsSync(repoPath(licenseFile)), licenseFile).toBe(true)
    }
  })

  test('keeps the complete upstream license snapshots', () => {
    const maple = readRepoText('LICENSES/Maple-Mono-OFL-1.1.txt')
    const nerdFonts = readRepoText('LICENSES/Nerd-Fonts-LICENSE.txt')
    const resourceHanRounded = readRepoText('LICENSES/Resource-Han-Rounded-LICENSE.md')

    expect(maple).toContain('Copyright 2022 The Maple Mono Project Authors')
    expect(maple).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(nerdFonts).toContain('# Nerd Fonts Licensing')
    expect(nerdFonts).toContain('Copyright (c) 2014 Ryan L McIntyre')
    expect(nerdFonts).toContain('SIL OPEN FONT LICENSE Version 1.1')
    expect(resourceHanRounded).toContain('# License for Resource Han Rounded')
    expect(resourceHanRounded).toContain('Copyright © 2018—2022 Cyano Hao.')
    expect(resourceHanRounded).toContain("Reserved Font Name 'Source'")
    expect(resourceHanRounded).toContain('SIL OPEN FONT LICENSE Version 1.1')

    expect(gitBlobHash('LICENSES/Maple-Mono-OFL-1.1.txt')).toBe(
      '65ea5300f7aeafc4bd5fd9e818478bf3b1147d6a',
    )
    expect(gitBlobHash('LICENSES/Nerd-Fonts-LICENSE.txt')).toBe(
      'd163912b383cac468b3052e60ad4998e80046cc7',
    )
    expect(gitBlobHash('LICENSES/Resource-Han-Rounded-LICENSE.md')).toBe(
      '45581e96e36de6e3318d4af0813f4a412b4f18de',
    )
  })

  test('preserves upstream license bytes without whitespace rewriting', () => {
    expect(existsSync(repoPath('.gitattributes')), '.gitattributes').toBe(true)

    const attributes = readRepoText('.gitattributes')
    expect(attributes).toContain('LICENSES/** -text -whitespace')
  })

  test('maps every bundled font to pinned upstream license sources', () => {
    const notices = readRepoText('THIRD_PARTY_NOTICES.md')

    for (const font of bundledFonts) {
      expect(notices, font).toContain(path.basename(font))
    }

    for (const requiredText of [
      'Maple Mono',
      'Nerd Fonts',
      'Resource Han Rounded',
      'LICENSES/Maple-Mono-OFL-1.1.txt',
      'LICENSES/Nerd-Fonts-LICENSE.txt',
      'LICENSES/Resource-Han-Rounded-LICENSE.md',
      '3c8c9234de17999f38ca40119b2fe3478eba108d',
      '4f133076f3c1ec224745850bdf433d4368bca07e',
      'be90fee7a031c1297da5a260ccfb91756088d51c',
      'https://github.com/subframe7536/maple-font',
      'https://github.com/ryanoasis/nerd-fonts',
      'https://github.com/CyanoHao/Resource-Han-Rounded',
      'not sold separately',
      'does not imply endorsement',
    ]) {
      expect(notices, requiredText).toContain(requiredText)
    }
  })
})
