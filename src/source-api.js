// 数据源 A：海纳开放平台「好价检索 Pro」
// 优点：有实付价 digital_price、券、商城、无 WAF、不开浏览器
// 缺点：不返回值/评论/收藏 → 由 detail.js 直连详情页补齐
const { getApiKey, maskKey } = require('./env');

const DEFAULT_BASE = 'https://gw-openapi.zhidemai.com';
const DISCOUNT_PATH = '/hj-search/discount/v2';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractArticleId(row) {
  if (row.article_id) return String(row.article_id);
  const m = String(row.url || '').match(/\/p\/(\d+)/);
  return m ? m[1] : '';
}

function mapRow(row, keyword) {
  const price = row.digital_price || row.price || '';
  return {
    articleId: extractArticleId(row),
    keyword,
    title: row.title || '',
    priceText: price ? `¥${price}` : '',
    price: price || null,
    pagePrice: row.page_price || null,
    url: row.url || '',
    buyUrl: row.direct_link || '',
    mall: row.mall_name || '',
    brand: row.brand_name || '',
    category: [row.cate1_name, row.cate2_name, row.cate3_name].filter(Boolean).join('/'),
    summary: row.content || '',
    timeText: row.publish_date || row.pubdate || '',
    coupon: (row.b2c_list && row.b2c_list[0] && row.b2c_list[0].coupon) || [],
    source: 'api',
    // 互动数据占位，由 enrichAll 填
    worthy: 0,
    unworthy: 0,
    favs: 0,
    comments: 0,
    expired: false,
  };
}

class ApiSource {
  constructor(cfg, log) {
    this.cfg = cfg;
    this.log = log || console.log;
    this.base = (cfg.api && cfg.api.baseUrl) || DEFAULT_BASE;
    this.seq = 0;
  }

  async fetchKeyword(keyword) {
    const key = getApiKey();
    if (!key) throw new Error('未配置 SMZDM_API_KEY，请在 .env 里填写');

    const body = {
      product_query: keyword,
      request_from: 'smzdm-deal-filter',
      question_id: `sf-${Date.now()}-${++this.seq}`,
      query_process: 1,
      size: this.cfg.api.size || 20,
    };

    let res;
    try {
      res = await fetch(this.base + DISCOUNT_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });
    } catch (e) {
      throw new Error(`网络失败: ${e.message}`);
    }

    if (res.status === 401) throw new Error(`Key 无效或缺失（当前 ${maskKey(key)}）`);
    if (res.status === 403) throw new Error('Key 未开通「好价检索 Pro」能力');
    if (res.status === 429) throw new Error('触发限流，需降低频率');

    let json;
    try {
      json = await res.json();
    } catch (e) {
      throw new Error(`响应非 JSON（HTTP ${res.status}）`);
    }

    if (json.error_code !== 0) {
      throw new Error(`接口错误 ${json.error_code}: ${json.error_msg || '未知'}`);
    }

    const rows = (json.data && json.data.rows) || [];
    return rows.map((r) => mapRow(r, keyword)).filter((it) => it.articleId && it.title);
  }

  // 与 SmzdmSource.searchAll 保持同一契约，index.js 无需区分来源
  async searchAll(keywords) {
    const out = [];
    for (const kw of keywords) {
      try {
        const items = await this.fetchKeyword(kw);
        this.log(`  [${kw}] ${items.length} 条`);
        out.push(...items);
      } catch (e) {
        this.log(`  [${kw}] 失败: ${e.message}`);
      }
      await sleep(600);
    }
    return out;
  }

  async close() {}
}

module.exports = { ApiSource };
