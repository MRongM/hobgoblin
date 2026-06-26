// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { SettingsSurface } from '#/web/components/SettingsSurface.tsx'
import { setRendererBridgeForTests } from '#/web/renderer-bridge.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
}))

function defaultRpcResult(path: string, input?: unknown) {
  if (path === 'githubCli.get' || path === 'githubCli.refresh') {
    const requestedHosts = (input as { hosts?: string[] } | undefined)?.hosts
    const hosts = (requestedHosts && requestedHosts.length > 0 ? requestedHosts : ['github.example.com']).reduce<
      Record<string, unknown>
    >((acc, host) => {
      acc[host] = {
        host,
        authenticated: true,
        activeLogin: 'tester',
        logins: ['tester'],
        tokenSource: 'keyring',
      }
      return acc
    }, {})
    return { available: true, version: 'gh version 2.93.0', detectedAt: 0, hosts }
  }
  if (path === 'settings.get') {
    return {
      fetchIntervalSec: 60,
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      toggleDetailOnActionBarBlankClick: false,
      terminalThemeSyncEnabled: true,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      fileTreeFontSize: 12,
      fileTreeTopbarFontSize: 13,
      terminalFontSize: 14,
      terminalExternalInputEnabled: false,
      remoteTerminalTmuxEnabled: false,
      terminalCustomButtonsVisible: true,
      terminalCustomButtonSize: 'medium',
      terminalCustomButtons: [],
      lanEnabled: false,
      session: {
        openRepos: [],
        activeRepo: null,
        detailCollapsed: true,
        detailFocusMode: false,
        workspaceLayout: { left: ['sidebar'], center: ['repo'], right: ['detail'] },
        detailPaneSizes: [50, 50],
      },
      recentRepos: [],
    }
  }
  if (path === 'externalApps.get' || path === 'externalApps.refresh') {
    return {
      terminal: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { ghostty: false, terminal: false },
        detectedAt: 0,
      },
      editor: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { vscode: false, cursor: false, windsurf: false },
        detectedAt: 0,
      },
    }
  }
  if (path === 'settings.setTerminalApp' || path === 'settings.setEditorApp') return input ?? null
  return null
}

vi.mock('sonner', () => ({
  toast: {
    success: toastMocks.success,
    error: toastMocks.error,
  },
}))

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
  return {
    ...actual,
    DndContext: ({ children, onDragEnd }: { children: ReactNode; onDragEnd: (event: TestDragEndEvent) => void }) => {
      dndState.lastDragEnd = onDragEnd
      return <>{children}</>
    },
    PointerSensor: vi.fn(),
    KeyboardSensor: vi.fn(),
    closestCenter: vi.fn(),
    useSensor: () => ({}),
    useSensors: () => [],
  }
})

vi.mock('@dnd-kit/sortable', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/sortable')>('@dnd-kit/sortable')
  return {
    ...actual,
    SortableContext: ({ children }: { children: ReactNode }) => <>{children}</>,
    rectSortingStrategy: vi.fn(),
    sortableKeyboardCoordinates: vi.fn(),
    useSortable: ({ id }: { id: string }) => ({
      attributes: { 'data-sortable-id': id },
      listeners: {},
      setNodeRef: vi.fn(),
      setActivatorNodeRef: vi.fn(),
      transform: null,
      transition: undefined,
      isDragging: false,
    }),
  }
})

let container: HTMLDivElement | null = null
let root: Root | null = null
const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
const testWindow = window as unknown as { goblinNative?: unknown; __GOBLIN_BOOTSTRAP__?: unknown }
const sendTestNotification = vi.fn(async () => true)
const invokeRpc = vi.fn(async ({ path, input }: { path: string; input?: unknown }) => defaultRpcResult(path, input))
const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input.toString())
  let result: unknown = null
  if (url.pathname === '/api/settings/github-cli/refresh') result = defaultRpcResult('githubCli.refresh')
  else if (url.pathname === '/api/settings/github-cli') {
    result = defaultRpcResult('githubCli.get', { hosts: url.searchParams.getAll('host') })
  } else if (url.pathname === '/api/settings') result = defaultRpcResult('settings.get')
  else if (url.pathname === '/api/settings/prefs') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { settings?: Record<string, unknown> }
    result = {
      ok: true,
      settings: {
        ...defaultRpcResult('settings.get'),
        ...(body.settings ?? {}),
      },
    }
  }
  else if (url.pathname === '/api/settings/external-apps') result = defaultRpcResult('externalApps.get')
  return {
    ok: true,
    json: async () => result,
  }
})

