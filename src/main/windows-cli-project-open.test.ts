import { describe, expect, test } from 'vitest'
import { windowsCliProjectOpenPathFromArgv } from '#/main/windows-cli-project-open.ts'

describe('Windows hob CLI project-open arguments', () => {
  test('extracts one drive path after the explicit marker', () => {
    expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', 'C:\\work tree'], 'win32')).toBe(
      'C:\\work tree',
    )
  })

  test('extracts one UNC path from development-shaped arguments', () => {
    expect(windowsCliProjectOpenPathFromArgv(['electron.exe', '.', '--hob-open', '\\\\server\\share'], 'win32')).toBe(
      '\\\\server\\share',
    )
  })

  test('ignores arguments without the marker', () => {
    expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe'], 'win32')).toBeNull()
  })

  test('rejects a marker without a value', () => {
    expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open'], 'win32')).toBeNull()
  })

  test('rejects another long option as the marker value', () => {
    expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', '--inspect'], 'win32')).toBeNull()
  })

  test('rejects duplicate markers', () => {
    expect(
      windowsCliProjectOpenPathFromArgv(['Hobgoblin.exe', '--hob-open', 'C:\\a', '--hob-open', 'C:\\b'], 'win32'),
    ).toBeNull()
  })

  test('ignores the marker outside Windows', () => {
    expect(windowsCliProjectOpenPathFromArgv(['Hobgoblin', '--hob-open', '/tmp/repo'], 'darwin')).toBeNull()
  })
})
