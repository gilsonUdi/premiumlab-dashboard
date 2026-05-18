param(
  [string]$TaskName = "Premium Firebird Supabase Sync",
  [string]$ProjectDir = $PSScriptRoot
)

$incrementalScript = Join-Path $ProjectDir "run-incremental-sync.ps1"
$weeklyScript = Join-Path $ProjectDir "run-weekly-sync.ps1"
$logDir = Join-Path $ProjectDir "logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$incrementalAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$incrementalScript`"" `
  -WorkingDirectory $ProjectDir

$weeklyAction = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$weeklyScript`"" `
  -WorkingDirectory $ProjectDir

$incrementalTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 15) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$weeklyTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) `
  -RepetitionInterval (New-TimeSpan -Days 7) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName "$TaskName - Incremental" `
  -Action $incrementalAction `
  -Trigger $incrementalTrigger `
  -Settings $settings `
  -Description "Sincroniza Firebird com Supabase a cada 15 minutos (janela de 7 dias)." `
  -Force | Out-Null

Register-ScheduledTask `
  -TaskName "$TaskName - Semanal" `
  -Action $weeklyAction `
  -Trigger $weeklyTrigger `
  -Settings $settings `
  -Description "Sincroniza Firebird com Supabase e rebuilda caches uma vez por semana (janela de 90 dias)." `
  -Force | Out-Null

Write-Host "Tarefas criadas:"
Write-Host " - $TaskName - Incremental"
Write-Host " - $TaskName - Semanal"
Write-Host "Diretorio: $ProjectDir"
