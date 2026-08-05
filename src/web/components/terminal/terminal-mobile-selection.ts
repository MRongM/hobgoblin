import { isMacNavigatorPlatform } from '#/web/components/terminal/terminal-keyboard.ts'
import type { TerminalMobileSelectionPoint } from '#/web/components/terminal/types.ts'

export interface TerminalMobileSelectionTarget {
  element?: HTMLElement | null
  readonly modes: { readonly mouseTrackingMode: string }
  options: { macOptionClickForcesSelection?: boolean }
  getSelection: () => string
  clearSelection: () => void
}

export function beginTerminalMobileSelection(
  term: TerminalMobileSelectionTarget | null,
  point: TerminalMobileSelectionPoint,
  platform = navigatorPlatform(),
): boolean {
  const element = term?.element
  const screen = element?.querySelector<HTMLElement>('.xterm-screen')
  if (!term || !element || !screen || !containsClientPoint(screen.getBoundingClientRect(), point)) return false

  const mouseTrackingActive = term.modes.mouseTrackingMode !== 'none'
  const isMac = isMacNavigatorPlatform(platform)
  const previousMacOptionClickForcesSelection = term.options.macOptionClickForcesSelection ?? false
  if (mouseTrackingActive && isMac) term.options.macOptionClickForcesSelection = true
  try {
    element.dispatchEvent(
      terminalSelectionMouseEvent(element.ownerDocument, 'mousedown', point, {
        button: 0,
        buttons: 1,
        detail: 2,
        altKey: mouseTrackingActive && isMac,
        shiftKey: mouseTrackingActive && !isMac,
      }),
    )
  } finally {
    if (mouseTrackingActive && isMac) {
      term.options.macOptionClickForcesSelection = previousMacOptionClickForcesSelection
    }
  }
  return true
}

export function extendTerminalMobileSelection(
  term: TerminalMobileSelectionTarget | null,
  point: TerminalMobileSelectionPoint,
): void {
  const document = term?.element?.ownerDocument
  if (!document) return
  document.dispatchEvent(terminalSelectionMouseEvent(document, 'mousemove', point, { button: 0, buttons: 1 }))
}

export function finishTerminalMobileSelection(
  term: TerminalMobileSelectionTarget | null,
  point: TerminalMobileSelectionPoint,
): void {
  const document = term?.element?.ownerDocument
  if (!document) return
  document.dispatchEvent(terminalSelectionMouseEvent(document, 'mouseup', point, { button: 0, buttons: 0 }))
}

export function cancelTerminalMobileSelection(
  term: TerminalMobileSelectionTarget | null,
  point: TerminalMobileSelectionPoint,
): void {
  finishTerminalMobileSelection(term, point)
  clearTerminalMobileSelection(term)
}

export function terminalMobileSelectionText(term: TerminalMobileSelectionTarget | null): string {
  return term?.getSelection() ?? ''
}

export function clearTerminalMobileSelection(term: TerminalMobileSelectionTarget | null): void {
  term?.clearSelection()
}

function terminalSelectionMouseEvent(
  document: Document,
  type: 'mousedown' | 'mousemove' | 'mouseup',
  point: TerminalMobileSelectionPoint,
  input: Pick<MouseEventInit, 'altKey' | 'button' | 'buttons' | 'detail' | 'shiftKey'>,
): MouseEvent {
  const MouseEventConstructor = document.defaultView?.MouseEvent ?? MouseEvent
  return new MouseEventConstructor(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.clientX,
    clientY: point.clientY,
    ...input,
  })
}

function containsClientPoint(rect: DOMRect, point: TerminalMobileSelectionPoint): boolean {
  return (
    point.clientX >= rect.left && point.clientX < rect.right && point.clientY >= rect.top && point.clientY < rect.bottom
  )
}

function navigatorPlatform(): string {
  try {
    return globalThis.navigator?.platform ?? ''
  } catch {
    return ''
  }
}
