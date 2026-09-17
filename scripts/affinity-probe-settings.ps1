param([string]$WindowName='내보내기',[int[]]$Click,[Nullable[double]]$ScrollPercent,[string]$ComboId,[Nullable[int]]$SelectIndex)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
$process=Get-Process Affinity | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
if(-not $process){throw 'Affinity is not open'}
$condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$process.Id)
$nodes=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
$windows=@($nodes | Where-Object {$_.Current.Name -eq $WindowName -and $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Window})
if($windows.Count -ne 1){throw 'Expected one named Affinity dialog'}
$dialog=$windows[0]
if($Click.Count){
 if($Click.Count -ne 2){throw 'Expected dialog-relative X and Y'}
 $bounds=$dialog.Current.BoundingRectangle
 if($Click[0] -lt 0 -or $Click[1] -lt 0 -or $Click[0] -ge $bounds.Width -or $Click[1] -ge $bounds.Height){throw 'Point is outside the observed dialog'}
 Add-Type @'
using System;using System.Runtime.InteropServices;
public class HMSettingsClick { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e); }
'@
 [HMSettingsClick]::SetCursorPos([int]($bounds.X+$Click[0]),[int]($bounds.Y+$Click[1]))|Out-Null
 [HMSettingsClick]::mouse_event(2,0,0,0,[uintptr]0);[HMSettingsClick]::mouse_event(4,0,0,0,[uintptr]0)
}
if($null -ne $ScrollPercent){
 if($ScrollPercent -lt 0 -or $ScrollPercent -gt 100){throw 'Invalid scroll percentage'}
 $bars=@($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,'PART_VerticalScrollBar'))))
 if($bars.Count -ne 1){throw 'Expected one dialog scrollbar'}
 $range=[System.Windows.Automation.RangeValuePattern]$bars[0].GetCurrentPattern([System.Windows.Automation.RangeValuePattern]::Pattern)
 $range.SetValue($range.Current.Minimum+($range.Current.Maximum-$range.Current.Minimum)*$ScrollPercent/100)
}
if($ComboId){
 $combos=@($dialog.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty,$ComboId))))
 if($combos.Count -ne 1){throw 'Expected one observed combo'}
 $combo=$combos[0]
 ([System.Windows.Automation.ExpandCollapsePattern]$combo.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand()
 $items=@($combo.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::ListItem))))
 if($null -ne $SelectIndex){
  if($SelectIndex -lt 0 -or $SelectIndex -ge $items.Count){throw 'Invalid observed option index'}
  ([System.Windows.Automation.SelectionItemPattern]$items[$SelectIndex].GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Select()
 } else {
  $items | ForEach-Object { [pscustomobject]@{Name=$_.Current.Name;Bounds=$_.Current.BoundingRectangle.ToString();Selected=([System.Windows.Automation.SelectionItemPattern]$_.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)).Current.IsSelected} } | ConvertTo-Json
 }
}
