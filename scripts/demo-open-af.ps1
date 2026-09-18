param([Parameter(Mandatory=$true)][string]$Path)
$ErrorActionPreference='Stop'
$candidate=(Resolve-Path -LiteralPath $Path).Path
$allowed=(Resolve-Path -LiteralPath 'test-artifacts/launch-media').Path+[IO.Path]::DirectorySeparatorChar
if(-not $candidate.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetExtension($candidate) -ne '.af'){throw 'Only a generated launch demo can be opened by this helper'}
Start-Process -FilePath $candidate -WindowStyle Hidden
Add-Type -AssemblyName UIAutomationClient
$prefix=[IO.Path]::GetFileNameWithoutExtension($candidate)+' @'
for($attempt=0;$attempt -lt 30;$attempt++){
 $process=Get-Process Affinity | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
 if($process){
  $root=[System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
  $tabs=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)))
  foreach($tab in $tabs){if($tab.Current.Name.StartsWith($prefix)){ $selection=[System.Windows.Automation.SelectionItemPattern]$tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern);$selection.Select();if($selection.Current.IsSelected){'Selected generated document: '+$tab.Current.Name;return}}}
 }
 Start-Sleep -Milliseconds 200
}
throw 'Generated Affinity document did not become the selected tab'
