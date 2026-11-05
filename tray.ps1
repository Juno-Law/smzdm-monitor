# 好价监控 · 托盘外壳
# 由 start-tray.bat 以隐藏窗口方式拉起：托盘出图标，采集在后台跑。
# 每一步都写 data\tray.log，出问题看那个文件，不靠黑窗口回话。

$ErrorActionPreference = 'Stop'

$script:root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:dataDir = Join-Path $script:root 'data'
if (-not (Test-Path $script:dataDir)) { New-Item -ItemType Directory -Path $script:dataDir -Force | Out-Null }
$script:outLog = Join-Path $script:dataDir 'run.log'
$script:errLog = Join-Path $script:dataDir 'run.err.log'
$script:trayLog = Join-Path $script:dataDir 'tray.log'
$script:url = 'http://localhost:7788'
$script:proc = $null
$script:up = $false

function Write-Log {
  param([string]$msg)
  $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
  try { Add-Content -LiteralPath $script:trayLog -Value $line -Encoding UTF8 } catch { }
}

# 同一个托盘进程重复点会被挡住；这里只保证不重复起 node
$script:mutex = New-Object System.Threading.Mutex($false, 'Global\smzdm-tray-host')
if (-not $script:mutex.WaitOne(0)) {
  Write-Log '托盘已在运行，本次忽略'
  exit
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

try {
  Write-Log '--- 托盘启动 ---'

  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  Write-Log 'WinForms 已加载'

  if (Test-Port 7788) {
    Write-Log '7788 已被占用，判定已有实例在跑，本次只挂图标不重启采集'
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
  try { $script:mutex.ReleaseMutex() } catch { }
  Write-Log '--- 托盘退出 ---'
}
