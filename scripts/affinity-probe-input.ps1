param([Parameter(Mandatory=$true)][string]$TabPrefix,[int[]]$DoubleClick,[int[]]$RightClick,[int[]]$ShiftClick,[string]$Keys)
$ErrorActionPreference='Stop'
if($Keys.Length -gt 128){throw 'Use short, completed input steps; long SendKeys queues cannot be safely interleaved with UI actions'}
foreach($point in @(@{value=$DoubleClick},@{value=$RightClick},@{value=$ShiftClick})){
 if($point.value -and $point.value.Count -ne 2){throw 'Click coordinates require two integers; invoke the script directly with @(x,y)'}
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public class ProbeInput {
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [DllImport("user32.dll")] public static extern void keybd_event(byte vk,byte scan,uint flags,UIntPtr extra);
}
'@
$process=Get-Process Affinity | Where-Object {$_.MainWindowHandle -ne 0} | Select-Object -First 1
$root=[System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
$tabs=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)))
$found=$false
foreach($tab in $tabs){
 if($tab.Current.Name.StartsWith($TabPrefix+' @')) {
  $selection=[System.Windows.Automation.SelectionItemPattern]$tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
  if($selection.Current.IsSelected){$found=$true}
 }
}
if(-not $found){throw 'Expected research tab is not active'}
[ProbeInput]::SetForegroundWindow($process.MainWindowHandle)|Out-Null
$foregroundPid=0
[ProbeInput]::GetWindowThreadProcessId([ProbeInput]::GetForegroundWindow(),[ref]$foregroundPid)|Out-Null
if($foregroundPid -ne $process.Id){
 [ProbeInput]::keybd_event(0x12,0,0,[uintptr]0);[ProbeInput]::keybd_event(0x12,0,2,[uintptr]0)
 [ProbeInput]::SetForegroundWindow($process.MainWindowHandle)|Out-Null
 [ProbeInput]::GetWindowThreadProcessId([ProbeInput]::GetForegroundWindow(),[ref]$foregroundPid)|Out-Null
 if($foregroundPid -ne $process.Id){throw 'Affinity did not receive focus; no input was sent'}
 [System.Windows.Forms.SendKeys]::SendWait('{ESC}')
}
$processCondition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty,$process.Id)
$dialogEdits=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -and $_.Current.AutomationId -in @('1001','1148')}
if($dialogEdits){throw 'A file dialog is open; refusing canvas or keyboard input'}
if($DoubleClick.Count -eq 2){
 $bounds=$root.Current.BoundingRectangle
 [ProbeInput]::SetCursorPos([int]($bounds.X+$DoubleClick[0]),[int]($bounds.Y+$DoubleClick[1]))|Out-Null
 for($i=0;$i -lt 2;$i++){[ProbeInput]::mouse_event(2,0,0,0,[uintptr]0);[ProbeInput]::mouse_event(4,0,0,0,[uintptr]0);Start-Sleep -Milliseconds 80}
}
if($Keys){[System.Windows.Forms.SendKeys]::SendWait($Keys)}
if($RightClick.Count -eq 2){
 $bounds=$root.Current.BoundingRectangle
 [ProbeInput]::SetCursorPos([int]($bounds.X+$RightClick[0]),[int]($bounds.Y+$RightClick[1]))|Out-Null
 [ProbeInput]::mouse_event(8,0,0,0,[uintptr]0);[ProbeInput]::mouse_event(16,0,0,0,[uintptr]0)
}
if($ShiftClick.Count -eq 2){
 $bounds=$root.Current.BoundingRectangle
 [ProbeInput]::SetCursorPos([int]($bounds.X+$ShiftClick[0]),[int]($bounds.Y+$ShiftClick[1]))|Out-Null
 [ProbeInput]::keybd_event(0x10,0,0,[uintptr]0)
 try { [ProbeInput]::mouse_event(2,0,0,0,[uintptr]0);[ProbeInput]::mouse_event(4,0,0,0,[uintptr]0) }
 finally { [ProbeInput]::keybd_event(0x10,0,2,[uintptr]0) }
}
