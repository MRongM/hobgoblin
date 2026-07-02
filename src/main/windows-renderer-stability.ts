interface ElectronCommandLine {
  appendSwitch(name: string, value?: string): void
}

interface ElectronAppLike {
  isPackaged: boolean
  commandLine: ElectronCommandLine
}

interface WindowsRendererStabilityInput {
  isPackaged: boolean
  platform: NodeJS.Platform
}

interface WindowsRendererStabilityConfig {
  disabledFeatures: string[]
  rendererSandbox: boolean
}

export function windowsRendererStabilityConfig({
  isPackaged,
  platform,
}: WindowsRendererStabilityInput): WindowsRendererStabilityConfig {
  if (platform !== 'win32' || !isPackaged) {
    return { disabledFeatures: [], rendererSandbox: true }
  }
  return {
    disabledFeatures: ['RendererCodeIntegrity'],
    rendererSandbox: false,
  }
}

export function shouldUseRendererSandbox(input: WindowsRendererStabilityInput): boolean {
  return windowsRendererStabilityConfig(input).rendererSandbox
}

export function configureWindowsRendererProcessStability(
  app: ElectronAppLike,
  platform: NodeJS.Platform = process.platform,
): WindowsRendererStabilityConfig {
  const config = windowsRendererStabilityConfig({ isPackaged: app.isPackaged, platform })
  if (config.disabledFeatures.length > 0) {
    app.commandLine.appendSwitch('disable-features', config.disabledFeatures.join(','))
  }
  return config
}
