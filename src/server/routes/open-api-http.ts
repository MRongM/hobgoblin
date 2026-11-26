import type { Context, MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import * as v from 'valibot'
import { CONVERSATION_REQUEST_MAX_BYTES } from '#/server/modules/conversation-open-api-model.ts'
import type { OpenApiKeyStore } from '#/server/modules/open-api-key-source.ts'
import type { TerminalOpenApiControlResult } from '#/server/terminal/terminal-open-api-control.ts'

export const terminalControlMessages: Record<Extract<TerminalOpenApiControlResult, { ok: false }>['reason'], string> = {
  session_unavailable: 'The terminal session is unavailable',
  control_in_use: 'Another API client already controls this terminal',
  control_lost: 'Terminal control expired or was taken back',
  request_conflict: 'This request ID has already been used for different input',
  control_limit: 'The terminal input request limit has been reached',
  interactive_input_active: 'A desktop or Web client recently sent input to this terminal',
  input_delivery_unknown: 'Terminal input delivery could not be confirmed',
}

export function errorResponse(
  c: Context,
  status: 400 | 401 | 404 | 409 | 413 | 415 | 500 | 503,
  code: string,
  message: string,
) {
  return c.json({ error: { code, message } }, status)
}

export async function readBody<T extends v.GenericSchema>(c: Context, schema: T): Promise<v.InferOutput<T> | Response> {
  const contentType = c.req.header('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') {
    return errorResponse(c, 415, 'unsupported_media_type', 'Content-Type must be application/json')
  }
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return errorResponse(c, 400, 'invalid_json', 'Request body must be valid JSON')
  }
  const result = v.safeParse(schema, body)
  if (!result.success) {
    const field = result.issues[0]?.path?.[0]?.key
    const message =
      typeof field === 'string' && /^[a-zA-Z]{1,32}$/.test(field) ? `Invalid field: ${field}` : 'Invalid request fields'
    return errorResponse(c, 400, 'invalid_request', message)
  }
  return result.output
}

export const limitBody = bodyLimit({
  maxSize: CONVERSATION_REQUEST_MAX_BYTES,
  onError: (c) => errorResponse(c, 413, 'payload_too_large', 'Request body is too large'),
})

export function requireBearer(keys: OpenApiKeyStore, requireTerminalControl = false): MiddlewareHandler {
  return async (c, next) => {
    const supplied = /^Bearer +([^\s]+)$/i.exec(c.req.header('Authorization') ?? '')?.[1]
    const auth = keys.authorize(supplied, requireTerminalControl)
    if (auth === 'disabled') {
      return requireTerminalControl
        ? errorResponse(c, 503, 'terminal_control_disabled', 'OpenAPI terminal control is disabled')
        : errorResponse(c, 503, 'open_api_disabled', 'Conversation OpenAPI is disabled')
    }
    if (auth === 'unauthorized') {
      c.header('WWW-Authenticate', 'Bearer')
      return errorResponse(c, 401, 'unauthorized', 'Missing or invalid bearer token')
    }
    return next()
  }
}
