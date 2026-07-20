#!/usr/bin/env bun
// Gracefully quit a running Hobgoblin.app, force-killing if it doesn't respond.
// macOS-only (uses AppleScript + pgrep); on other platforms this is a no-op,
// since the install flow it serves only runs on macOS.
import { $ } from 'bun'
import { execFile } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

import { closeRunningAppWithRuntime } from './close-app-core.ts'

const APP_NAME = 'Hobgoblin'

// Match only the packaged binary launched by launchd/Finder. A loose
// pattern like `${APP_NAME}.app` would also match unrelated shells and
// tools whose argv happens to contain the path to Hobgoblin.app.
const BINARY_PATH_FRAGMENT = `/${APP_NAME}.app/Contents/MacOS/`

async function isRunning(): Promise<boolean> {
  // pgrep exits 0 when a match is found, 1 when not. Any other code is an
  // actual error (e.g. pgrep missing) — treat as "not running" to avoid
  // blocking the install flow.
  const r = await $`pgrep -f ${BINARY_PATH_FRAGMENT}`.quiet().nothrow()
  return r.exitCode === 0
}

async function requestGracefulQuit(signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    try {
      execFile('osascript', ['-e', `quit app "${APP_NAME}"`], { signal }, () => resolve())
    } catch {
      // The app may exit between detection and the quit request.
      resolve()
    }
  })
}

export async function closeRunningApp(): Promise<void> {
  await closeRunningAppWithRuntime({
    platform: process.platform,
    isRunning,
    requestGracefulQuit,
    forceQuit: async () => {
      await $`pkill -9 -f ${BINARY_PATH_FRAGMENT}`.quiet().nothrow()
    },
    sleep,
    log: console.log,
  })
}

if (import.meta.main) await closeRunningApp()
