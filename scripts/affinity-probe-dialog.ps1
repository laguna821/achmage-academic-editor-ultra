param([string]$Button,[string]$Id,[string]$InputFile,[switch]$Tree,[switch]$Screenshot,[string]$Output,[string]$WindowName)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
$afProbe=Get-Process Affinity | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
if(-not $afProbe){throw 'Affinity is not open'}
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$afProbe.Id)
$nodes=@([System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,$condition) | ForEach-Object { $_; $_.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) })
if($InputFile){
 $source=(Resolve-Path -LiteralPath $InputFile).Path
 $allowed=(Resolve-Path 'test-artifacts/journal/update-3.2.0').Path+[IO.Path]::DirectorySeparatorChar
 if(-not $source.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Only generated research assets can be opened'}
 $edits=@($nodes | Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $_.Current.AutomationId -in @('1001','1148')})
 if($edits.Count -ne 1){throw 'Expected one file-name edit'}
 ([System.Windows.Automation.ValuePattern]$edits[0].GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue($source)
 $Button='열기(O)'
}
if($Tree){
 $nodes | Where-Object {$_.Current.Name -or $_.Current.AutomationId} | ForEach-Object {
  [pscustomobject]@{Name=$_.Current.Name;Type=$_.Current.ControlType.ProgrammaticName;Id=$_.Current.AutomationId;Enabled=$_.Current.IsEnabled}
 } | ConvertTo-Json -Depth 3
}
if($Button -or $Id){
 $matches=@($nodes | Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and (($Button -and $_.Current.Name -eq $Button) -or ($Id -and $_.Current.AutomationId -eq $Id))})
 if($matches.Count -ne 1){throw "Expected one matching button, found $($matches.Count)"}
 if(-not $matches[0].Current.IsEnabled){throw 'Dialog button is disabled'}
 ([System.Windows.Automation.InvokePattern]$matches[0].GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
}
if($Screenshot){
 if(-not $Output){throw 'Screenshot requires Output'}
 $target=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
 $allowed=(Resolve-Path 'test-artifacts/journal/update-3.2.0').Path+[IO.Path]::DirectorySeparatorChar
 if(-not $target.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $target)){throw 'Screenshot must be new research evidence'}
 Add-Type -AssemblyName System.Drawing
 if(-not $WindowName){throw 'Screenshot requires an exact dialog title'}
 $root=$nodes | Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window -and $_.Current.Name -eq $WindowName} | Select-Object -First 1
 if(-not $root){throw 'Expected dialog not found'}
 $bounds=$root.Current.BoundingRectangle
 $x=[Math]::Max(0,[int]$bounds.X);$y=[Math]::Max(0,[int]$bounds.Y)
 $bitmap=New-Object Drawing.Bitmap([int]$bounds.Width,[int]$bounds.Height)
 $graphics=[Drawing.Graphics]::FromImage($bitmap)
 try {$graphics.CopyFromScreen($x,$y,0,0,$bitmap.Size);$bitmap.Save($target)}
 finally {$graphics.Dispose();$bitmap.Dispose()}
}
