// @vitest-environment jsdom

import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useFolderExternalOpenActions } from '#/web/hooks/useFolderExternalOpenActions.ts'

const mocks = vi.hoisted(() => ({
  openEditor: vi.fn(),
  openTerminal: vi.fn(),
  openRemoteEditor: vi.fn(),
  openRemoteTerminal: vi.fn(),
}))

vi.mock('#/web/repo-client.ts', () => ({
  openRepositoryEditor: mocks.openEditor,
  openRepositoryTerminal: mocks.openTerminal,
}))

vi.mock('#/web/remote-client.ts', () => ({
  openRemoteRepositoryEditor: mocks.openRemoteEditor,
  openRemoteRepositoryTerminal: mocks.openRemoteTerminal,
}))

vi.mock('#/web/runtime-settings-external-apps.ts', () => ({
  useRuntimeExternalAppSettings: () => ({
    terminalApp: 'ghostty',
    resolvedTerminalApp: 'ghostty',
    terminalAvailable: true,
    editorApp: 'vscode',
    resolvedEditorApp: 'vscode',
    editorAvailable: true,
  }),
}))

let container: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks()
  for (const opener of [mocks.openEditor, mocks.openTerminal, mocks.openRemoteEditor, mocks.openRemoteTerminal]) {
    opener.mockResolvedValue({ ok: true, message: '' })
  }
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root?.unmount())
  container.remove()
  root = null
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
})

describe('useFolderExternalOpenActions', () => {
  test('opens a local folder in the configured editor and external terminal', async () => {
    const actions = await renderActions({ repoId: '/workspace', path: '/workspace/goblin-feature', available: true })

    await act(async () => await actions().editor.onSelect())
    await act(async () => await actions().externalTerminal.onSelect())

    expect(mocks.openEditor).toHaveBeenCalledWith('/workspace/goblin-feature')
    expect(mocks.openTerminal).toHaveBeenCalledWith('/workspace/goblin-feature')
  })

  test('dispatches SSH folder opens through the remote boundary and disables unavailable folders', async () => {
    const remote = await renderActions({
      repoId: 'ssh-config://dev/srv/workspace',
      path: '/srv/workspace/goblin-feature',
      available: true,
    })
    await act(async () => await remote().editor.onSelect())
    await act(async () => await remote().externalTerminal.onSelect())
    expect(mocks.openRemoteEditor).toHaveBeenCalledWith(
      'ssh-config://dev/srv/workspace',
      '/srv/workspace/goblin-feature',
    )
    expect(mocks.openRemoteTerminal).toHaveBeenCalledWith(
      'ssh-config://dev/srv/workspace',
      '/srv/workspace/goblin-feature',
    )

    const unavailable = await renderActions({ repoId: '/workspace', path: '/workspace/missing', available: false })
    expect(unavailable().editor.disabled).toBe(true)
    expect(unavailable().externalTerminal.disabled).toBe(true)
  })
})

async function renderActions(input: { repoId: string; path: string; available: boolean }) {
  let value: ReturnType<typeof useFolderExternalOpenActions> | null = null
  await act(async () => {
    root!.render(<Harness input={input} onReady={(actions) => (value = actions)} />)
  })
  return () => value!
}

function Harness({
  input,
  onReady,
}: {
  input: { repoId: string; path: string; available: boolean }
  onReady: (actions: ReturnType<typeof useFolderExternalOpenActions>) => void
}) {
  const actions = useFolderExternalOpenActions(input)
  useEffect(() => {
    onReady(actions)
  }, [actions, onReady])
  return null
}
