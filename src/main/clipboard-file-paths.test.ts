import { beforeEach, describe, expect, test, vi } from 'vitest'
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'

const clipboard = vi.hoisted(() => ({
  read: vi.fn(),
  readText: vi.fn(),
  readBookmark: vi.fn(),
}))

vi.mock('electron', () => ({ clipboard }))

describe('readClipboardFilePathsFromSystem', () => {
  beforeEach(() => {
    clipboard.read.mockReset()
    clipboard.readText.mockReset()
    clipboard.readBookmark.mockReset()
    clipboard.read.mockReturnValue('')
    clipboard.readText.mockReturnValue('')
    clipboard.readBookmark.mockReturnValue({ title: '', url: '' })
  })

  test('reads file URLs from clipboard formats and removes duplicates', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list'
        ? 'file:///Users/test/report.pdf\n# comment\nfile:///Users/test/report.pdf\nfile:///Users/test/LICENSE'
        : '',
    )

    expect(readClipboardFilePathsFromSystem()).toEqual(['/Users/test/report.pdf', '/Users/test/LICENSE'])
  })

  test('reads a file bookmark URL when URI list formats are empty', () => {
    clipboard.readBookmark.mockReturnValue({ title: 'report.pdf', url: 'file:///Users/test/report.pdf' })

    expect(readClipboardFilePathsFromSystem()).toEqual(['/Users/test/report.pdf'])
  })

  test('converts Windows file URLs without a leading slash before the drive', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list' ? 'file:///C:/Users/test/report.pdf' : '',
    )

    expect(readClipboardFilePathsFromSystem()).toEqual(['C:/Users/test/report.pdf'])
  })

  test('ignores non-file clipboard values', () => {
    clipboard.read.mockImplementation((format: string) =>
      format === 'text/uri-list' ? 'https://example.com/report.pdf' : '',
    )
    clipboard.readText.mockReturnValue('/plain/text/path')

    expect(readClipboardFilePathsFromSystem()).toEqual([])
  })
})
