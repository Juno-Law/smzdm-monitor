// 页面时间文本 -> 毫秒。支持 "11-03 09:45" / "11:08" / "2026-11-03 20:08:24"
function toMs(text) {
  if (!text) return 0;
  const now = new Date();
  let m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
  m = text.match(/(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(now.getFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]);
    if (d > now) d.setFullYear(now.getFullYear() - 1);
    return d.getTime();
  }
  m = text.match(/(\d{1,2}):(\d{2})/);
  if (m) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +m[1], +m[2]);
    if (d > now) d.setDate(d.getDate() - 1);
    return d.getTime();
  }
  return 0;
}

module.exports = { toMs };