beforeEach(() => {
  setRendererBridgeForTests(null)
  resetReposStore()
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  dndState.lastDragEnd = null
  sendTestNotification.mockClear()
  toastMocks.success.mockClear()
  toastMocks.error.mockClear()
  invokeRpc.mockClear()
  invokeRpc.mockImplementation(async ({ path, input }: { path: string; input?: unknown }) =>
    defaultRpcResult(path, input),
  )
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  testWindow.__GOBLIN_BOOTSTRAP__ = {
    homeDir: '/Users/tester',
    initialI18n: null,
    initialSettings: {
      fetchIntervalSec: 60,
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      toggleDetailOnActionBarBlankClick: false,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      fileTreeFontSize: 12,
      fileTreeTopbarFontSize: 13,
      terminalFontSize: 14,
      terminalExternalInputEnabled: false,
      remoteTerminalTmuxEnabled: false,
      terminalCustomButtonsVisible: true,
      terminalCustomButtonSize: 'medium',
      terminalCustomButtons: [],
      lanEnabled: false,
    },
    initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
  }
  testWindow.goblinNative = {
    homeDir: '/Users/tester',
    initialI18n: null,
    initialSettings: {
      fetchIntervalSec: 60,
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      toggleDetailOnActionBarBlankClick: false,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      fileTreeFontSize: 12,
      fileTreeTopbarFontSize: 13,
      terminalFontSize: 14,
      terminalExternalInputEnabled: false,
      remoteTerminalTmuxEnabled: false,
      terminalCustomButtonsVisible: true,
      terminalCustomButtonSize: 'medium',
      terminalCustomButtons: [],
      lanEnabled: false,
    },
    initialServer: { url: 'http://127.0.0.1:32100/', secret: 'secret' },
    pathForFile: () => '',
    invokeRpc,
    abortRpc: async () => true,
    onEvent: () => () => {},
    terminal: {
      open: vi.fn(),
      restart: vi.fn(),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
          create: vi.fn(),
          pruneTerminals: vi.fn(),
      notifyBell: vi.fn(),
      sendTestNotification,
      setBadge: vi.fn(),
      onOutput: vi.fn(() => () => {}),
      onTitle: vi.fn(() => () => {}),
      onExit: vi.fn(() => () => {}),
    },
  }
})

afterEach(() => {
  setRendererBridgeForTests(null)
  act(() => {
    root?.unmount()
  })
  container?.remove()
  root = null
  container = null
  document.body.innerHTML = ''
  delete testWindow.goblinNative
  delete testWindow.__GOBLIN_BOOTSTRAP__
  reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = false
})

