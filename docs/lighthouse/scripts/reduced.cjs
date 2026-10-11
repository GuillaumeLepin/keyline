// Reduced-motion proof (Phase D item 3). Chromium with prefers-reduced-motion: reduce, 390 × 844.
// A rAF sampler records every element whose computed `transform` changes between frames (= a transform animation
// ran) and every running Web Animation that animates transform. After each trigger, the new content must be
// visible (opacity 1, visibility visible, non-zero box).
const { chromium, BASE, wallet, seed } = require('./common.cjs');

const SAMPLER = () => {
  const last = new WeakMap();
  window.__moved = [];
  const tick = () => {
    for (const el of document.querySelectorAll('body *')) {
      const t = getComputedStyle(el).transform;
      const prev = last.get(el);
      if (prev !== undefined && prev !== t) {
        window.__moved.push({ el: (el.className?.baseVal ?? el.className ?? el.tagName).toString().slice(0, 60), from: prev, to: t });
      }
      last.set(el, t);
    }
    for (const a of document.getAnimations()) {
      const kf = a.effect?.getKeyframes?.() ?? [];
      if (a.playState === 'running' && kf.some((k) => 'transform' in k || 'scale' in k || 'translate' in k || 'rotate' in k)) {
        const target = a.effect?.target;
        window.__moved.push({ el: `WAAPI ${(target?.className?.baseVal ?? target?.className ?? '').toString().slice(0, 50)}`, from: 'anim', to: JSON.stringify(kf).slice(0, 80) });
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

async function visible(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, ok: false, why: 'missing' };
    let n = el;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (Number(cs.opacity) < 1 || cs.visibility === 'hidden' || cs.display === 'none')
        return { sel, ok: false, why: `${n.className} opacity=${cs.opacity} vis=${cs.visibility}` };
      n = n.parentElement;
    }
    const r = el.getBoundingClientRect();
    return { sel, ok: r.width > 0 && r.height > 0, why: `${Math.round(r.width)}×${Math.round(r.height)}` };
  }, selector);
}

const results = [];
async function scene(browser, name, storage, fn) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
  await seed(context, storage);
  await context.addInitScript(SAMPLER);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' && /hydrat|did not match/i.test(m.text())) errors.push(m.text().slice(0, 160)); });
  let checks = [];
  try {
    checks = await fn(page);
  } catch (e) {
    checks.push({ sel: 'scene', ok: false, why: String(e).slice(0, 200) });
  }
  const moved = await page.evaluate(() => window.__moved ?? []);
  const rm = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  results.push({ name, reducedMotionMatches: rm, transformChanges: moved.length, sample: moved.slice(0, 5), hidden: checks.filter((c) => !c.ok), checks: checks.length, hydrationErrors: errors });
  await context.close();
}

(async () => {
  const browser = await chromium.launch();
  const settle = (page, ms = 600) => page.waitForTimeout(ms);

  // 1. Protect sequence — the orchestrated moment as rendered by the same primitives on /design (labelled demo timer).
  await scene(browser, 'protect sequence (/design hero, arcs → close → check)', {}, async (page) => {
    await page.goto(`${BASE}/design`, { waitUntil: 'networkidle' });
    await page.getByTestId('protect-play').click();
    await settle(page, 6500);
    return [await visible(page, '[data-testid="hero-protect"] .kl2-ring')];
  });
  // 1b. The real onboarding Protect screen (step 5), already protected: ring closed, check, Continue visible.
  await scene(browser, 'onboarding Protect (step 5, protected)', { 'keyline.wallet': wallet({ onboardingStep: 5 }) }, async (page) => {
    await page.goto(`${BASE}/onboarding`, { waitUntil: 'networkidle' });
    await settle(page);
    return [await visible(page, '[data-testid="protect-ring"]'), await visible(page, '[data-testid="protect-primary"]'), await visible(page, '[data-testid="protect-title"]')];
  });
  // 2. Sheet: Receive on Home (SheetV2), open then Escape.
  await scene(browser, 'sheet (Home → Receive)', { 'keyline.wallet': wallet() }, async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Receive$/ }).first().click();
    await settle(page);
    const open = await visible(page, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await settle(page);
    const gone = await page.evaluate(() => !document.querySelector('[role="dialog"]'));
    return [open, { sel: 'dialog closed on Escape', ok: gone, why: '' }];
  });
  // 3. Stack push: /help Next (StackView) and back.
  await scene(browser, 'stack push / pop (/help)', { 'keyline.wallet': wallet() }, async (page) => {
    await page.goto(`${BASE}/help`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^Next$/ }).click();
    await settle(page);
    const pushed = await visible(page, '.kl2-stack__screen');
    await page.getByRole('button', { name: /^Back$/ }).first().click();
    await settle(page);
    return [pushed, await visible(page, '.kl2-stack__screen')];
  });
  // 4. Countdown: last 5 seconds, lands at 00:00 (no pulse under reduce).
  await scene(browser, 'countdown last seconds + landing (/design)', {}, async (page) => {
    await page.goto(`${BASE}/design`, { waitUntil: 'networkidle' });
    await page.getByTestId('countdown-last').click();
    await settle(page, 6500);
    const done = await page.locator('[data-testid="hero-countdown"]').innerText();
    return [await visible(page, '[data-testid="hero-countdown"] .kl2-ring'), { sel: 'lands at 00:00', ok: done.includes('00:00'), why: '' }];
  });
  await browser.close();
  for (const r of results) {
    const pass = r.reducedMotionMatches && r.transformChanges === 0 && r.hidden.length === 0;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${r.name}  · transform changes ${r.transformChanges} · checks ${r.checks} · hidden ${r.hidden.length} · hydration errors ${r.hydrationErrors.length}`);
    if (!pass) console.log(JSON.stringify({ sample: r.sample, hidden: r.hidden }, null, 1));
  }
})();
