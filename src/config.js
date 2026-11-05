const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const EXAMPLE_PATH = path.join(ROOT, 'config.example.json');

/**
 * config.json 不入库（里面是每个人自己的关键词和本机路径）。
 * 第一次跑、或者误删了，就从 config.example.json 复制一份出来。
 */
function ensure() {
  if (fs.existsSync(CONFIG_PATH)) return CONFIG_PATH;
  if (!fs.existsSync(EXAMPLE_PATH)) {
    throw new Error('找不到 config.example.json，仓库不完整');
  }
  fs.copyFileSync(EXAMPLE_PATH, CONFIG_PATH);
  console.log('[config] 没有 config.json，已从 config.example.json 生成一份');
  return CONFIG_PATH;
}

function read() {
  ensure();
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// 各平台的常见安装位置，按优先级排
const CANDIDATES = {
  win32: [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  darwin: [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ],
  linux: [
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ],
};

/**
 * 解析浏览器路径。
 * playwright-core 不带浏览器，必须给一个真实的 Chrome/Edge。
 * config 里留空就自动探测，这样仓库里不用写死某个人的机器路径。
 */
function resolveExecutable(configured) {
  if (configured && fs.existsSync(configured)) return configured;

  const list = CANDIDATES[process.platform] || [];
  for (const p of list) {
    if (fs.existsSync(p)) return p;
  }

  if (configured) {
    // 配了但找不到，说清楚比静默失败好
    throw new Error(`browser.executablePath 指向的文件不存在：${configured}`);
  }
  throw new Error(
    `没找到可用的浏览器（${process.platform}）。请在 config.json 的 browser.executablePath 里填 Chrome 或 Edge 的完整路径`
  );
}

module.exports = { ROOT, CONFIG_PATH, EXAMPLE_PATH, ensure, read, resolveExecutable };