describe('SettingsSurface', () => {
  test('can trigger a test terminal notification from settings', async () => {
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    await act(async () => {
      buttonByText('settings.terminal-notifications-test-button').click()
      await Promise.resolve()
    })

    expect(sendTestNotification).toHaveBeenCalledTimes(1)
    expect(toastMocks.success).toHaveBeenCalledWith('settings.terminal-notifications-test-sent')
  })

  test('shows an error toast when the test notification is blocked', async () => {
    sendTestNotification.mockResolvedValueOnce(false)
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    await act(async () => {
      buttonByText('settings.terminal-notifications-test-button').click()
      await Promise.resolve()
    })

    expect(toastMocks.error).toHaveBeenCalledWith('settings.terminal-notifications-test-failed', {
      description: 'settings.terminal-notifications-test-failed-hint',
    })
  })

  test('reflects notification preference from the settings query', async () => {
    fetchMock.mockImplementation(async (input: string | URL) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      let result: unknown = null
      if (url.pathname === '/api/settings') {
        result = {
          ...defaultRpcResult('settings.get'),
          terminalNotificationsEnabled: true,
        }
      } else if (url.pathname === '/api/settings/github-cli') {
        result = defaultRpcResult('githubCli.get', { hosts: url.searchParams.getAll('host') })
      } else if (url.pathname === '/api/settings/external-apps') {
        result = defaultRpcResult('externalApps.get')
      }
      return {
        ok: true,
        json: async () => result,
      }
    })
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    await waitForSwitchState('settings-terminal-notifications', 'true')
  })

  test('shows GitHub CLI availability and version', async () => {
    await render(<SettingsSurface page="github" onPageChange={() => {}} />)

    await waitForText('settings.github.status-available')
    expect(document.body.textContent).toContain('settings.github.status-available')
    expect(document.body.textContent).toContain('gh version 2.93.0')
    expect(document.body.textContent).toContain('github.example.com')
    expect(document.body.textContent).toContain('settings.github.auth-signed-in')
  })

  test('refreshes GitHub CLI detection from settings', async () => {
    await render(<SettingsSurface page="github" onPageChange={() => {}} />)

    await act(async () => {
      buttonByText('settings.github.refresh').click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/github-cli/refresh') return false
        return (
          options &&
          typeof options === 'object' &&
          'method' in options &&
          'headers' in options &&
          (options as RequestInit).method === 'POST' &&
          expect
            .objectContaining({
              'content-type': 'application/json',
              'x-goblin-internal-secret': 'secret',
            })
            .asymmetricMatch((options as RequestInit).headers)
        )
      }),
    ).toBe(true)
  })

  test('shows unavailable GitHub CLI status when gh is missing', async () => {
    fetchMock.mockImplementation(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input.toString())
      let result: unknown = null
      if (url.pathname === '/api/settings/github-cli/refresh') {
        result = { available: false, version: null, detectedAt: 0, hosts: {} }
      } else if (url.pathname === '/api/settings/github-cli') {
        result = { available: false, version: null, detectedAt: 0, hosts: {} }
      } else if (url.pathname === '/api/settings') {
        result = defaultRpcResult('settings.get')
      } else if (url.pathname === '/api/settings/external-apps') {
        result = defaultRpcResult(init?.method === 'POST' ? 'externalApps.refresh' : 'externalApps.get')
      }
      return {
        ok: true,
        json: async () => result,
      }
    })
    await render(<SettingsSurface page="github" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.github.status-unavailable')
    expect(document.body.textContent).toContain('settings.github.hint-missing')
  })

  test('renders the SSH remotes settings page', async () => {
    await render(<SettingsSurface page="ssh" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.ssh.title')
    expect(document.body.textContent).toContain('settings.ssh.body')
    expect(document.body.textContent).toContain('settings.ssh.example')
  })

  test('renders the proxy settings page', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.nav.proxy')
    expect(document.body.textContent).toContain('settings.proxy.git-proxy')
    expect(document.body.textContent).toContain('settings.proxy.git-timeout')
    expect(document.body.textContent).toContain('settings.proxy.ssh-note')
  })

  test('edits git network proxy settings from proxy settings', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    const enabledSwitch = switchById('settings-git-network-proxy-enabled')
    const urlInput = document.getElementById('settings-git-network-proxy-url')
    const timeoutInput = document.getElementById('settings-git-network-timeout-sec')
    if (!(urlInput instanceof HTMLInputElement)) throw new Error('Missing git network proxy url input')
    if (!(timeoutInput instanceof HTMLInputElement)) throw new Error('Missing git network timeout input')

    await act(async () => {
      enabledSwitch.click()
      setInputValue(urlInput, 'socks5://127.0.0.1:7890')
      setInputValue(timeoutInput, '180')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyEnabled === true
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyUrl === 'socks5://127.0.0.1:7890'
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkTimeoutSec === 180
      }),
    ).toBe(true)
  })

  test('edits file tree font size from settings', async () => {
    await render(<SettingsSurface page="files" onPageChange={() => {}} />)

    const input = document.getElementById('settings-file-tree-font-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing file tree font size input')

    await act(async () => {
      setInputValue(input, '13')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('"fileTreeFontSize":13')
      }),
    ).toBe(true)
  })

  test('edits file area topbar font size from settings', async () => {
    await render(<SettingsSurface page="files" onPageChange={() => {}} />)

    const input = document.getElementById('settings-file-tree-topbar-font-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing file tree topbar font size input')

    await act(async () => {
      setInputValue(input, '12')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('"fileTreeTopbarFontSize":12')
      }),
    ).toBe(true)
  })

  test('edits the file area height ratio from settings', async () => {
    await render(<SettingsSurface page="files" onPageChange={() => {}} />)

    const input = document.getElementById('settings-file-tree-pane-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing file tree pane size input')

    await act(async () => {
      setInputValue(input, '72.5')
      await Promise.resolve()
    })

    expect(useReposStore.getState().fileTreePaneSizes['left-right']).toBe(72.5)
  })

  test('updates the temporary files directory from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-temporary-files-directory')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing temporary files directory input')

    await act(async () => {
      setInputValue(input, '/Users/test/project/tmp')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.temporaryFilesDirectory === '/Users/test/project/tmp'
      }),
    ).toBe(true)
  })

  test('updates terminal theme sync from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-terminal-theme-sync')
    if (!(input instanceof HTMLButtonElement)) throw new Error('Missing terminal theme sync switch')

    await act(async () => {
      input.click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.terminalThemeSyncEnabled === false
      }),
    ).toBe(true)
  })

  test('edits terminal font size from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const input = document.getElementById('settings-terminal-font-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing terminal font size input')

    await act(async () => {
      setInputValue(input, '16')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('"terminalFontSize":16')
      }),
    ).toBe(true)
  })

  test('edits terminal custom buttons from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.terminal-input.title')
    expect(document.body.textContent).toContain('settings.terminal-external-input')
    expect(document.body.textContent).toContain('settings.terminal-custom-buttons.visible')

    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.add').click()
      await Promise.resolve()
    })

    const labelInput = document.getElementById('terminal-custom-button-label-0')
    const valueInput = document.getElementById('terminal-custom-button-value-0')
    const actionTrigger = document.getElementById('terminal-custom-button-action-0')
    if (!(labelInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLTextAreaElement)) {
      throw new Error('Missing terminal custom button fields')
    }
    expect(actionTrigger).toBeTruthy()

    await act(async () => {
      setInputValue(labelInput, 'status')
      setTextAreaValue(valueInput, 'git status --short')
      await Promise.resolve()
    })

    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        return (
          String(options?.body ?? '').includes('terminalCustomButtons') &&
          String(options?.body ?? '').includes('"action":"execute"')
        )
      }),
    ).toBe(true)
  })

  test('reorders terminal custom buttons with move buttons before saving', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')
    await addTerminalCustomButton('gamma', 'echo gamma')

    await act(async () => {
      buttonsByLabel('settings.terminal-custom-buttons.move-down')[0]?.click()
      await Promise.resolve()
    })
    await act(async () => {
      buttonsByLabel('settings.terminal-custom-buttons.move-up')[2]?.click()
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(terminalCustomButtonLabelsFromPayload()).toEqual(['beta', 'gamma', 'alpha'])
  })

  test('disables terminal custom button move controls at list boundaries', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')

    const moveUpButtons = buttonsByLabel('settings.terminal-custom-buttons.move-up')
    const moveDownButtons = buttonsByLabel('settings.terminal-custom-buttons.move-down')

    expect(moveUpButtons).toHaveLength(2)
    expect(moveDownButtons).toHaveLength(2)
    expect(moveUpButtons[0]?.disabled).toBe(true)
    expect(moveUpButtons[1]?.disabled).toBe(false)
    expect(moveDownButtons[0]?.disabled).toBe(false)
    expect(moveDownButtons[1]?.disabled).toBe(true)
  })

  test('reorders terminal custom buttons from drag end before saving', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await addTerminalCustomButton('alpha', 'echo alpha')
    await addTerminalCustomButton('beta', 'echo beta')
    await addTerminalCustomButton('gamma', 'echo gamma')

    const sortableHandles = Array.from(document.body.querySelectorAll('[data-sortable-id]'))
    const firstId = sortableHandles[0]?.getAttribute('data-sortable-id')
    const thirdId = sortableHandles[2]?.getAttribute('data-sortable-id')
    if (!firstId || !thirdId) throw new Error('Missing sortable ids for custom terminal buttons')

    await act(async () => {
      dndState.lastDragEnd?.({ active: { id: firstId }, over: { id: thirdId } })
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(terminalCustomButtonLabelsFromPayload()).toEqual(['beta', 'gamma', 'alpha'])
  })

  test('shows terminal custom button size control from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const trigger = document.getElementById('settings-terminal-custom-button-size')
    expect(trigger).toBeInstanceOf(HTMLElement)
    expect(trigger?.textContent).toContain('settings.terminal-custom-buttons.size-medium')
  })

  test('toggles terminal external input, remote tmux, and custom button visibility from settings', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const externalInputSwitch = switchById('settings-terminal-external-input')
    const remoteTmuxSwitch = switchById('settings-terminal-remote-tmux')
    const buttonsVisibleSwitch = switchById('settings-terminal-custom-buttons-visible')

    await act(async () => {
      externalInputSwitch.click()
      remoteTmuxSwitch.click()
      buttonsVisibleSwitch.click()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalExternalInputEnabled')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('remoteTerminalTmuxEnabled')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('terminalCustomButtonsVisible')
      }),
    ).toBe(true)
  })
})

