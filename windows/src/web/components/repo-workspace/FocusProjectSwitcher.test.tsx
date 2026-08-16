// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { FocusProjectSwitcher } from '#/web/components/repo-workspace/FocusProjectSwitcher.tsx'
import { emptyRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

const REPO_ID = '/workspace/example-project'
let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  resetReposStore()
  const repo = emptyRepo(REPO_ID, 'hobgoblin-workspace')
  useReposStore.setState({
    repos: { [REPO_ID]: repo },
    order: [REPO_ID],
    activeId: REPO_ID,
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  root = null
  container = null
  resetReposStore()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('FocusProjectSwitcher', () => {
  test('uses a tighter truncated label only in compact presentation', () => {
    act(() => root!.render(<FocusProjectSwitcher repoId={REPO_ID} compact />))

    const compactTrigger = container!.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')
    const compactLabel = compactTrigger?.querySelector('span')
    expect(compactLabel?.className).toContain('truncate')
    expect(compactLabel?.className).toContain('max-w-16')
    expect(compactTrigger?.title).toBe('hobgoblin-workspace')

    act(() => root!.render(<FocusProjectSwitcher repoId={REPO_ID} />))

    const desktopTrigger = container!.querySelector<HTMLButtonElement>('[data-testid="focus-project-switcher"]')
    const desktopLabel = desktopTrigger?.querySelector('span')
    expect(desktopLabel?.className).toContain('max-w-40')
    expect(desktopLabel?.className).not.toContain('max-w-16')
  })
})
