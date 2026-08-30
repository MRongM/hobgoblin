export async function readTerminalClipboardText(): Promise<string | null> {
  const clipboard = globalThis.navigator?.clipboard
  if (typeof clipboard?.readText !== 'function') return null
  try {
    return await clipboard.readText()
  } catch {
    return null
  }
}

export async function writeTerminalClipboardText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard
  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // Plain HTTP and policy-restricted contexts may expose the API but reject writes.
    }
  }
  return copyTerminalTextViaTextarea(text)
}

function copyTerminalTextViaTextarea(text: string): boolean {
  const document = globalThis.document
  if (!document?.body) return false

  const previousActive = document.activeElement instanceof HTMLElement ? document.activeElement : null
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.readOnly = true
  textarea.setAttribute('aria-hidden', 'true')
  Object.assign(textarea.style, {
    position: 'fixed',
    top: '0',
    left: '-9999px',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  })
  document.body.appendChild(textarea)

  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    return document.execCommand?.('copy') === true
  } catch {
    return false
  } finally {
    textarea.remove()
    try {
      previousActive?.focus({ preventScroll: true })
    } catch {
      // Clipboard completion must not fail because the previous target disappeared.
    }
  }
}
