import { execa } from 'execa'
import { resolveUsableWindowsWslExecutable } from '#/shared/windows-wsl.ts'

export async function listWindowsWslDistributions(signal?: AbortSignal): Promise<string[]> {
  const executable = resolveUsableWindowsWslExecutable()
  if (!executable || signal?.aborted) return []
  try {
    const { stdout } = await execa(executable, ['--list', '--quiet'], {
      encoding: 'utf16le',
      env: { ...process.env, WSL_UTF8: '0' },
      timeout: 5_000,
      cancelSignal: signal,
      forceKillAfterDelay: 500,
      windowsHide: true,
    })
    return Array.from(
      new Set(
        stdout
          .replaceAll('\0', '')
          .split(/\r?\n/u)
          .map((name) => name.trim())
          .filter(Boolean),
      ),
    )
  } catch {
    return []
  }
}
