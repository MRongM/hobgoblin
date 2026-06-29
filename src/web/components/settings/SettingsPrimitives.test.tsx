// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SettingsNumberInput } from '#/web/components/settings/SettingsPrimitives.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SettingsNumberInput', () => {
  test('keeps an in-progress numeric draft while focused and commits once it is in range', async () => {
    const onChange = vi.fn()
    await render(
      <SettingsNumberInput id="font-size" value={14} min={10} max={24} onChange={onChange} />,
    )
    const input = document.getElementById('font-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing number input')

    await act(async () => {
      input.focus()
      setInputValue(input, '1')
      await Promise.resolve()
    })

    expect(input.value).toBe('1')
    expect(onChange).not.toHaveBeenCalled()

    await act(async () => {
      setInputValue(input, '16')
      await Promise.resolve()
    })

    expect(input.value).toBe('16')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(16)
  })
})

async function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(element)
    await Promise.resolve()
  })
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
