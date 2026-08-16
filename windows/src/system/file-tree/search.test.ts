import { describe, expect, test, vi } from 'vitest'
import { searchLocalFileTree } from '#/system/file-tree/search.ts'

const git = vi.fn()

vi.mock('#/system/git/helper.ts', () => ({
  git: (...args: unknown[]) => git(...args),
}))

describe('searchLocalFileTree', () => {
  test('returns ranked file and derived directory matches from git ls-files', async () => {
    git.mockResolvedValueOnce(['src/components/Button.tsx', 'src/components/Icon.tsx', 'README.md'].join('\0'))

    const result = await searchLocalFileTree('/repo', 'button', { limit: 20 })

    expect(result).toEqual({
      ok: true,
      matches: [{ relativePath: 'src/components/Button.tsx', kind: 'file' }],
      truncated: false,
      limit: 20,
    })
    expect(git).toHaveBeenCalledWith('/repo', ['ls-files', '-co', '--exclude-standard', '-z'], { signal: undefined })
  })

  test('derives directory matches from candidate prefixes', async () => {
    git.mockResolvedValueOnce(['src/components/Button.tsx', 'src/components/Icon.tsx'].join('\0'))

    const result = await searchLocalFileTree('/repo', 'components', { limit: 20 })

    expect(result).toEqual({
      ok: true,
      matches: [
        { relativePath: 'src/components', kind: 'directory' },
        { relativePath: 'src/components/Button.tsx', kind: 'file' },
        { relativePath: 'src/components/Icon.tsx', kind: 'file' },
      ],
      truncated: false,
      limit: 20,
    })
  })

  test('skips heavy generated directories and reports truncation', async () => {
    git.mockResolvedValueOnce(
      ['node_modules/pkg/Button.js', 'src/Button.tsx', 'src/ButtonGroup.tsx', 'dist/Button.js'].join('\0'),
    )

    const result = await searchLocalFileTree('/repo', 'button', { limit: 1 })

    expect(result).toEqual({
      ok: true,
      matches: [{ relativePath: 'src/Button.tsx', kind: 'file' }],
      truncated: true,
      limit: 1,
    })
  })

  test('rejects invalid input and maps git failures', async () => {
    await expect(searchLocalFileTree('', 'button')).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })
    await expect(searchLocalFileTree('/repo', '   ')).resolves.toEqual({ ok: false, message: 'error.invalid-arguments' })

    git.mockRejectedValueOnce(new Error('fatal: not a git repository'))
    await expect(searchLocalFileTree('/repo', 'button')).resolves.toEqual({
      ok: false,
      message: 'fatal: not a git repository',
    })
  })
})
