import type { NativeRpcHandlers } from '#/shared/rpc.ts'
import { applyNativeHostShellProjection } from '#/main/native-host-settings-effects.ts'

// Native-host settings RPC handlers apply Electron-only projections of
// server-owned state. Preferences themselves remain on the server path.

export function createNativeHostSettingsRpcHandlers(): Pick<NativeRpcHandlers, 'settings'> {
  return {
    settings: {
      applyShellProjection: async (input) => await applyNativeHostShellProjection(input),
    },
  }
}
