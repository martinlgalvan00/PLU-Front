#Requires -Version 5.1
<#
.SYNOPSIS
  Instala el hook post-commit que avisa cuando hay commits sin push.
#>
$ErrorActionPreference = 'Stop'

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
  Write-Error 'Ejecutá este script desde la raíz de un repo git.'
}

$repoRoot = (Resolve-Path $repoRoot).Path
$sourceHook = Join-Path $repoRoot 'scripts/git-hooks/post-commit'
$targetHook = Join-Path $repoRoot '.git/hooks/post-commit'

if (-not (Test-Path $sourceHook)) {
  Write-Error "No se encontró $sourceHook"
}

Copy-Item -Path $sourceHook -Destination $targetHook -Force

# Git en Windows necesita hooks ejecutables (best effort)
if (Get-Command chmod -ErrorAction SilentlyContinue) {
  chmod +x $targetHook
}

Write-Host 'Listo: hook post-commit instalado.'
Write-Host ''
Write-Host 'Cada vez que tu amigo haga commit, va a ver un popup si hay push pendiente.'
Write-Host ''
Write-Host 'Probar manualmente:'
Write-Host "  powershell -File `"$repoRoot/scripts/check-unpushed-commits.ps1`" -Notify"
Write-Host ''
Write-Host 'Opcional — recordatorio cada 30 min (Task Scheduler):'
Write-Host "  schtasks /create /tn GitPushReminder /tr `"powershell -NoProfile -ExecutionPolicy Bypass -File `"$repoRoot/scripts/check-unpushed-commits.ps1`" -Notify -QuietIfClean`" /sc minute /mo 30 /f"