async function render(element: React.ReactNode) {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
  await act(async () => {
    root!.render(<QueryClientProvider client={queryClient}>{element}</QueryClientProvider>)
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function waitForText(text: string) {
  for (let i = 0; i < 5; i += 1) {
    if (document.body.textContent?.includes(text)) return
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`Missing text: ${text}`)
}

function buttonByText(text: string): HTMLButtonElement {
  const buttons = Array.from(document.body.querySelectorAll('button'))
  const match = buttons.find((button) => button.textContent?.includes(text))
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing button with text: ${text}`)
  return match
}

async function addTerminalCustomButton(label: string, value: string) {
  await act(async () => {
    buttonByText('settings.terminal-custom-buttons.add').click()
    await Promise.resolve()
  })

  const index = document.querySelectorAll('[id^="terminal-custom-button-label-"]').length - 1
  const labelInput = document.getElementById(`terminal-custom-button-label-${index}`)
  const valueInput = document.getElementById(`terminal-custom-button-value-${index}`)
  if (!(labelInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLTextAreaElement)) {
    throw new Error(`Missing terminal custom button fields at index ${index}`)
  }

  await act(async () => {
    setInputValue(labelInput, label)
    setTextAreaValue(valueInput, value)
    await Promise.resolve()
  })
}

function buttonsByLabel(label: string): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll(`button[aria-label="${label}"]`)).filter(
    (button): button is HTMLButtonElement => button instanceof HTMLButtonElement,
  )
}

function lastTerminalCustomButtonsPayload(): unknown[] {
  const matchingCalls = fetchMock.mock.calls.filter((call) => {
    const [url] = call as unknown as [unknown, RequestInit | undefined]
    return new URL(String(url)).pathname === '/api/settings/prefs'
  })
  const [, options] = matchingCalls[matchingCalls.length - 1] as unknown as [unknown, RequestInit | undefined]
  const body = JSON.parse(String(options?.body ?? '{}')) as {
    settings?: { terminalCustomButtons?: unknown[] }
  }
  return body.settings?.terminalCustomButtons ?? []
}

function terminalCustomButtonLabelsFromPayload() {
  return lastTerminalCustomButtonsPayload().map((button) =>
    typeof button === 'object' && button && 'label' in button ? String(button.label) : '',
  )
}

function setInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')
  descriptor?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function setTextAreaValue(textarea: HTMLTextAreaElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
  descriptor?.set?.call(textarea, value)
  textarea.dispatchEvent(new Event('input', { bubbles: true }))
}

function switchById(id: string): HTMLButtonElement {
  const match = document.getElementById(id)
  if (!(match instanceof HTMLButtonElement)) throw new Error(`Missing switch with id: ${id}`)
  return match
}

async function waitForSwitchState(id: string, checked: 'true' | 'false') {
  for (let i = 0; i < 5; i += 1) {
    if (switchById(id).getAttribute('aria-checked') === checked) return
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`Switch ${id} did not reach ${checked}`)
}
