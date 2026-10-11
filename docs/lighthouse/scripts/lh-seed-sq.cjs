const { chromium, BASE } = require('./common.cjs');
(async () => {
  const ctx = await chromium.launchPersistentContext(process.argv[2], { headless: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/swissquote`, { waitUntil: 'networkidle' });
  const btn = page.locator('form button[type="submit"]');
  if (await btn.count()) { await btn.click(); await page.waitForURL(/portfolio/, { timeout: 15000 }).catch(() => {}); }
  await page.goto(`${BASE}/swissquote/portfolio`, { waitUntil: 'networkidle' });
  console.log(page.url(), (await page.locator('main').innerText()).slice(0, 160).replace(/\n/g, ' | '));
  console.log('storage', await page.evaluate(() => Object.keys(localStorage).join(',')), (await ctx.cookies()).map((c) => c.name).join(','));
  await ctx.close();
})();
