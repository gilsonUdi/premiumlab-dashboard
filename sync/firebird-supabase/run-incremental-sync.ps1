param(
  [string]$ProjectDir = $PSScriptRoot
)

$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $ProjectDir "sync.js"
$logDir = Join-Path $ProjectDir "logs"
$logFile = Join-Path $logDir "scheduled-task-incremental.log"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Add-Content -Path $logFile -Value "=== [$stamp] Sync incremental (ultimos 30 dias) ==="
Push-Location $ProjectDir
try {
  & $node $script --refresh-recent-days 30 >> $logFile 2>&1
} finally {
  Pop-Location
}
