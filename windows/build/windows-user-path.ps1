[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Add', 'Remove')]
  [string] $Action,

  [Parameter(Mandatory = $true)]
  [ValidateNotNullOrEmpty()]
  [string] $Entry,

  [switch] $TransformOnly,

  [Parameter()]
  [AllowEmptyString()]
  [string] $PathValue = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function ConvertTo-ComparablePathEntry([string] $Value) {
  $normalized = $Value.Trim().Trim('"').Replace('/', '\')
  while ($normalized.Length -gt 3 -and $normalized.EndsWith('\')) {
    $normalized = $normalized.Substring(0, $normalized.Length - 1)
  }
  return $normalized
}

function Update-PathValue(
  [string] $RequestedAction,
  [string] $RequestedEntry,
  [AllowEmptyString()] [string] $CurrentValue
) {
  $target = ConvertTo-ComparablePathEntry $RequestedEntry
  if ([string]::IsNullOrWhiteSpace($target)) {
    throw 'PATH entry must not be empty.'
  }

  $segments = if ($CurrentValue.Length -eq 0) { @() } else { @($CurrentValue -split ';') }
  $matchingSegments = @(
    $segments | Where-Object {
      [string]::Equals(
        (ConvertTo-ComparablePathEntry $_),
        $target,
        [StringComparison]::OrdinalIgnoreCase
      )
    }
  )

  if ($RequestedAction -eq 'Add') {
    if ($matchingSegments.Count -gt 0) {
      return [pscustomobject]@{ Changed = $false; Value = $CurrentValue }
    }

    $separator = if ($CurrentValue.Length -eq 0 -or $CurrentValue.EndsWith(';')) { '' } else { ';' }
    return [pscustomobject]@{ Changed = $true; Value = "$CurrentValue$separator$RequestedEntry" }
  }

  if ($matchingSegments.Count -eq 0) {
    return [pscustomobject]@{ Changed = $false; Value = $CurrentValue }
  }

  $remaining = @(
    $segments | Where-Object {
      -not [string]::Equals(
        (ConvertTo-ComparablePathEntry $_),
        $target,
        [StringComparison]::OrdinalIgnoreCase
      )
    }
  )
  return [pscustomobject]@{ Changed = $true; Value = [string]::Join(';', $remaining) }
}

try {
  $currentPath = if ($TransformOnly) {
    $PathValue
  } else {
    [Environment]::GetEnvironmentVariable('Path', [EnvironmentVariableTarget]::User)
  }
  if ($null -eq $currentPath) {
    $currentPath = ''
  }

  $result = Update-PathValue $Action $Entry $currentPath
  if ($TransformOnly) {
    $result | ConvertTo-Json -Compress
    exit 0
  }

  if (-not $result.Changed) {
    exit 10
  }

  [Environment]::SetEnvironmentVariable('Path', $result.Value, [EnvironmentVariableTarget]::User)
  exit 0
} catch {
  [Console]::Error.WriteLine("hob PATH update failed: $($_.Exception.Message)")
  exit 1
}
