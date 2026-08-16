import type { BrowserWindow } from 'electron'
import type { RpcEvent } from '#/shared/rpc.ts'
import type { RendererEffectIntent } from '#/shared/renderer-effect-intents.ts'
import { broadcastToSurfaceCapability, sendToRegisteredWindow } from '#/main/window-registry.ts'
import { RENDERER_EFFECT_INTENT_CHANNEL, RPC_EVENT_CHANNEL } from '#/shared/ipc-channels.ts'

// Native-host downstream messages into trusted renderer surfaces. Server-owned
// realtime (terminal + invalidation) continues to flow over /ws instead.
export function broadcastRpcEvent(event: RpcEvent): void {
  broadcastToSurfaceCapability('rpcBroadcast', RPC_EVENT_CHANNEL, [event])
}

export function broadcastRendererEffectIntent(intent: RendererEffectIntent): void {
  broadcastToSurfaceCapability('rpcBroadcast', RENDERER_EFFECT_INTENT_CHANNEL, [intent])
}

export function sendRendererEffectIntent(win: BrowserWindow | null | undefined, intent: RendererEffectIntent): void {
  sendToRegisteredWindow(win, RENDERER_EFFECT_INTENT_CHANNEL, [intent])
}
