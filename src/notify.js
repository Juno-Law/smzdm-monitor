const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_ID =
  '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildXml(lines, launchUrl) {
  const body = lines
    .slice(0, 4)
    .map((l) => `      <text>${esc(l)}</text>`)
    .join('\n');
  return `<toast activationType="protocol" launch="${esc(launchUrl)}">
  <visual>
    <binding template="ToastGeneric">
${body}
    </binding>
  </visual>
  <audio src="ms-winsoundevent:Notification.Default" />
</toast>`;
}

function showToast(lines, launchUrl) {
  const xml = buildXml(lines, launchUrl);
  const tmp = path.join(os.tmpdir(), `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.xml`);
  fs.writeFileSync(tmp, xml, 'utf8');

  const ps = [
    '[void][Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime]',
    '[void][Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType=WindowsRuntime]',
    `$raw = [System.IO.File]::ReadAllText('${tmp}', [System.Text.Encoding]::UTF8)`,
    '$x = New-Object Windows.Data.Xml.Dom.XmlDocument',
    '$x.LoadXml($raw)',
    '$t = New-Object Windows.UI.Notifications.ToastNotification $x',
    `[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('${APP_ID}').Show($t)`,
    `Remove-Item -LiteralPath '${tmp}' -Force -ErrorAction SilentlyContinue`,
  ].join('\n');

  const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], {
    windowsHide: true,
    stdio: 'ignore',
  });
  child.on('error', () => {});
  return child;
}

function formatItem(it) {
  const stats = `值${it.worthy} · 不值${it.unworthy} · 藏${it.favs} · 评${it.comments}`;
  return {
    title: `【${it.keyword}】${it.title}`,
    price: `${it.priceText}`,
    stats,
    meta: `${it.mall || ''} ${it.timeText || ''}`.trim(),
  };
}

/**
 * 一轮里的新条目，逐条推；超过上限则合并成一条
 */
function notifyRound(items, { port = 7788, maxPerRound = 5, enabled = true } = {}) {
  if (!enabled || !items.length) return;
  const url = `http://localhost:${port}`;

  if (items.length > maxPerRound) {
    const preview = items
      .slice(0, 3)
      .map((i) => `· ${i.title.slice(0, 18)} ${i.priceText}`)
      .join('\n');
    showToast([`本轮 ${items.length} 条新的好价`, preview, '点击查看全部'], url);
    return;
  }

  for (const it of items) {
    const f = formatItem(it);
    showToast([f.title, f.price, `${f.stats}`, f.meta], url);
  }
}

module.exports = { notifyRound, showToast };
