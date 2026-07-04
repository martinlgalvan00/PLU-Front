#Requires -Version 5.1
<#
.SYNOPSIS
  Avisa si hay commits locales sin pushear al remoto.

.EXAMPLE
  .\scripts\check-unpushed-commits.ps1 -Notify

.EXAMPLE
  .\scripts\check-unpushed-commits.ps1 -QuietIfClean
  Exit 0 si no hay nada pendiente; exit 1 si hay commits sin push.

  Programar cada 30 min (Task Scheduler):
  powershell -NoProfile -ExecutionPolicy Bypass -File "RUTA\scripts\check-unpushed-commits.ps1" -Notify -QuietIfClean
#>
param(
  [switch]$Notify,
  [switch]$QuietIfClean,
  [string]$RepoPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-RepoRoot {
  param([string]$StartPath)

  if ($StartPath) {
    Push-Location $StartPath
  }

  try {
    $root = git rev-parse --show-toplevel 2>$null
    if (-not $root) {
      throw 'No estás en un repositorio git.'
    }
    return (Resolve-Path $root).Path
  }
  finally {
    if ($StartPath) {
      Pop-Location
    }
  }
}

function Get-AheadCount {
  param(
    [string]$Branch,
    [string]$Upstream
  )

  if ($Upstream) {
    $count = git rev-list --count "$Upstream..HEAD" 2>$null
    if ($LASTEXITCODE -eq 0) {
      return [int]$count
    }
  }

  $remoteRef = "origin/$Branch"
  git rev-parse --verify $remoteRef 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $count = git rev-list --count "$remoteRef..HEAD" 2>$null
    if ($LASTEXITCODE -eq 0) {
      return [int]$count
    }
  }

  return $null
}

function Show-Alert {
  param(
    [string]$Title,
    [string]$Message
  )

  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      $Title,
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
  }
  catch {
    Write-Warning $Message
  }
}

$repoRoot = Resolve-RepoRoot -StartPath $RepoPath
Push-Location $repoRoot

try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if ($branch -eq 'HEAD') {
    Write-Host 'Estás en detached HEAD; no se puede evaluar push pendiente.'
    exit 0
  }

  $upstream = git rev-parse --abbrev-ref '@{u}' 2>$null
  if ($LASTEXITCODE -ne 0) {
    $upstream = $null
  }

  $ahead = Get-AheadCount -Branch $branch -Upstream $upstream

  if ($null -eq $ahead) {
    $message = @(
      "Rama: $branch"
      ''
      'No hay rama remota de seguimiento configurada.'
      "Si ya commiteaste, publicá con:"
      "  git push -u origin $branch"
    ) -join "`n"

    if ($Notify) {
      Show-Alert -Title 'Git — falta push' -Message $message
    }
    else {
      Write-Host $message
    }
    exit 1
  }

  if ($ahead -le 0) {
    if (-not $QuietIfClean) {
      Write-Host "OK: no hay commits pendientes de push en '$branch'."
    }
    exit 0
  }

  $commitWord = if ($ahead -eq 1) { 'commit' } else { 'commits' }
  $pushTarget = if ($upstream) { $upstream } else { "origin/$branch" }

  $message = @(
    "Tenés $ahead $commitWord sin pushear."
    ''
    "Rama: $branch"
    "Remoto: $pushTarget"
    ''
    'Ejecutá:'
    '  git push'
  ) -join "`n"

  if ($Notify) {
    Show-Alert -Title 'Git — push pendiente' -Message $message
  }
  else {
    Write-Host $message
  }

  exit 1
}
finally {
  Pop-Location
}
