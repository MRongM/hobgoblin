// @vitest-environment jsdom

import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { WorkspaceConfigurationDialog } from '#/web/components/repo-workspace/WorkspaceConfigurationDialog.tsx'

vi.mock('#/web/stores/i18n.ts', () => ({
  useT: () => (key: string) => key,
}))

const candidates = [
  { id: '/workspace/api', name: 'api', selected: true, available: true },
  { id: '/workspace/web', name: 'web', selected: true, available: true },
  { id: '/workspace/docs', name: 'docs', selected: false, available: true },
]

let container: HTMLDivElement | null = null
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container?.remove()
  document.querySelectorAll('[data-slot="dialog-portal"]').forEach((node) => node.remove())
  root = null
  container = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('WorkspaceConfigurationDialog', () => {
  test('disables save when no repositories are selected', () => {
    act(() =>
      root!.render(
        <WorkspaceConfigurationDialog
          open
          onOpenChange={() => {}}
          configuredRepositoryNames={['api']}
          candidates={[candidates[0]!]}
          onSave={async () => ({ ok: true })}
        />,
      ),
    )

    const apiMember = document.querySelector<HTMLInputElement>('button[aria-label="api workspace.configure-member"]')
    expect(apiMember?.getAttribute('data-state')).toBe('checked')
    act(() => apiMember?.click())
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
  })

  test('preserves configured order and appends newly selected repositories', async () => {
    const onSave = vi.fn(async () => ({ ok: true as const }))
    act(() =>
      root!.render(
        <WorkspaceConfigurationDialog
          open
          onOpenChange={() => {}}
          configuredRepositoryNames={['web', 'api']}
          candidates={candidates}
          onSave={onSave}
        />,
      ),
    )

    act(() =>
      document.querySelector<HTMLButtonElement>('button[aria-label="docs workspace.configure-member"]')?.click(),
    )
    await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click())

    expect(onSave).toHaveBeenCalledWith({ repo: ['web', 'api', 'docs'] })
    expect(document.querySelector('input[type="radio"]')).toBeNull()
  })
})
