param(
  [string]$ProjectDir = $PSScriptRoot
)

$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $ProjectDir "sync.js"
$logDir = Join-Path $ProjectDir "logs"
$logFile = Join-Path $logDir "scheduled-task-weekly.log"
$fromDate = (Get-Date).AddDays(-90).ToString("yyyy-MM-dd")

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "=== [$stamp] Sync semanal completo (ultimos 90 dias) ==="
Push-Location $ProjectDir
try {
  & $node $script --refresh-recent-days 90 >> $logFile 2>&1
  & $node $script --cache-only --cache-from-date $fromDate >> $logFile 2>&1
} finally {
  Pop-Location
}
