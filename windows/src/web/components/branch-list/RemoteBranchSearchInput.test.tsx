// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { RemoteBranchSearchInput } from '#/web/components/branch-list/RemoteBranchSearchInput.tsx'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  vi.restoreAllMocks()
  root = null
  container = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('RemoteBranchSearchInput', () => {
  test('does not refocus for an unrelated parent rerender', async () => {
    const focus = vi.spyOn(HTMLInputElement.prototype, 'focus')
    const input = (value: string): ReactNode => (
      <RemoteBranchSearchInput
        id="remote-branch-search"
        value={value}
        placeholder="Search remote branches"
        ariaLabel="Search remote branches"
        onChange={vi.fn()}
      />
    )

    render(input('feature'))
    await flush()
    focus.mockClear()

    render(input('feature'))
    await flush()

    expect(focus).not.toHaveBeenCalled()
  })
})

function render(element: ReactNode) {
  act(() => root!.render(element))
}

async function flush() {
  await act(async () => Promise.resolve())
}
