# 好价监控 · 托盘外壳
# 由 start-tray.bat 以 start /min 方式拉起，启动后立即把自己的控制台藏掉。
# 每一步写 data\tray.log，出问题看那个文件，不靠黑窗口回话。

$ErrorActionPreference = 'Stop'

$script:root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:dataDir = Join-Path $script:root 'data'
if (-not (Test-Path $script:dataDir)) { New-Item -ItemType Directory -Path $script:dataDir -Force | Out-Null }
$script:outLog = Join-Path $script:dataDir 'run.log'
$script:errLog = Join-Path $script:dataDir 'run.err.log'
$script:trayLog = Join-Path $script:dataDir 'tray.log'
$script:pidFile = Join-Path $script:dataDir 'tray.pid'
$script:url = 'http://localhost:7788'
$script:proc = $null
$script:up = $false

# 藏掉自己的控制台窗口。bat 用 start /min 拉起（带 -WindowStyle Hidden 会被系统
# 拒绝，errorlevel 786 / 0x80070312），窗口先以最小化形式存在，这里直接隐藏。
try {
  Add-Type -Namespace Win32 -Name ConsoleWin -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
  $h = [Win32.ConsoleWin]::GetConsoleWindow()
  if ($h -ne [IntPtr]::Zero) { [void][Win32.ConsoleWin]::ShowWindow($h, 0) }
} catch { }

# 启动标记：start-tray.bat 靠这个文件判断进程到底有没有跑起来
try { [IO.File]::WriteAllText((Join-Path $script:dataDir 'boot.flag'), (Get-Date -Format 'HH:mm:ss')) } catch { }

function Write-Log {
  param([string]$msg)
  $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
  try { Add-Content -LiteralPath $script:trayLog -Value $line -Encoding UTF8 } catch { }
}

function Test-Port {
  param([int]$Port)
  $c = New-Object Net.Sockets.TcpClient
  try { $c.Connect('127.0.0.1', $Port); $c.Close(); return $true }
  catch { return $false }
}

function Start-Monitor {
  if (Test-Path $script:outLog) {
    if ((Get-Item $script:outLog).Length -gt 5MB) {
      Move-Item -LiteralPath $script:outLog -Destination ($script:outLog + '.1') -Force
    }
  }
  $cmd = 'node src/index.js >> "' + $script:outLog + '" 2>> "' + $script:errLog + '"'
  $script:proc = Start-Process -FilePath "$env:SystemRoot\System32\cmd.exe" `
    -ArgumentList '/c', $cmd -WorkingDirectory $script:root -WindowStyle Hidden -PassThru
  Write-Log ("已启动采集，cmd pid=" + $script:proc.Id)
}

function Stop-Monitor {
  if ($script:proc -and -not $script:proc.HasExited) {
    & "$env:SystemRoot\System32\taskkill.exe" /PID $script:proc.Id /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 600
  }
  $script:proc = $null
}

Write-Log '--- 托盘启动 ---'

# 同一时刻只留一个托盘宿主。已经在跑就直接退；如果是残留宿主（端口没起、
# 图标还挂着），接管它，否则用户双击后会「什么都没发生」。
$script:mutex = $null
try {
  $script:mutex = New-Object System.Threading.Mutex($false, 'Local\smzdm-tray-host')
  if (-not $script:mutex.WaitOne(0)) {
    if (Test-Port 7788) {
      Write-Log '已有实例在运行，本次忽略'
      exit
    }
    $oldPid = 0
    try { $oldPid = [int]((Get-Content -LiteralPath $script:pidFile -Raw) -replace '\D', '') } catch { }
    if ($oldPid -gt 0) {
      $oldProc = Get-Process -Id $oldPid -ErrorAction SilentlyContinue
      if ($oldProc) {
        Write-Log ("旧托盘宿主 pid=" + $oldPid + " 还活着但采集没跑，接管")
        try { Stop-Process -Id $oldPid -Force -ErrorAction Stop } catch { }
        Start-Sleep -Milliseconds 900
      }
    }
    if (-not $script:mutex.WaitOne(3000)) { Write-Log '互斥量仍被占用，放弃接管' }
  }
} catch {
  Write-Log ('互斥量异常，继续启动：' + $_.Exception.Message)
}

try { Set-Content -LiteralPath $script:pidFile -Value $PID -Encoding ASCII } catch { }

try {
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Write-Log 'WinForms 已加载'

  if (Test-Port 7788) {
    Write-Log '7788 已被占用，判定采集中，本次只挂图标不重启'
    $script:up = $true
  } else {
    Start-Monitor
  }

  $script:icon = New-Object System.Windows.Forms.NotifyIcon
  $script:icon.Icon = [System.Drawing.SystemIcons]::Application
  $script:icon.Text = '好价监控 · ' + $(if ($script:up) { '运行中' } else { '启动中' })
  $script:icon.Visible = $true

  $menu = New-Object System.Windows.Forms.ContextMenuStrip
  $miOpen = $menu.Items.Add('打开历史页')
  $miOpen.Add_Click({ Start-Process $script:url })
  $miLog = $menu.Items.Add('查看日志')
  $miLog.Add_Click({ Start-Process notepad.exe -ArgumentList $script:outLog })
  $miRestart = $menu.Items.Add('重启采集')
  $miRestart.Add_Click({ Stop-Monitor; Start-Monitor })
  $menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null
  $miExit = $menu.Items.Add('退出')
  $miExit.Add_Click({
    Stop-Monitor
    $script:icon.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  })
  $script:icon.ContextMenuStrip = $menu
  $script:icon.Add_DoubleClick({ Start-Process $script:url })

  $timer = New-Object System.Windows.Forms.Timer
  $timer.Interval = 3000
  $timer.Add_Tick({
    $now = Test-Port 7788
    if ($now -and -not $script:up) {
      $script:up = $true
      $script:icon.Text = '好价监控 · 运行中'
      $script:icon.ShowBalloonTip(3000, '好价监控', '已启动，双击图标打开历史页', 'Info')
      Write-Log '采集已就绪（7788 可连）'
    } elseif (-not $now -and $script:up) {
      $script:up = $false
      $script:icon.Text = '好价监控 · 已停止'
      $script:icon.ShowBalloonTip(3000, '好价监控', '采集进程退出了，右键「重启采集」', 'Warning')
      Write-Log '采集进程退出（7788 不可连）'
    }
  })
  $timer.Start()

  Write-Log '托盘图标已显示，进入消息循环'
  [System.Windows.Forms.Application]::Run()
  $timer.Stop()
} catch {
  Write-Log ('出错：' + $_.Exception.Message)
  Write-Log ('位置：' + $_.InvocationInfo.PositionMessage)
} finally {
  try { Stop-Monitor } catch { }
  if ($script:icon) { $script:icon.Visible = $false; $script:icon.Dispose() }
  try { if ($script:mutex) { $script:mutex.ReleaseMutex() } } catch { }
  try { Remove-Item -LiteralPath $script:pidFile -Force -ErrorAction SilentlyContinue } catch { }
  Write-Log '--- 托盘退出 ---'
}
