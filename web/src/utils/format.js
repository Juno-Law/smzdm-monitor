/** 展示层的纯函数，不碰状态，方便单独测试和复用 */

const DAY = 86_400_000;

/** "135元（需用券）" → { value: "135", note: "需用券" } */
export function splitPrice(priceText = '') {
  const matched = String(priceText).match(/^(\d+(?:\.\d+)?)\s*元(.*)$/);
  if (!matched) return { value: priceText, note: '' };
  return {
    value: matched[1],
    note: matched[2].replace(/^[（(]|[）)]$/g, '').trim(),
  };
}

/** 站内缩略图是 _d200，换成 _d800 拿高清，失败时组件会回退 */
export function largeImage(url = '') {
  return url.replace(/_(?:d\d+|s\d+)\.(jpg|jpeg|png|webp)$/i, '_d800.$1');
}

/** 按本地时区切成 YYYY-MM-DD，用来分组 */
export function dayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** 今天 / 昨天 / 前天 / 11月3日 */
export function dayLabel(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '未知日期';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const diff = Math.round((today - target) / DAY);
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  return `${target.getMonth() + 1}月${target.getDate()}日`;
}

/** 3 分钟前 / 2 小时前 / 3 天前 */
export function relativeTime(iso) {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';

  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} 小时前`;
  return `${Math.round(minutes / 1440)} 天前`;
}

/** 这条是从哪一路排序里抓到的 */
export function sourceOf(sorts = []) {
  const hasTime = sorts.includes('time');
  const hasDefault = sorts.includes('default');
  if (hasTime && hasDefault) return { text: '最新 + 综合', tone: 'both' };
  if (hasDefault) return { text: '综合热门', tone: 'hot' };
  return null;
}

const HOT_WORDS = ['新低', '必买', '绝对值', '神价', '历史低价', '补贴'];

/** 标签里带“新低/必买”这类词的高亮，其余保持中性 */
export function isHotTag(tag = '') {
  return HOT_WORDS.some((word) => tag.includes(word));
}
