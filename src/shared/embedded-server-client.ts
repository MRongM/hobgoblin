export interface EmbeddedServerRuntime {
  url: string
  secret: string
}

export async function requestEmbeddedServerJson<T>(
  runtime: EmbeddedServerRuntime,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(new URL(path, runtime.url).toString(), {
    ...init,
    headers: {
      'x-goblin-internal-secret': runtime.secret,
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) throw new Error(`Embedded server request failed (${response.status})`)
  return (await response.json()) as T
}
