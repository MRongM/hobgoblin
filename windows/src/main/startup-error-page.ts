interface StartupErrorPageOptions {
  phase: string
  message: string
  logPath: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildStartupErrorPageHtml({ phase, message, logPath }: StartupErrorPageOptions): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Hobgoblin startup failed</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f8; color: #1f2328; }
      main { width: min(720px, calc(100vw - 48px)); }
      h1 { font-size: 22px; margin: 0 0 12px; }
      p { line-height: 1.5; margin: 8px 0; }
      code { display: block; margin-top: 8px; padding: 10px 12px; border-radius: 6px; background: #eaecf0; overflow-wrap: anywhere; }
      @media (prefers-color-scheme: dark) {
        body { background: #161618; color: #f0f0f2; }
        code { background: #24262b; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Hobgoblin failed to start</h1>
      <p>Startup phase: <strong>${escapeHtml(phase)}</strong></p>
      <p>${escapeHtml(message)}</p>
      <p>Diagnostic log:</p>
      <code>${escapeHtml(logPath)}</code>
    </main>
  </body>
</html>`
}
