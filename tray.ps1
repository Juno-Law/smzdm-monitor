# 好价监控 · 托盘外壳
# 双击 start-tray.vbs 启动：托盘出图标，采集在后台跑，不占任务栏。
# 右键菜单：打开历史页 / 查看日志 / 重启采集 / 退出

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:url = 'http://localhost:7788'
$script:dataDir = Join-Path $script:root 'data'
if (-not (Test-Path $script:dataDir)) { New-Item -ItemType Directory -Path $script:dataDir | Out-Null }
$script:outLog = Join-Path $script:dataDir 'run.log'
$script:errLog = Join-Path $script:dataDir 'run.err.log'
$script:proc = $null
$script:up = $false

function Test-Port {
  param([int]$Port)
  $c = New-Object Net.Sockets.TcpClient
  try {
    $c.Connect('127.0.0.1', $Port)
    $c.Close()
    return $true
  } catch {
    return $false
  }
}

# 已经有一份在跑就别起第二份，否则会重复抓取
if (Test-Port 7788) {
  [void][System.Windows.Forms.MessageBox]::Show(
    "已经有一份在跑了（7788 端口被占用）。`n`n如果找不到它，先用任务管理器结束 node.exe 再试。",
    '好价监控')
  exit
}

function Start-Monitor {
  # 日志超过 5MB 就轮转一份，免得跑几个月撑爆磁盘
  if (Test-Path $script:outLog) {
    if ((Get-Item $script:outLog).Length -gt 5MB) {
      Move-Item -LiteralPath $script:outLog -Destination ($script:outLog + '.1') -Force
    }
  }
  $cmd = 'node src/index.js >> "' + $script:outLog + '" 2>> "' + $script:errLog + '"'
  $script:proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', $cmd `
    -WorkingDirectory $script:root `
    -WindowStyle Hidden `
    -PassThru
}

function Stop-Monitor {
  if ($script:proc -and -not $script:proc.HasExited) {
    # /T 连子进程一起杀，否则 cmd 死了 node 还占着端口
    & taskkill.exe /PID $script:proc.Id /T /F 2>$null | Out-Null
    Start-Sleep -Milliseconds 600
  }
  $script:proc = $null
}

# ---- 托盘图标 ----
$script:icon = New-Object System.Windows.Forms.NotifyIcon
$script:icon.Icon = [System.Drawing.SystemIcons]::Application
$script:icon.Text = '好价监控 · 启动中'
$script:icon.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip

$miOpen = $menu.Items.Add('打开历史页')
$miOpen.Add_Click({ Start-Process $script:url })

$miLog = $menu.Items.Add('查看日志')
$miLog.Add_Click({ Start-Process notepad.exe -ArgumentList $script:outLog })

$miRestart = $menu.Items.Add('重启采集')
$miRestart.Add_Click({
  Stop-Monitor
  Start-Monitor
})

$menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator)) | Out-Null

$miExit = $menu.Items.Add('退出')
$miExit.Add_Click({
  Stop-Monitor
  $script:icon.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})

$script:icon.ContextMenuStrip = $menu
$script:icon.Add_DoubleClick({ Start-Process $script:url })

# ---- 每 3 秒看一眼端口，图标跟着状态变 ----
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 3000
$timer.Add_Tick({
  $now = Test-Port 7788
  if ($now -and -not $script:up) {
    $script:up = $true
    $script:icon.Text = '好价监控 · 运行中'
    $script:icon.ShowBalloonTip(3000, '好价监控', '已启动，双击图标打开历史页', 'Info')
  } elseif (-not $now -and $script:up) {
    $script:up = $false
    $script:icon.Text = '好价监控 · 已停止'
    $script:icon.ShowBalloonTip(3000, '好价监控', '采集进程退出了，右键「重启采集」', 'Warning')
  }
})

Start-Monitor
$timer.Start()

try {
  [System.Windows.Forms.Application]::Run()
} finally {
  $timer.Stop()
  Stop-Monitor
  $script:icon.Visible = $false
  $script:icon.Dispose()
}
