import { beforeEach, describe, expect, test, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  serverDataDir: vi.fn(),
  getServerSettingsPrefs: vi.fn(),
  openInPreferredEditor: vi.fn(),
}))

vi.mock('#/server/common/data-dir.ts', () => ({
  serverDataDir: mocks.serverDataDir,
}))

vi.mock('#/server/modules/settings-source.ts', () => ({
  getServerSettingsPrefs: mocks.getServerSettingsPrefs,
}))

vi.mock('#/system/editors.ts', () => ({
  openInPreferredEditor: mocks.openInPreferredEditor,
}))

describe('settings external actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('opens the fixed application data directory in the configured editor', async () => {
    mocks.serverDataDir.mockReturnValue('/app-data')
    mocks.getServerSettingsPrefs.mockResolvedValue({ editorApp: 'cursor' })
    mocks.openInPreferredEditor.mockResolvedValue({ ok: true, message: '' })

    const { openAppConfigDirectoryInEditor } = await import('#/server/modules/settings-external-actions.ts')

    await expect(openAppConfigDirectoryInEditor()).resolves.toEqual({ ok: true, message: '' })
    expect(mocks.openInPreferredEditor).toHaveBeenCalledWith('/app-data', 'cursor')
  })
})
