interface ChromiumCommandLine {
  appendSwitch(name: string): void
}

export function configureChromiumKeychainPolicy(commandLine: ChromiumCommandLine, platform: NodeJS.Platform): void {
  if (platform !== 'darwin') return
  commandLine.appendSwitch('use-mock-keychain')
}
