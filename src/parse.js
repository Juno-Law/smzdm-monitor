// 在浏览器上下文里执行：把搜索结果的每一条扒成结构化对象
function extractBlocks(keyword) {
  const txt = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
  const num = (el) => {
    const m = txt(el).match(/\d+/);
    return m ? parseInt(m[0], 10) : 0;
  };

  return [...document.querySelectorAll('.feed-block')].map((b) => {
    const titleA = b.querySelector('.feed-block-title a');
    const priceEl = b.querySelector('.z-highlight');
    const tags = [...b.querySelectorAll('.feed-block-tags a')].map(txt).filter(Boolean);
    const extras = b.querySelector('.feed-block-extras');
    const buy = b.querySelector('.z-btn-red');
    const imgEl = b.querySelector('img');
    const rawImg = imgEl
      ? imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || imgEl.getAttribute('data-original') || ''
      : '';
    const imgUrl = rawImg.startsWith('//') ? 'https:' + rawImg : rawImg.startsWith('http') ? rawImg : '';
    const href = titleA ? titleA.getAttribute('href') || '' : '';
    const idMatch = href.match(/\/p\/(\d+)/);
    const priceText = txt(priceEl);

    // extras 形如 "11-02 19:23 京东"，商城在内部 span 里，时间在直接文本节点里
    let timeText = '';
    let mall = '';
    if (extras) {
      const mallEl = extras.querySelector('span');
      mall = mallEl ? txt(mallEl) : '';
      timeText = txt(extras).replace(mall, '').replace(/扫码购/g, '').trim();
    }

    return {
      articleId: idMatch ? idMatch[1] : href,
      title: titleA ? titleA.getAttribute('title') || txt(titleA) : '',
      url: href,
      imgUrl,
      priceText,
      expired: /过期|售罄|已结束|已下架/.test(priceText),
      tags,
      worthy: num(b.querySelector('.price-btn-up .unvoted-wrap span')),
      unworthy: num(b.querySelector('.price-btn-down .unvoted-wrap span')),
      favs: num(b.querySelector('.feed-btn-fav span')),
      comments: num(b.querySelector('.feed-btn-comment')),
      timeText,
      mall,
      buyUrl: buy ? buy.getAttribute('href') || '' : '',
      keyword,
    };
  });
}

module.exports = { extractBlocks };
