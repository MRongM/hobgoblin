// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { BranchSearchInput } from '#/web/components/repo-toolbar/BranchSearchInput.tsx'

let container: HTMLDivElement
let root: Root
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('BranchSearchInput', () => {
  test('renders search as an input without a separate search button', () => {
    act(() => {
      root.render(<BranchSearchInput value="" onChange={vi.fn()} />)
    })

    expect(container.querySelector('input[aria-label="branches.search-label"]')).not.toBeNull()
    expect(container.querySelector('button[aria-label="branches.search-label"]')).toBeNull()
  })
})
