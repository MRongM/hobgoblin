// @vitest-environment jsdom

import { describe, expect, test, vi } from 'vitest'
import {
  beginTerminalMobileSelection,
  cancelTerminalMobileSelection,
  clearTerminalMobileSelection,
  extendTerminalMobileSelection,
  finishTerminalMobileSelection,
  terminalMobileSelectionText,
  type TerminalMobileSelectionTarget,
} from '#/web/components/terminal/terminal-mobile-selection.ts'

function selectionTarget(options: { mouseTrackingMode?: string; selectedText?: string } = {}) {
  const element = document.createElement('div')
  const screen = document.createElement('div')
  screen.className = 'xterm-screen'
  element.appendChild(screen)
  document.body.appendChild(element)
  screen.getBoundingClientRect = () =>
    ({ left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, x: 10, y: 20 }) as DOMRect
  const clearSelection = vi.fn()
  const target: TerminalMobileSelectionTarget = {
    element,
    modes: { mouseTrackingMode: options.mouseTrackingMode ?? 'none' },
    options: { macOptionClickForcesSelection: false },
    getSelection: vi.fn(() => options.selectedText ?? 'selected word'),
    clearSelection,
  }
  return { target, element, clearSelection }
}

describe('terminal Mobile Web selection adapter', () => {
  test('begins xterm word selection with a synthetic primary double click', () => {
    const { target, element } = selectionTarget()
    let down = new MouseEvent('mousedown')
    element.addEventListener('mousedown', (event) => {
      down = event
    })

    expect(beginTerminalMobileSelection(target, { clientX: 80, clientY: 60 }, 'Linux')).toBe(true)
    expect(down).toMatchObject({ button: 0, buttons: 1, detail: 2, clientX: 80, clientY: 60 })
    expect(down.shiftKey).toBe(false)
    expect(down.altKey).toBe(false)
  })

  test('rejects a long press outside the rendered xterm screen', () => {
    const { target, element } = selectionTarget()
    const onMouseDown = vi.fn()
    element.addEventListener('mousedown', onMouseDown)

    expect(beginTerminalMobileSelection(target, { clientX: 220, clientY: 60 }, 'Linux')).toBe(false)
    expect(onMouseDown).not.toHaveBeenCalled()
  })

  test('extends and finishes through xterm document mouse listeners', () => {
    const { target } = selectionTarget()
    const moves: MouseEvent[] = []
    const ups: MouseEvent[] = []
    document.addEventListener('mousemove', (event) => moves.push(event), { once: true })
    document.addEventListener('mouseup', (event) => ups.push(event), { once: true })

    extendTerminalMobileSelection(target, { clientX: 140, clientY: 75 })
    finishTerminalMobileSelection(target, { clientX: 150, clientY: 80 })

    expect(moves[0]).toMatchObject({ buttons: 1, clientX: 140, clientY: 75 })
    expect(ups[0]).toMatchObject({ button: 0, buttons: 0, clientX: 150, clientY: 80 })
  })

  test('forces local selection only while terminal mouse tracking is active', () => {
    const linux = selectionTarget({ mouseTrackingMode: 'vt200' })
    let linuxDown = new MouseEvent('mousedown')
    linux.element.addEventListener('mousedown', (event) => {
      linuxDown = event
    })

    beginTerminalMobileSelection(linux.target, { clientX: 80, clientY: 60 }, 'Linux')
    expect(linuxDown.shiftKey).toBe(true)

    const mac = selectionTarget({ mouseTrackingMode: 'any' })
    let optionEnabledDuringDispatch = false
    let macDown = new MouseEvent('mousedown')
    mac.element.addEventListener('mousedown', (event) => {
      macDown = event
      optionEnabledDuringDispatch = mac.target.options.macOptionClickForcesSelection === true
    })

    beginTerminalMobileSelection(mac.target, { clientX: 80, clientY: 60 }, 'iPhone')

    expect(macDown.altKey).toBe(true)
    expect(macDown.shiftKey).toBe(false)
    expect(optionEnabledDuringDispatch).toBe(true)
    expect(mac.target.options.macOptionClickForcesSelection).toBe(false)
  })

  test('reads, clears, and cancels selection without terminal input', () => {
    const { target, clearSelection } = selectionTarget({ selectedText: 'copy me' })
    const mouseUp = vi.fn()
    document.addEventListener('mouseup', mouseUp, { once: true })

    expect(terminalMobileSelectionText(target)).toBe('copy me')
    clearTerminalMobileSelection(target)
    cancelTerminalMobileSelection(target, { clientX: 80, clientY: 60 })

    expect(clearSelection).toHaveBeenCalledTimes(2)
    expect(mouseUp).toHaveBeenCalledTimes(1)
  })
})
