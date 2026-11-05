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

  /** @returns {Promise<{ keywords: string[] }>} */
  fetchKeywords: () => request('/api/keywords'),

  saveKeywords: (keywords) => request('/api/keywords', { method: 'POST', body: { keywords } }),

  /** 单条或批量都行 */
  markRead: (ids) => request('/api/read', { method: 'POST', body: { ids: [].concat(ids) } }),
};
