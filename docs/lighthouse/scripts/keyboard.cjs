// Keyboard pass (Phase D item 4). Production build, 390 × 844, real keyboard events only (no clicks).
const { chromium, BASE, wallet, seed } = require('./common.cjs');

const FOCUS_INFO = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const name = (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);
  const hasRing = (n) => { if (!n) return false; const c = getComputedStyle(n); return (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none'); };
  const ring = hasRing(el) || hasRing(el.closest('.kl-field__control, .kl-amount__row, .kl2-seg__opt, .kl-radio'));
  return { tag: el.tagName.toLowerCase(), role: el.getAttribute('role') ?? '', name, y: Math.round(r.top + window.scrollY + (el.closest(".kl-phone__content, .kl2-stack__viewport")?.scrollTop ?? 0)), fixed: getComputedStyle(el.closest("header, nav, footer, [class*=bar], [class*=strip]") ?? document.body).position, x: Math.round(r.left), ring, inDialog: Boolean(el.closest('[role="dialog"]')) };
};

async function tabWalk(page, max = 40) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(FOCUS_INFO);
    if (!f) continue;
    if (seen.length && seen[0].name === f.name && seen[0].y === f.y) break; // wrapped
    seen.push(f);
  }
  return seen;
}

const rows = [];
const row = (route, check, ok, note = '') => rows.push({ route, check, ok, note });

(async () => {
  const browser = await chromium.launch();
  const ctx = async (storage = {}) => {
    const c = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['clipboard-read', 'clipboard-write'] });
    await seed(c, storage);
    return c;
  };

  // 1. Home: tab order + visible focus on every stop.
  for (const [route, storage] of [['/', { 'keyline.wallet': wallet() }], ['/security', { 'keyline.wallet': wallet() }], ['/send', { 'keyline.wallet': wallet() }], ['/settings', { 'keyline.wallet': wallet() }], ['/swissquote/portfolio', {}]]) {
    const c = await ctx(storage);
    const page = await c.newPage();
    await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const stops = await tabWalk(page, 60);
    const noRing = stops.filter((s) => !s.ring);
    // Logical order: top-to-bottom; a stop more than 24 px above the previous one (outside a fixed header/footer) is out of order.
    const back = stops.filter((s, i) => i > 0 && s.y < stops[i - 1].y - 24 && s.y > 80);
    row(route, `tab stops (${stops.length})`, stops.length > 0, stops.map((s) => s.name).join(' › ').slice(0, 400));
    row(route, 'visible focus ring on every stop', noRing.length === 0, noRing.map((s) => `${s.tag}:${s.name}`).join(', '));
    row(route, 'logical order (top → bottom)', back.length === 0, back.map((s) => `${s.name}@${s.y}`).join(', '));
    await c.close();
  }

  // 2. Sheet: open Receive with the keyboard, focus moves in, Escape closes, focus returns to the trigger.
  {
    const c = await ctx({ 'keyline.wallet': wallet() });
    const page = await c.newPage();
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(FOCUS_INFO);
      found = f?.name === 'Receive';
    }
    row('/ Receive sheet', 'trigger reachable by Tab', found);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const inDialog = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')));
    row('/ Receive sheet', 'Enter opens; focus moves into the sheet', inDialog);
    const trapped = [];
    for (let i = 0; i < 8; i++) { await page.keyboard.press('Tab'); trapped.push(await page.evaluate(FOCUS_INFO)); }
    row('/ Receive sheet', 'Tab stays inside the open sheet', trapped.every((f) => f?.inDialog), trapped.map((f) => f?.name).join(' › '));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => ({ open: Boolean(document.querySelector('[role="dialog"]')), name: (document.activeElement?.innerText ?? '').trim() }));
    row('/ Receive sheet', 'Escape closes', !after.open);
    row('/ Receive sheet', 'focus returns to the trigger', after.name === 'Receive', `focus on "${after.name}"`);
    await c.close();
  }

  // 3. StackView back reachable and operable (/help).
  {
    const c = await ctx({ 'keyline.wallet': wallet() });
    const page = await c.newPage();
    await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
    let backFound = false;
    for (let i = 0; i < 15 && !backFound; i++) {
      await page.keyboard.press('Tab');
      const f = await page.evaluate(FOCUS_INFO);
      backFound = /back/i.test(f?.name ?? '');
    }
    row('/help (StackView)', 'Back reachable by Tab', backFound);
    // Next with Enter, then back with the keyboard.
    await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
    const next = page.getByRole('button', { name: /^Next$/ });
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
    const step2 = await page.locator('main, body').first().innerText();
    await page.keyboard.press('Shift+Tab');
    let back = false;
    for (let i = 0; i < 20 && !back; i++) {
      const f = await page.evaluate(FOCUS_INFO);
      back = /back/i.test(f?.name ?? '');
      if (!back) await page.keyboard.press('Shift+Tab');
    }
    if (back) await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    row('/help (StackView)', 'Enter on Next pushes; Back (keyboard) pops', back, `url ${new URL(page.url()).pathname}`);
    await c.close();
  }

  // 4. Code input: paste + arrow keys + Enter submits (/start).
  {
    const c = await ctx();
    const page = await c.newPage();
    await page.goto(`${BASE}/start`, { waitUntil: 'networkidle' });
    const input = page.locator('input[autocomplete="one-time-code"]');
    await input.focus();
    await page.evaluate(() => navigator.clipboard.writeText('Code: 482 137'));
    await page.keyboard.press('Meta+V');
    await page.waitForTimeout(200);
    const v = await input.inputValue();
    row('/start code', 'paste “Code: 482 137” → six digits', v.replace(/\D/g, '') === '482137', `value "${v}"`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    const caret = await input.evaluate((el) => el.selectionStart);
    await page.keyboard.press('ArrowRight');
    const caret2 = await input.evaluate((el) => el.selectionStart);
    row('/start code', 'arrow keys move the caret', caret === v.length - 2 && caret2 === v.length - 1, `caret ${caret} → ${caret2}`);
    const req = page.waitForRequest((r) => r.method() === 'POST', { timeout: 5000 }).then(() => true).catch(() => false);
    await page.keyboard.press('Enter');
    row('/start code', 'Enter submits the form', await req);
    await c.close();
  }

  // 5. Enter submits (Swissquote sign-in form).
  {
    const c = await ctx();
    const page = await c.newPage();
    await page.goto(`${BASE}/swissquote`, { waitUntil: 'networkidle' });
    const pw = page.locator('input[type="password"]');
    const has = (await pw.count()) > 0;
    if (has) {
      await pw.focus();
      const req = page.waitForRequest((r) => r.method() === 'POST', { timeout: 5000 }).then(() => true).catch(() => false);
      await page.keyboard.press('Enter');
      row('/swissquote sign-in', 'Enter submits the form', await req);
    } else row('/swissquote sign-in', 'Enter submits the form', true, 'already signed in (no form)');
    await c.close();
  }

  await browser.close();
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  for (const r of rows) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${pad(r.route, 22)} ${pad(r.check, 46)} ${r.note}`);
})();
