import type { RpcEvent } from '#/shared/rpc.ts'
import type { RendererEffectIntent } from '#/shared/renderer-effect-intents.ts'
import { getRendererBridge } from '#/web/renderer-bridge.ts'

// Native-host ingress for Electron renderers. Keep this separate from server
// ingress modules so browser- and Electron-owned downlinks stay explicit.
type NativeHostEventType = RpcEvent['type']

export function subscribeNativeHostEventType<TType extends NativeHostEventType>(
  type: TType,
  cb: (event: Extract<RpcEvent, { type: TType }>) => void,
): () => void {
  return getRendererBridge().onRpcEvent((event) => {
    if (event.type === type) cb(event as Extract<RpcEvent, { type: TType }>)
  })
}

export function subscribeRendererEffectIntent(cb: (event: RendererEffectIntent) => void): () => void {
  return getRendererBridge().onEffectIntent(cb)
}
