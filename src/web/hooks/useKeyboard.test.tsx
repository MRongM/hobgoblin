// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { useKeyboard } from '#/web/hooks/useKeyboard.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
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

describe('useKeyboard', () => {
  test('does not reserve the removed navigation and app shortcuts', async () => {
    await renderHookHost()

    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    const help = new KeyboardEvent('keydown', {
      key: '?',
      code: 'Slash',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      window.dispatchEvent(escape)
      window.dispatchEvent(help)
      await Promise.resolve()
    })

    expect(escape.defaultPrevented).toBe(false)
    expect(help.defaultPrevented).toBe(false)
  })
})

async function renderHookHost(
  overrides: Partial<{
    currentRepoId: string | null
    isWorkspaceShortcutSuppressed: () => boolean
  }> = {},
) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(<HookHost {...overrides} />)
    await Promise.resolve()
  })
}

function HookHost(
  overrides: Partial<{
    currentRepoId: string | null
    isWorkspaceShortcutSuppressed: () => boolean
  }>,
) {
  useKeyboard({
    currentRepoId: overrides.currentRepoId ?? null,
    isWorkspaceShortcutSuppressed: overrides.isWorkspaceShortcutSuppressed ?? (() => false),
  })
  return null
}
