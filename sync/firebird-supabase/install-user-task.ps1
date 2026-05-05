param(
  [string]$TaskName = "Premium Firebird Supabase Sync",
  [string]$ProjectDir = $PSScriptRoot
)

$node = (Get-Command node -ErrorAction Stop).Source
$script = Join-Path $ProjectDir "sync.js"
$logDir = Join-Path $ProjectDir "logs"

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$action = New-ScheduledTaskAction `
  -Execute $node `
  -Argument "`"$script`" >> `"$logDir\scheduled-task.log`" 2>&1" `
  -WorkingDirectory $ProjectDir

$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 10) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Description "Sincroniza Firebird com Supabase a cada 10 minutos (janela de 3 meses)." `
  -Force | Out-Null

Write-Host "Tarefa criada: $TaskName"
Write-Host "Diretorio: $ProjectDir"
