/**
 * 所有后端请求集中在这里。
 * 组件里不出现 fetch，接口要改只改这一个文件。
 */

async function request(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    cache: 'no-store',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`接口 ${path} 返回 ${response.status}`);
  }
  return response.json();
}

export const api = {
  /** @returns {Promise<{ baseline: string, read: string[], items: object[] }>} */
  fetchDeals: () => request('/api/deals'),

  /**
   * 关键词现在是对象数组：[{ name, rules? }]，rules 只写覆盖项。
   * defaults 是后端实际生效的全局值（弹窗拿它显示「默认 7」），
   * limits 是各字段的合法区间，和后端 clamp 同源。
   * @returns {Promise<{
   *   keywords: Array<{ name: string, rules?: object }>,
   *   defaults: object,
   *   limits: object
   * }>}
   */
  fetchKeywords: () => request('/api/keywords'),

  /**
   * 全量覆盖保存。元素可以是字符串（会被后端当成 { name }），
   * 返回 { ok, keywords, defaults, error? } —— HTTP 恒 200，业务失败要看 ok。
   */
  saveKeywords: (keywords) => request('/api/keywords', { method: 'POST', body: { keywords } }),

  /** 单条或批量都行 */
  markRead: (ids) => request('/api/read', { method: 'POST', body: { ids: [].concat(ids) } }),

  /**
   * 批量补「值 / 不值 / 收藏 / 评论」。
   * 服务端有 TTL 缓存，30 分钟内重复请求同一个 id 不会真的去抓详情页。
   * @returns {Promise<{ ok: boolean, refreshed: number, items: Record<string, object> }>}
   */
  fetchInteractions: (ids) => request(`/api/interactions?ids=${[].concat(ids).join(',')}`),
};
