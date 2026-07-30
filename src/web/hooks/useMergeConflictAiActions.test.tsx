// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useMergeConflictAiActions } from '#/web/hooks/useMergeConflictAiActions.ts'

const mocks = vi.hoisted(() => ({
  getCommitMessageProviders: vi.fn(),
  onHandoff: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  getCommitMessageProviders: mocks.getCommitMessageProviders,
}))

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}))

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }

beforeEach(() => {
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  mocks.getCommitMessageProviders.mockResolvedValue({ codex: true, claude: true })
  mocks.onHandoff.mockResolvedValue(true)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  container = null
  root = null
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('useMergeConflictAiActions', () => {
  test('delegates the selected available provider to the target handoff', async () => {
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'codex')!.onSelect()
    })

    expect(mocks.onHandoff).toHaveBeenCalledWith('codex')
    expect(actions!.error).toBeNull()
  })

  test('reports a target handoff failure without hiding the provider actions', async () => {
    mocks.onHandoff.mockResolvedValueOnce(false)
    let actions: ReturnType<typeof useMergeConflictAiActions> | null = null
    await act(async () => {
      root!.render(<Harness onReady={(value) => (actions = value)} />)
    })
    await act(async () => {})

    await act(async () => {
      await actions!.actions.find((action) => action.provider === 'claude')!.onSelect()
    })

    expect(mocks.onHandoff).toHaveBeenCalledWith('claude')
    expect(actions!.actions).toHaveLength(2)
    expect(actions!.error).toBe('action.merge-conflict-ai-prefill-failed')
  })
})

function Harness({ onReady }: { onReady: (value: ReturnType<typeof useMergeConflictAiActions>) => void }) {
  const value = useMergeConflictAiActions({
    onHandoff: mocks.onHandoff,
  })
  onReady(value)
  return null
}
