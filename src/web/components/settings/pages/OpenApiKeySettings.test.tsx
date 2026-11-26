// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, test, vi } from 'vitest'
import { OpenApiKeySettings } from '#/web/components/settings/pages/OpenApiKeySettings.tsx'
import { openApiKeyStatusQueryKey } from '#/web/settings-query-cache.ts'

const mocks = vi.hoisted(() => ({ generateOpenApiKey: vi.fn(), writeText: vi.fn() }))

vi.mock('#/web/settings-client.ts', () => ({ generateOpenApiKey: mocks.generateOpenApiKey }))

vi.mock('#/web/settings-queries.ts', async () => {
  const { useQuery } = await import('@tanstack/react-query')
  return {
    useOpenApiKeyStatusQuery: () =>
      useQuery({
        queryKey: ['settings', 'open-api-key'],
        queryFn: async () => ({ status: 'unset' }),
        staleTime: Infinity,
      }),
  }
})

vi.mock('#/web/stores/i18n.ts', () => ({ useT: () => (key: string) => key }))

test('generates, copies and clears the key and confirms replacement', async () => {
  const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
  const queryClient = new QueryClient()
  const queryKey = openApiKeyStatusQueryKey()
  queryClient.setQueryData(queryKey, { status: 'unset' })
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: mocks.writeText } })
  const status = { status: 'configured' }
  mocks.generateOpenApiKey.mockResolvedValueOnce({ key: 'example-initial-key', ...status })
  mocks.generateOpenApiKey.mockResolvedValueOnce({ key: 'example-replacement-key', ...status })

  function getButton(id: string) {
    const button = document.getElementById(id)
    if (!(button instanceof HTMLButtonElement)) throw new Error('Missing settings button')
    return button
  }

  function clickLabel(name: string, container: ParentNode = document.body) {
    const button = Array.from(container.querySelectorAll('button')).find((entry) => entry.textContent?.trim() === name)
    if (!button) throw new Error(`Missing button ${name}`)
    button.click()
  }

  try {
    await act(async () =>
      root.render(
        <QueryClientProvider client={queryClient}>
          <OpenApiKeySettings />
        </QueryClientProvider>,
      ),
    )
    expect(container.querySelectorAll('[id^="settings-open-api-key"]')).toHaveLength(1)
    await act(async () => getButton('settings-open-api-key').click())
    expect(mocks.generateOpenApiKey).toHaveBeenLastCalledWith(false)
    expect((document.getElementById('generated-open-api-key') as HTMLInputElement).value).toBe('example-initial-key')
    expect(queryClient.getQueryData(queryKey)).toEqual(status)
    await act(async () => clickLabel('settings.open-api-keys.copy'))
    expect(mocks.writeText).toHaveBeenCalledWith('example-initial-key')
    await act(async () => clickLabel('settings.open-api-keys.done'))
    expect(document.getElementById('generated-open-api-key')).toBeNull()

    await act(async () => getButton('settings-open-api-key').click())
    const dialog = document.querySelector('[role="alertdialog"]')
    if (!dialog) throw new Error('Missing confirmation dialog')
    expect(mocks.generateOpenApiKey).toHaveBeenCalledTimes(1)
    await act(async () => clickLabel('settings.open-api-keys.regenerate', dialog))
    expect(mocks.generateOpenApiKey).toHaveBeenLastCalledWith(true)
    expect((document.getElementById('generated-open-api-key') as HTMLInputElement).value).toBe(
      'example-replacement-key',
    )
  } finally {
    act(() => root.unmount())
    queryClient.clear()
    container.remove()
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
  }
})
