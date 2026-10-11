// Seeds a Chrome profile with Lea's wallet (localStorage) so Lighthouse measures Home with real content.
const { chromium, BASE, wallet } = require('./common.cjs');
(async () => {
  const dir = process.argv[2];
  const ctx = await chromium.launchPersistentContext(dir, { headless: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/settings`);
  await page.evaluate((w) => {
    localStorage.setItem('keyline.device', 'lea-phone');
    localStorage.setItem('keyline.wallet', JSON.stringify(w));
  }, wallet());
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  console.log('seeded:', (await page.locator('body').innerText()).slice(0, 120).replace(/\n/g, ' | '));
  await ctx.close();
})();
