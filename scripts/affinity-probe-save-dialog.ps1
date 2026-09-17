param([Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
$probeRoot=[IO.Path]::GetFullPath((Join-Path (Get-Location) 'test-artifacts/journal/update-3.2.0'))
$probeTarget=[IO.Path]::GetFullPath($Target)
if(-not $probeTarget.StartsWith($probeRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Probe output must stay in update-3.2.0 artifacts'}
if(Test-Path -LiteralPath $probeTarget){throw 'Refusing to overwrite prior evidence'}
$affinityProcess=Get-Process Affinity | Select-Object -First 1
if(-not $affinityProcess){throw 'Affinity is not running'}
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$affinityProcess.Id)
for($attempt=0;$attempt -lt 5;$attempt++) {
 try { $nodes=@([System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition) | ForEach-Object { $_; $_.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) }) }
 catch { Start-Sleep -Milliseconds 250; continue }
 $edit=$nodes | Where-Object {$_.Current.AutomationId -eq '1001' -and $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Edit'} | Select-Object -First 1
 $save=$nodes | Where-Object {$_.Current.Name -eq '저장(S)' -and $_.Current.ControlType.ProgrammaticName -eq 'ControlType.Button'} | Select-Object -First 1
 if($edit -and $save){break}
 Start-Sleep -Milliseconds 250
}
if(-not $edit -or -not $save){throw 'Expected native Save As dialog not found'}
([System.Windows.Automation.ValuePattern]$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue($probeTarget)
([System.Windows.Automation.InvokePattern]$save.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
Write-Output $probeTarget
