// @vitest-environment jsdom

import { act, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { TerminalCustomButton } from '#/shared/settings.ts'
import { DICTS } from '#/shared/i18n/dictionaries.ts'
import { SettingsSurface } from '#/web/components/SettingsSurface.tsx'
import { setRendererBridgeForTests } from '#/web/renderer-bridge.ts'
import { emptyRepo, replaceRepo } from '#/web/stores/repos/helpers.ts'
import { useReposStore } from '#/web/stores/repos/store.ts'
import { resetReposStore } from '#/web/stores/repos/test-utils.ts'
import { useI18nStore } from '#/web/stores/i18n.ts'

const toastMocks = vi.hoisted(() => ({
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

type TestDragEndEvent = { active: { id: string }; over: { id: string } | null }

const dndState = vi.hoisted(() => ({
  lastDragEnd: null as ((event: TestDragEndEvent) => void) | null,
}))

let terminalCustomButtonsFixture: TerminalCustomButton[] = []

function defaultRpcResult(path: string, input?: unknown) {
  if (path === 'settings.get') {
    return {
      fetchIntervalSec: 60,
      statusRefreshIntervalSec: 60,
      fontFamily: 'mono',
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      terminalThemeSyncEnabled: true,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      topbarHeightPx: 34,
      toolbarHeightPx: 34,
      fileTreeFontSize: 12,
      terminalFontSize: 14,
      terminalCustomButtonsVisible: true,
      terminalCustomButtonSize: 'medium',
      terminalCustomButtons: terminalCustomButtonsFixture,
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
      webAccess: { enabled: false, username: '', passwordConfigured: false },
      telegramNotifications: {
        enabled: false,
        botTokenConfigured: false,
        chatId: '',
        proxyEnabled: true,
        bellEnabled: true,
        outputCompletionEnabled: false,
        outputCompletionMinimumActivitySeconds: 10,
        includeTerminalOutput: false,
        outputTailLength: 400,
      },
    }
  }
  if (path === 'externalApps.get' || path === 'externalApps.refresh') {
    return {
      terminal: {
        pref: 'auto',
        resolved: null,
        available: false,
        appAvailability: { ghostty: false, terminal: false, wsl: false, powershell: false, cmd: false },
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
    info: toastMocks.info,
    warning: toastMocks.warning,
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
  if (url.pathname === '/api/settings') result = defaultRpcResult('settings.get')
  else if (url.pathname === '/api/settings/prefs') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { settings?: Record<string, unknown> }
    result = {
      ok: true,
      settings: {
        ...defaultRpcResult('settings.get'),
        ...(body.settings ?? {}),
      },
    }
  } else if (url.pathname === '/api/settings/external-apps') result = defaultRpcResult('externalApps.get')
  else if (url.pathname === '/api/settings/web-access') {
    const body = JSON.parse(String(init?.body ?? '{}')) as { enabled?: boolean; username?: string }
    result = {
      ok: true,
      webAccess: {
        enabled: body.enabled === true,
        username: body.username?.trim() ?? '',
        passwordConfigured: true,
      },
    }
  } else if (url.pathname === '/api/settings/telegram') {
    const body = JSON.parse(String(init?.body ?? '{}')) as {
      enabled?: boolean
      botToken?: string
      chatId?: string
      proxyEnabled?: boolean
      bellEnabled?: boolean
      outputCompletionEnabled?: boolean
      includeTerminalOutput?: boolean
      outputCompletionMinimumActivitySeconds?: number
      outputTailLength?: number
    }
    result = {
      ok: true,
      telegramNotifications: {
        enabled: body.enabled === true,
        botTokenConfigured: Boolean(body.botToken),
        chatId: body.chatId?.trim() ?? '',
        proxyEnabled: body.proxyEnabled === true,
        bellEnabled: body.bellEnabled === true,
        outputCompletionEnabled: body.outputCompletionEnabled === true,
        outputCompletionMinimumActivitySeconds: body.outputCompletionMinimumActivitySeconds ?? 10,
        includeTerminalOutput: body.includeTerminalOutput === true,
        outputTailLength: body.outputTailLength ?? 400,
      },
    }
  } else if (url.pathname === '/api/telegram-notifications/test') {
    result = { ok: true }
  }
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
  terminalCustomButtonsFixture = []
  useI18nStore.setState({ lang: 'en', pref: 'auto', dict: {} })
  sendTestNotification.mockClear()
  toastMocks.success.mockClear()
  toastMocks.info.mockClear()
  toastMocks.warning.mockClear()
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
      statusRefreshIntervalSec: 60,
      fontFamily: 'mono',
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      topbarHeightPx: 34,
      toolbarHeightPx: 34,
      fileTreeFontSize: 12,
      terminalFontSize: 14,
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
      statusRefreshIntervalSec: 60,
      fontFamily: 'mono',
      gitNetworkProxyEnabled: false,
      gitNetworkProxyUrl: '',
      gitNetworkTimeoutSec: 120,
      terminalNotificationsEnabled: false,
      shortcutsDisabled: false,
      globalShortcutDisabled: false,
      swapCloseShortcuts: false,
      temporaryFilesDirectory: '',
      globalShortcut: 'CommandOrControl+Shift+G',
      globalShortcutRegistered: true,
      terminalApp: 'auto',
      editorApp: 'auto',
      topbarHeightPx: 34,
      toolbarHeightPx: 34,
      fileTreeFontSize: 12,
      terminalFontSize: 14,
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
  test('renders only the application shortcut toggle and active shortcut help groups', async () => {
    await render(<SettingsSurface page="shortcuts" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.shortcuts-disable-app')
    expect(document.body.textContent).not.toContain('settings.shortcuts-disable-global')
    expect(document.body.textContent).not.toContain('settings.global-shortcut')
    expect(document.body.textContent).not.toContain('help.section.navigation')
    expect(document.body.textContent).not.toContain('help.section.views')
    expect(document.body.textContent).not.toContain('help.section.app')
  })

  test('renders and writes scheduled status refresh with the auto-sync interval choices', async () => {
    await render(<SettingsSurface page="sync" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.group.status-refresh')
    expect(document.body.textContent).toContain('settings.status-refresh')
    expect(document.body.textContent).toContain('settings.status-refresh-hint')
    const trigger = document.getElementById('settings-status-refresh')
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Missing scheduled status refresh select')
    if (!Element.prototype.scrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    }

    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await Promise.resolve()
    })

    const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'settings.fetch.off',
      'settings.fetch.30s',
      'settings.fetch.1m',
      'settings.fetch.2m',
      'settings.fetch.3m',
      'settings.fetch.5m',
      'settings.fetch.15m',
    ])
    const fiveMinutes = options.find((option) => option.textContent?.trim() === 'settings.fetch.5m')
    if (!fiveMinutes) throw new Error('Missing five minute status refresh option')

    await act(async () => {
      fiveMinutes.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, request] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(request?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.statusRefreshIntervalSec === 300
      }),
    ).toBe(true)
  })

  test('can preview every in-app notification style from settings', async () => {
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    const cases = [
      ['success', toastMocks.success],
      ['info', toastMocks.info],
      ['warning', toastMocks.warning],
      ['error', toastMocks.error],
    ] as const

    for (const [style, showToast] of cases) {
      await act(async () => {
        buttonByText(`settings.in-app-notifications-test-button.${style}`).click()
        await Promise.resolve()
      })

      expect(showToast).toHaveBeenCalledWith(`settings.in-app-notifications-test-title.${style}`, {
        description: 'settings.in-app-notifications-test-body',
      })
    }
  })

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

  test('uses Telegram completion activity shortcuts and manual seconds as one saved value', async () => {
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    const input = document.getElementById('settings-telegram-output-completion-min-activity')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing Telegram completion activity duration input')
    expect(input.value).toBe('10')
    expect(input.min).toBe('1')
    expect(input.max).toBe('3600')

    await act(async () => {
      buttonByText('settings.telegram.output-completion-min-activity-low').click()
      await Promise.resolve()
    })
    expect(input.value).toBe('1')

    await act(async () => {
      buttonByText('settings.telegram.output-completion-min-activity-medium').click()
      await Promise.resolve()
    })
    expect(input.value).toBe('10')

    await act(async () => {
      buttonByText('settings.telegram.output-completion-min-activity-high').click()
      await Promise.resolve()
    })
    expect(input.value).toBe('30')

    await act(async () => {
      setInputValue(input, '125')
      await Promise.resolve()
    })
    expect(input.value).toBe('125')

    await act(async () => {
      buttonByText('settings.telegram.save').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const write = fetchMock.mock.calls.find((call) => {
      const [url] = call as unknown as [unknown, RequestInit | undefined]
      return new URL(String(url)).pathname === '/api/settings/telegram'
    })
    expect(write).toBeDefined()
    const [, options] = write as unknown as [unknown, RequestInit]
    expect(JSON.parse(String(options.body))).toMatchObject({
      outputCompletionMinimumActivitySeconds: 125,
    })
  })

  test('configures and tests Telegram notifications without echoing the Bot Token', async () => {
    await render(<SettingsSurface page="notifications" onPageChange={() => {}} />)

    const tokenInput = document.getElementById('settings-telegram-bot-token')
    const chatIdInput = document.getElementById('settings-telegram-chat-id')
    if (!(tokenInput instanceof HTMLInputElement)) throw new Error('Missing Telegram Bot Token input')
    if (!(chatIdInput instanceof HTMLInputElement)) throw new Error('Missing Telegram Chat ID input')
    expect(tokenInput.type).toBe('password')
    expect(tokenInput.value).toBe('')
    expect(document.body.textContent).toContain('settings.telegram.master-off-hint')
    expect(switchById('settings-telegram-proxy-enabled').getAttribute('data-state')).toBe('checked')
    expect(switchById('settings-telegram-bell-enabled').getAttribute('data-state')).toBe('checked')
    expect(switchById('settings-telegram-output-completion-enabled').getAttribute('data-state')).toBe('unchecked')
    expect(switchById('settings-telegram-include-terminal-screen-image').getAttribute('data-state')).toBe('unchecked')
    expect(document.getElementById('settings-telegram-output-tail-length')).toBeNull()
    expect(document.body.textContent).not.toContain('settings.telegram.output-tail-length')

    await act(async () => {
      switchById('settings-telegram-enabled').click()
      switchById('settings-telegram-proxy-enabled').click()
      switchById('settings-telegram-output-completion-enabled').click()
      switchById('settings-telegram-include-terminal-screen-image').click()
      setInputValue(tokenInput, '123456:test-token')
      setInputValue(chatIdInput, '-100123')
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.telegram.save').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const write = fetchMock.mock.calls.find((call) => {
      const [url] = call as unknown as [unknown, RequestInit | undefined]
      return new URL(String(url)).pathname === '/api/settings/telegram'
    })
    expect(write).toBeDefined()
    const [, options] = write as unknown as [unknown, RequestInit]
    expect(JSON.parse(String(options.body))).toEqual({
      enabled: true,
      botToken: '123456:test-token',
      chatId: '-100123',
      proxyEnabled: false,
      bellEnabled: true,
      outputCompletionEnabled: true,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: true,
      outputTailLength: 400,
    })
    expect((document.getElementById('settings-telegram-bot-token') as HTMLInputElement).value).toBe('')

    await act(async () => {
      buttonByText('settings.telegram.test-button').click()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(toastMocks.success).toHaveBeenCalledWith('settings.telegram.test-sent')
  })

  test('renders the SSH remotes settings page', async () => {
    await render(<SettingsSurface page="ssh" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.ssh.title')
    expect(document.body.textContent).toContain('settings.ssh.body')
    expect(document.body.textContent).toContain('settings.ssh.example')
  })

  test('renders the proxy settings page', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    const proxyUrlInput = document.getElementById('settings-proxy-url')
    const gitProxySwitch = switchById('settings-git-network-proxy-enabled')
    if (!(proxyUrlInput instanceof HTMLInputElement)) throw new Error('Missing shared proxy URL input')
    expect(document.body.textContent).toContain('settings.nav.proxy')
    expect(document.body.textContent).toContain('settings.proxy.url')
    expect(document.body.textContent).toContain('settings.proxy.git-proxy')
    expect(document.body.textContent).toContain('settings.proxy.git-timeout')
    expect(document.body.textContent).toContain('settings.proxy.ssh-note')
    expect(proxyUrlInput.compareDocumentPosition(gitProxySwitch) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  })

  test('configures protected Web access from LAN settings without echoing password fields', async () => {
    await render(<SettingsSurface page="lan" onPageChange={() => {}} />)

    const usernameInput = document.getElementById('settings-web-access-username')
    const passwordInput = document.getElementById('settings-web-access-password')
    const confirmInput = document.getElementById('settings-web-access-confirm-password')
    if (!(usernameInput instanceof HTMLInputElement)) throw new Error('Missing Web access username input')
    if (!(passwordInput instanceof HTMLInputElement)) throw new Error('Missing Web access password input')
    if (!(confirmInput instanceof HTMLInputElement)) throw new Error('Missing Web access password confirmation input')

    expect(passwordInput.type).toBe('password')
    expect(passwordInput.value).toBe('')
    expect(confirmInput.value).toBe('')
    expect(document.getElementById('settings-lan-enabled')).not.toBeNull()
    expect(document.body.textContent).not.toContain('settings.nav.security')

    await act(async () => {
      switchById('settings-web-access-enabled').click()
      setInputValue(usernameInput, ' operator ')
      setInputValue(passwordInput, 'test-password')
      setInputValue(confirmInput, 'test-password')
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.security.save').click()
      await Promise.resolve()
      await Promise.resolve()
    })

    const write = fetchMock.mock.calls.find((call) => {
      const [url] = call as unknown as [unknown, RequestInit | undefined]
      return new URL(String(url)).pathname === '/api/settings/web-access'
    })
    expect(write).toBeDefined()
    const [, options] = write as unknown as [unknown, RequestInit]
    expect(JSON.parse(String(options.body))).toEqual({
      enabled: true,
      username: 'operator',
      password: 'test-password',
    })
  })

  test('keeps LAN host controls Electron-only while exposing merged security settings on Web', async () => {
    delete testWindow.goblinNative

    await render(<SettingsSurface page="lan" onPageChange={() => {}} />)

    expect(document.getElementById('settings-lan-enabled')).toBeNull()
    expect(document.getElementById('settings-web-access-username')).not.toBeNull()
    expect(document.body.textContent).not.toContain('settings.nav.security')
  })

  test('edits git network proxy settings from proxy settings', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    const enabledSwitch = switchById('settings-git-network-proxy-enabled')
    const urlInput = document.getElementById('settings-proxy-url')
    const timeoutInput = document.getElementById('settings-git-network-timeout-sec')
    if (!(urlInput instanceof HTMLInputElement)) throw new Error('Missing shared proxy URL input')
    if (!(timeoutInput instanceof HTMLInputElement)) throw new Error('Missing git network timeout input')

    await act(async () => {
      enabledSwitch.click()
      urlInput.focus()
      setInputValue(urlInput, 'socks5://127.0.0.1:7890')
      urlInput.blur()
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

  test('keeps an incomplete proxy URL editable and persists it after editing finishes', async () => {
    await render(<SettingsSurface page="proxy" onPageChange={() => {}} />)

    const urlInput = document.getElementById('settings-proxy-url')
    if (!(urlInput instanceof HTMLInputElement)) throw new Error('Missing shared proxy URL input')

    await act(async () => {
      urlInput.focus()
      setInputValue(urlInput, 'http')
      await Promise.resolve()
    })

    expect(urlInput.value).toBe('http')
    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyUrl !== undefined
      }),
    ).toBe(false)

    await act(async () => {
      setInputValue(urlInput, 'http://127.0.0.1:7890')
      urlInput.blur()
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.gitNetworkProxyUrl === 'http://127.0.0.1:7890'
      }),
    ).toBe(true)
  })

  test('edits global UI font size from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-app-font-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing application UI font size input')

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

  test('merges file-area settings into General and removes the Files destination', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    expect(document.getElementById('settings-app-font-size')).not.toBeNull()
    expect(document.getElementById('settings-file-tree-pane-size')).not.toBeNull()
    expect(document.getElementById('settings-file-tree-clipboard-max-bytes')).not.toBeNull()
    expect(document.getElementById('settings-file-tree-font-size')).toBeNull()
    expect(document.getElementById('settings-file-tree-topbar-font-size')).toBeNull()
    expect(document.getElementById('settings-terminal-font-size')).toBeNull()
    expect(document.body.textContent).not.toContain('settings.files.font.title')
    expect(document.body.textContent).not.toContain('settings.nav.files')
  })

  test('edits the new project default file area height ratio from settings without changing project overrides', async () => {
    const repo = replaceRepo(emptyRepo('/repo-a', 'repo-a'), (draft) => {
      draft.ui.fileTreePaneSizes = { 'left-right': 32.2 }
    })
    useReposStore.setState({
      repos: { '/repo-a': repo },
      order: ['/repo-a'],
      activeId: '/repo-a',
      workspaceLayout: 'left-right',
      fileTreePaneSizes: { 'left-right': 66.7 },
    })
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-file-tree-pane-size')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing file tree pane size input')

    await act(async () => {
      setInputValue(input, '72.5')
      await Promise.resolve()
    })

    expect(useReposStore.getState().fileTreePaneSizes['left-right']).toBe(72.5)
    expect(useReposStore.getState().repos['/repo-a']?.ui.fileTreePaneSizes).toEqual({
      'left-right': 32.2,
    })
  })

  test('updates the temporary files directory from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const input = document.getElementById('settings-temporary-files-directory')
    if (!(input instanceof HTMLInputElement)) throw new Error('Missing temporary files directory input')

    await act(async () => {
      setInputValue(input, 'tmp/cache')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, options] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(options?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.temporaryFilesDirectory === 'tmp/cache'
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

  test('does not expose the removed action bar blank toggle in general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    expect(document.getElementById('settings-action-bar-blank-toggle')).toBeNull()
  })

  test('lists and writes every shared color theme from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const trigger = document.getElementById('settings-theme-preset')
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('Missing theme preset select')
    if (!Element.prototype.scrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
    }

    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
      await Promise.resolve()
    })

    const options = Array.from(document.body.querySelectorAll<HTMLElement>('[role="option"]'))
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      'settings.theme-preset.macos',
      'settings.theme-preset.mono',
      'settings.theme-preset.github',
      'settings.theme-preset.claude',
      'settings.theme-preset.cursor',
      'settings.theme-preset.airbnb',
      'settings.theme-preset.bmw',
      'settings.theme-preset.signal',
      'settings.theme-preset.forge',
      'settings.theme-preset.catppuccin',
      'settings.theme-preset.solarized',
      'settings.theme-preset.tokyo-night',
    ])

    const tokyoNight = options.find((option) => option.textContent?.trim() === 'settings.theme-preset.tokyo-night')
    if (!tokyoNight) throw new Error('Missing Tokyo Night theme option')
    await act(async () => {
      tokyoNight.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [url, request] = call as unknown as [unknown, RequestInit | undefined]
        if (new URL(String(url)).pathname !== '/api/settings/prefs') return false
        const body = JSON.parse(String(request?.body ?? '{}')) as { settings?: Record<string, unknown> }
        return body.settings?.colorTheme === 'tokyo-night'
      }),
    ).toBe(true)
  })

  test('does not render the goblin.toml initializer in general settings', async () => {
    useReposStore.setState({
      repos: { '/repo-a': emptyRepo('/repo-a', 'Repo A') },
      order: ['/repo-a'],
      activeId: '/repo-a',
    })

    await render(<SettingsSurface page="general" onPageChange={() => {}} />)
    await waitForText('settings.general.open-from-terminal-title')

    expect(
      fetchMock.mock.calls.some((call) =>
        new URL(String((call as unknown as [unknown])[0])).pathname.startsWith('/api/repo/worktree-bootstrap'),
      ),
    ).toBe(false)
    expect(document.body.textContent).not.toContain('settings.worktree-bootstrap-config.label')
  })

  test('edits chrome heights from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    const topbarInput = document.getElementById('settings-topbar-height')
    const toolbarInput = document.getElementById('settings-toolbar-height')
    if (!(topbarInput instanceof HTMLInputElement)) throw new Error('Missing topbar height input')
    if (!(toolbarInput instanceof HTMLInputElement)) throw new Error('Missing toolbar height input')

    await act(async () => {
      setInputValue(topbarInput, '39')
      setInputValue(toolbarInput, '41')
      await Promise.resolve()
    })

    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('"topbarHeightPx":39')
      }),
    ).toBe(true)
    expect(
      fetchMock.mock.calls.some((call) => {
        const [, options] = call as unknown as [unknown, RequestInit | undefined]
        return String(options?.body ?? '').includes('"toolbarHeightPx":41')
      }),
    ).toBe(true)
  })

  test('renders global font family setting from general settings', async () => {
    await render(<SettingsSurface page="general" onPageChange={() => {}} />)

    expect(document.body.textContent).toContain('settings.font-family')
    expect(document.body.textContent).toContain('settings.font-family-hint')
    expect(document.body.textContent).toContain('settings.font-family.mono')
    expect(document.getElementById('settings-font-family')).not.toBeNull()
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

    expect(document.body.textContent).not.toContain('settings.terminal-tmux.title')
    expect(document.body.textContent).not.toContain(['settings', ['terminal', 'external', 'input'].join('-')].join('.'))
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

  test('shows built-in terminal button presets in the current application language', async () => {
    terminalCustomButtonsFixture = [
      {
        label: 'Confirm, continue',
        value: 'Confirm and continue',
        action: 'execute',
        presetId: 'confirm-continue',
      },
    ]
    useI18nStore.setState({ lang: 'zh', pref: 'zh', dict: DICTS.zh })

    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    const labelInput = await waitForInputValue('terminal-custom-button-label-0', '确认、继续')
    const valueInput = document.getElementById('terminal-custom-button-value-0')

    expect(labelInput.value).toBe('确认、继续')
    expect(valueInput).toBeInstanceOf(HTMLTextAreaElement)
    expect((valueInput as HTMLTextAreaElement).value).toBe('确认、继续')
  })

  test('preserves a built-in terminal button preset id when reordering', async () => {
    terminalCustomButtonsFixture = [
      {
        label: 'Confirm, continue',
        value: 'Confirm and continue',
        action: 'execute',
        presetId: 'confirm-continue',
      },
      { label: 'Status', value: 'git status', action: 'execute' },
    ]

    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    await waitForInputValue('terminal-custom-button-label-0', 'Confirm, continue')
    await act(async () => {
      buttonsByLabel('settings.terminal-custom-buttons.move-down')[0]?.click()
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(lastTerminalCustomButtonsPayload()).toEqual([
      { label: 'Status', value: 'git status', action: 'execute' },
      {
        label: 'Confirm, continue',
        value: 'Confirm and continue',
        action: 'execute',
        presetId: 'confirm-continue',
      },
    ])
  })

  test('turns a built-in terminal button preset into a custom button when edited', async () => {
    terminalCustomButtonsFixture = [
      {
        label: 'Confirm, continue',
        value: 'Confirm and continue',
        action: 'execute',
        presetId: 'confirm-continue',
      },
    ]

    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)
    const labelInput = await waitForInputValue('terminal-custom-button-label-0', 'Confirm, continue')
    await act(async () => {
      setInputValue(labelInput, 'Continue')
      await Promise.resolve()
    })
    await act(async () => {
      buttonByText('settings.terminal-custom-buttons.save').click()
      await Promise.resolve()
    })

    expect(lastTerminalCustomButtonsPayload()).toEqual([
      { label: 'Continue', value: 'Confirm and continue', action: 'execute' },
    ])
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

  test('toggles custom button visibility', async () => {
    await render(<SettingsSurface page="terminal" onPageChange={() => {}} />)

    const buttonsVisibleSwitch = switchById('settings-terminal-custom-buttons-visible')

    await act(async () => {
      buttonsVisibleSwitch.click()
      await Promise.resolve()
    })

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

async function waitForInputValue(id: string, value: string): Promise<HTMLInputElement> {
  for (let i = 0; i < 5; i += 1) {
    const input = document.getElementById(id)
    if (input instanceof HTMLInputElement && input.value === value) return input
    await act(async () => {
      await Promise.resolve()
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }
  throw new Error(`Missing input value: ${id}=${value}`)
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
