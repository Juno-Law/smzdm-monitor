// 零依赖读取 .env，避免为一行配置引入 dotenv
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function loadEnv(file = path.join(ROOT, '.env')) {
  const out = {};
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (_) {
    return out;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

// 进程环境变量优先，其次 .env
const merged = { ...loadEnv(), ...process.env };

function getApiKey() {
  return (merged.SMZDM_API_KEY || '').trim();
}

// 日志/截图里只用脱敏形式，避免 Key 出现在任何输出中
function maskKey(key) {
  const k = key || '';
  if (!k) return '(未配置)';
  if (k.length <= 8) return `${k.slice(0, 1)}***`;
  return `${k.slice(0, 4)}***${k.slice(-4)}`;
}

module.exports = { loadEnv, getApiKey, maskKey };
