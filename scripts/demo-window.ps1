param([Parameter(Mandatory=$true)][int]$ProcessId,[int]$X=760,[int]$Y=180,[int]$Width=1920,[int]$Height=1080,[switch]$Focus,[switch]$Topmost,[string]$Screenshot,[string]$Keys)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;using System.Runtime.InteropServices;
public class DemoWindow {
 public delegate bool EnumProc(IntPtr h,IntPtr p);
 [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc proc,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,System.Text.StringBuilder text,int n);
 [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
 [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int cmd);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
}
'@
[DemoWindow]::SetProcessDPIAware()|Out-Null
$targetProcess=Get-Process -Id $ProcessId
if($targetProcess.ProcessName -notin @('Obsidian','Affinity','obs64')){throw 'Only demo applications can be positioned'}
$h=$targetProcess.MainWindowHandle
if($h -eq 0){
 $script:demoHandle=[intptr]::Zero
 [DemoWindow]::EnumWindows({param($candidate,$unused)
   $ownerId=0;[DemoWindow]::GetWindowThreadProcessId($candidate,[ref]$ownerId)|Out-Null
   if($ownerId -eq $ProcessId){$title=New-Object Text.StringBuilder 512;[DemoWindow]::GetWindowText($candidate,$title,512)|Out-Null;if($title.ToString() -match 'Obsidian|vault|Academic Editor|OBS Studio|OBS 32'){$script:demoHandle=$candidate}}
   return $true
 },[intptr]::Zero)|Out-Null
 $h=$script:demoHandle
}
if($h -eq 0){throw 'Application has no main window'}
[DemoWindow]::ShowWindow($h,9)|Out-Null
$order=if($Topmost){[intptr](-1)}else{[intptr](-2)}
[DemoWindow]::SetWindowPos($h,$order,$X,$Y,$Width,$Height,0)|Out-Null
if($Focus -or $Keys){[DemoWindow]::SetForegroundWindow($h)|Out-Null}
if($Keys){
 $focusPid=0;[DemoWindow]::GetWindowThreadProcessId([DemoWindow]::GetForegroundWindow(),[ref]$focusPid)|Out-Null
 if($focusPid -ne $ProcessId){throw 'Expected application is not foreground; no input sent'}
 [System.Windows.Forms.SendKeys]::SendWait($Keys)
}
if($Screenshot){
 $out=$ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Screenshot)
 $bmp=New-Object Drawing.Bitmap($Width,$Height);$g=[Drawing.Graphics]::FromImage($bmp)
 try{$g.CopyFromScreen($X,$Y,0,0,$bmp.Size);$bmp.Save($out)}finally{$g.Dispose();$bmp.Dispose()}
}
[pscustomobject]@{ProcessId=$ProcessId;Name=$targetProcess.ProcessName;Title=$targetProcess.MainWindowTitle;Bounds=@($X,$Y,$Width,$Height)}|ConvertTo-Json -Compress
