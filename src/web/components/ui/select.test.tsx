// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/web/components/ui/select.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  if (!Element.prototype.scrollIntoView) {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: () => {} })
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.body.innerHTML = ''
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SelectContent searchable header focus', () => {
  test('restores header focus at most once for each input event', async () => {
    act(() => {
      root!.render(
        <Select open value="origin/feature/a">
          <SelectTrigger aria-label="Remote branch">
            <SelectValue />
          </SelectTrigger>
          <SelectContent header={<input id="remote-filter" aria-label="Search remote branches" />}>
            <SelectItem value="origin/feature/a">origin/feature/a</SelectItem>
          </SelectContent>
        </Select>,
      )
    })
    await flushFocusWork()

    const filter = document.querySelector<HTMLInputElement>('#remote-filter')
    const option = document.querySelector<HTMLElement>('[role="option"]')
    if (!filter || !option) throw new Error('Missing searchable select elements')

    act(() => {
      filter.focus()
      filter.dispatchEvent(new Event('input', { bubbles: true }))
      option.focus()
    })
    await flushFocusWork()
    expect(document.activeElement).toBe(filter)

    act(() => option.focus())
    await flushFocusWork()

    expect(document.activeElement).toBe(option)
  })
})

async function flushFocusWork() {
  await act(async () => {
    await Promise.resolve()
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  })
}
