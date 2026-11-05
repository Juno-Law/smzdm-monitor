const { chromium } = require('playwright-core');

const KW = process.argv[2] || '5w-30机油';
const HEADLESS = process.argv[3] !== 'headful';
const URL = `https://search.smzdm.com/?c=home&s=${encodeURIComponent(KW)}&v=b`;

(async () => {
  let browser;
  try {
    browser = await chromium.launch({
      executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      headless: HEADLESS,
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const ctx = await browser.newContext({
      locale: 'zh-CN',
      timezoneId: 'Asia/Shanghai',
      viewport: { width: 1440, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    });
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await ctx.newPage();
    page.on('response', (r) => {
      if (r.url().includes('search.smzdm.com')) console.log('  <-', r.status(), r.url().slice(0, 80));
    });

    const resp = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
    console.log('HTTP', resp && resp.status(), 'headless=', HEADLESS);

    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(3000);
      const s = await page.evaluate(() => ({
        url: location.href,
        blocks: document.querySelectorAll('.feed-block').length,
        len: document.body.innerText.length,
        title: document.title,
      }));
      console.log(`t=${(i + 1) * 3}s`, JSON.stringify(s));
      if (s.blocks > 0) break;
    }

    const stat = await page.evaluate(() => ({
      bodyLen: document.body.innerText.length,
      head: document.body.innerText.slice(0, 300),
      htmlHead: document.documentElement.outerHTML.slice(0, 400),
    }));
    console.log('FINAL:', JSON.stringify(stat, null, 2));
  } catch (e) {
    console.log('ERR:', e.message);
  } finally {
    if (browser) await browser.close();
  }
})();
