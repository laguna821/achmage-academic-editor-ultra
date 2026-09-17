param([string]$Screenshot,[string]$Invoke,[string]$Expand,[switch]$Tree,[switch]$Scripts,[int[]]$Click)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
$process = Get-Process Affinity | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if (-not $process) { throw 'Affinity window is not open' }
$uiRoot=[System.Windows.Automation.AutomationElement]::FromHandle($process.MainWindowHandle)
if ($Scripts) {
 $uiRoot=$uiRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition) | Where-Object {$_.Current.Name -like 'StudioFloatSite*'} | Select-Object -First 1
 if(-not $uiRoot){throw 'Scripts panel is not open'}
}
if($Click.Count -eq 2){
 Add-Type @'
using System;using System.Runtime.InteropServices;public class HMClick { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);[DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);[DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); }
'@
 $bounds=$uiRoot.Current.BoundingRectangle
 [HMClick]::SetForegroundWindow([intptr]$uiRoot.Current.NativeWindowHandle)|Out-Null
 [HMClick]::SetCursorPos([int]($bounds.X+$Click[0]),[int]($bounds.Y+$Click[1]))|Out-Null
 [HMClick]::mouse_event(2,0,0,0,[uintptr]0);[HMClick]::mouse_event(4,0,0,0,[uintptr]0)
}
foreach ($name in @($Invoke,$Expand)) {
 if (-not $name) { continue }
 $condition=New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)
 $node=$uiRoot.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
 if (-not $node) { throw "UI element not found: $name" }
 if ($Invoke) { ([System.Windows.Automation.InvokePattern]$node.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke() }
 else { ([System.Windows.Automation.ExpandCollapsePattern]$node.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern)).Expand() }
}
if ($Tree) {
 $nodes=$uiRoot.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 foreach ($n in $nodes) { if ($n.Current.Name) { [pscustomobject]@{Name=$n.Current.Name;Type=$n.Current.ControlType.ProgrammaticName;Id=$n.Current.AutomationId} } }
}
if ($Screenshot) {
 Add-Type -AssemblyName System.Drawing
 Add-Type @'
using System;using System.Runtime.InteropServices;
public class HMWindow { [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h,IntPtr dc,uint flags); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r); public struct RECT { public int L,T,R,B; } }
'@
 $handle=[intptr]$uiRoot.Current.NativeWindowHandle
 $r=New-Object HMWindow+RECT;[HMWindow]::GetWindowRect($handle,[ref]$r)|Out-Null
 $bitmap=New-Object Drawing.Bitmap(($r.R-$r.L),($r.B-$r.T));$g=[Drawing.Graphics]::FromImage($bitmap);$dc=$g.GetHdc()
 try { [HMWindow]::PrintWindow($handle,$dc,2)|Out-Null } finally { $g.ReleaseHdc($dc) }
 $bitmap.Save($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Screenshot));$g.Dispose();$bitmap.Dispose()
}
