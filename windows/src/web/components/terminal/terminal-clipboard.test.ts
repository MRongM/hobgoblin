// @vitest-environment jsdom

import { afterEach, describe, expect, test, vi } from 'vitest'
import { writeTerminalClipboardText } from '#/web/components/terminal/terminal-clipboard.ts'

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
const originalExecCommand = Object.getOwnPropertyDescriptor(document, 'execCommand')

afterEach(() => {
  document.body.innerHTML = ''
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
  if (originalExecCommand) Object.defineProperty(document, 'execCommand', originalExecCommand)
  else Reflect.deleteProperty(document, 'execCommand')
  vi.restoreAllMocks()
})

function setClipboard(clipboard: { writeText: (text: string) => Promise<void> } | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}

function setExecCommand(execCommand: (command: string) => boolean): void {
  Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
}

describe('writeTerminalClipboardText', () => {
  test('prefers the Clipboard API and reports success', async () => {
    const writeText = vi.fn(async () => {})
    const execCommand = vi.fn(() => true)
    setClipboard({ writeText })
    setExecCommand(execCommand)

    await expect(writeTerminalClipboardText('selected text')).resolves.toBe(true)

    expect(writeText).toHaveBeenCalledWith('selected text')
    expect(execCommand).not.toHaveBeenCalled()
    expect(document.querySelector('textarea')).toBeNull()
  })

  test('falls back to a hidden read-only textarea and restores focus after API rejection', async () => {
    const button = document.createElement('button')
    document.body.appendChild(button)
    button.focus()
    const restoreFocus = vi.spyOn(button, 'focus')
    const writeText = vi.fn(async () => {
      throw new Error('insecure context')
    })
    let fallbackTextarea = document.createElement('textarea')
    const execCommand = vi.fn(() => {
      fallbackTextarea = document.querySelector<HTMLTextAreaElement>('textarea')!
      return true
    })
    setClipboard({ writeText })
    setExecCommand(execCommand)

    await expect(writeTerminalClipboardText('LAN copy')).resolves.toBe(true)

    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(fallbackTextarea).toMatchObject({ value: 'LAN copy', readOnly: true })
    expect(fallbackTextarea.style.position).toBe('fixed')
    expect(document.querySelector('textarea')).toBeNull()
    expect(restoreFocus).toHaveBeenLastCalledWith({ preventScroll: true })
  })

  test.each([
    ['returns false', () => false],
    [
      'returns false when execCommand throws',
      () => {
        throw new Error('copy blocked')
      },
    ],
  ])('%s when every clipboard path fails', async (_name, execCommand) => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    setClipboard(undefined)
    setExecCommand(execCommand)

    await expect(writeTerminalClipboardText('retry me')).resolves.toBe(false)

    expect(document.querySelector('textarea')).toBeNull()
    expect(document.activeElement).toBe(input)
  })
})
