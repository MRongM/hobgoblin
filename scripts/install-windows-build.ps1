[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateScript({ Test-Path -LiteralPath $_ -PathType Leaf })]
  [string] $InstallerPath,

  [Parameter(Mandatory = $true)]
  [string] $InstalledAppPath,

  [Parameter(Mandatory = $true)]
  [string] $LogPath,

  [ValidateRange(0, 300)]
  [int] $DelaySeconds = 5,

  [switch] $SkipRelaunch
)

$ErrorActionPreference = 'Stop'
$logDirectory = Split-Path -Parent $LogPath
if ($logDirectory) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
}

Start-Sleep -Seconds $DelaySeconds

try {
  $installer = Start-Process -FilePath $InstallerPath -ArgumentList '/S' -Wait -PassThru
  $message = "$(Get-Date -Format o) exit=$($installer.ExitCode)"
  Set-Content -LiteralPath $LogPath -Value $message -Encoding UTF8

  if ($installer.ExitCode -ne 0) {
    throw "Windows installer exited with code $($installer.ExitCode)."
  }

  if (-not $SkipRelaunch) {
    if (-not (Test-Path -LiteralPath $InstalledAppPath -PathType Leaf)) {
      throw "Installed application is missing: $InstalledAppPath"
    }
    Start-Sleep -Seconds 2
    Start-Process -FilePath $InstalledAppPath | Out-Null
  }
}
catch {
  $message = "$(Get-Date -Format o) error=$($_.Exception.Message)"
  Add-Content -LiteralPath $LogPath -Value $message -Encoding UTF8
  throw
}
