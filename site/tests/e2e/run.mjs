// End-to-end test of the production build, served from the same sub-path GitHub Pages uses.
// Usage: npm run test:e2e   (add --only=rate-limiter,cache to limit lessons, --skip-axe to skip a11y)
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DIST = path.join(ROOT, 'dist');
const SUB_PATH = '/SystemDesign-Projects/';
const PORT = 5197;
// Set E2E_BASE to test a deployed site instead of the local build.
const LIVE_BASE = process.env.E2E_BASE;
const BASE = LIVE_BASE ?? `http://localhost:${PORT}${SUB_PATH}`;
const WORKERS = Number(process.env.E2E_WORKERS ?? 6);
const BAD_TEXT = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object /;

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? new Set(onlyArg.slice(7).split(',')) : null;
const skipAxe = args.includes('--skip-axe');

const failures = [];
const notes = [];
const fail = (where, message) => failures.push(`${where}: ${message}`);

function lessonIds() {
  const source = fs.readFileSync(path.join(ROOT, 'src/topics/catalog.ts'), 'utf8');
  return [...source.matchAll(/\{ id: '([a-z0-9-]+)', title: '[^']*', group:/g)].map((m) => m[1]);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.json': 'application/json', '.txt': 'text/plain', '.xml': 'application/xml' };

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, BASE);
    if (!url.pathname.startsWith(SUB_PATH)) {
      res.writeHead(404);
      res.end('Not under the sub-path');
      return;
    }
    let file = path.join(DIST, decodeURIComponent(url.pathname.slice(SUB_PATH.length)));
    if (!path.extname(file)) file = path.join(file, 'index.html');
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('Missing');
        return;
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function findChrome() {
  if (process.env.PW_CHROME) return process.env.PW_CHROME;
  const base = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  if (!base || !fs.existsSync(base)) return undefined;
  const dirs = fs.readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  for (const d of dirs) {
    const exe = path.join(base, d, 'chrome-win64', 'chrome.exe');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

function watch(page, where) {
  page.on('console', (m) => {
    if (m.type() === 'error') fail(where, `console error: ${m.text().slice(0, 200)}`);
  });
  page.on('pageerror', (e) => fail(where, `page error: ${e.message.slice(0, 200)}`));
  page.on('requestfailed', (r) => fail(where, `request failed: ${r.url().slice(-60)}`));
  page.on('response', (r) => {
    if (r.status() >= 400 && !r.url().endsWith('favicon.ico')) fail(where, `HTTP ${r.status()}: ${r.url().slice(-60)}`);
  });
}

async function checkText(page, selector, where) {
  const text = await page.locator(selector).first().innerText().catch(() => '');
  const bad = text.match(BAD_TEXT);
  if (bad) {
    const at = text.indexOf(bad[0]);
    fail(where, `bad text "${text.slice(Math.max(0, at - 40), at + 30).replace(/\n/g, ' ')}"`);
  }
}

async function open(page, id) {
  await page.goto(`${BASE}#/learn/${id}`);
  await page.locator('.lesson-section').first().waitFor({ timeout: 20000 });
}

const setValue = (locator, value, event) =>
  locator.evaluate(
    (el, { value, event }) => {
      const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
      el.dispatchEvent(new Event(event, { bubbles: true }));
    },
    { value: String(value), event },
  );

async function testEstimator(page, where) {
  const est = page.locator('.estimator');
  if (!(await est.count())) return;
  const chips = est.locator('.seg button');
  const n = await chips.count();
  for (let i = 0; i < n; i++) {
    await chips.nth(i).click();
    if ((await est.locator('.est-steps li').count()) === 0) fail(where, `estimator chip ${i} shows no steps`);
    await checkText(page, '.estimator', `${where} estimator chip ${i}`);
  }
  const main = est.locator('.est-main input');
  const good = await main.inputValue();
  await main.fill('banana');
  if (!(await est.locator('.field-error').count())) fail(where, 'estimator accepted bad input');
  await main.fill(good);
  if (await est.locator('.field-error').count()) fail(where, 'estimator rejected its own value');
}

async function testDiagram(page, where) {
  const nodes = page.locator('.diagram .node');
  const n = await nodes.count();
  for (let i = 0; i < n; i++) await nodes.nth(i).dispatchEvent('click');
  if (n) {
    const note = await page.locator('.diagram-note').innerText();
    if (!note.trim()) fail(where, 'diagram note empty');
  }
}

async function testControls(page, where) {
  const controls = page.locator('.controls');
  if (!(await controls.count())) return;
  const ranges = controls.locator('input[type=range]');
  for (let i = 0; i < (await ranges.count()); i++) {
    const r = ranges.nth(i);
    const original = await r.inputValue();
    const min = await r.getAttribute('min');
    const max = await r.getAttribute('max');
    for (const v of [min, max, original]) {
      await setValue(r, v, 'input');
      await page.waitForTimeout(130);
      await checkText(page, '.readout', `${where} range ${i}=${v}`);
    }
  }
  const selects = controls.locator('select');
  for (let i = 0; i < (await selects.count()); i++) {
    const s = selects.nth(i);
    const original = await s.inputValue();
    const values = await s.locator('option').evaluateAll((els) => els.map((e) => e.value));
    for (const v of values) {
      await setValue(s, v, 'change');
      await page.waitForTimeout(150);
      await checkText(page, '.readout', `${where} select ${i}=${v}`);
      await checkText(page, '.console-code', `${where} code select ${i}=${v}`);
    }
    await setValue(s, original, 'change');
  }
  const toggles = controls.locator('input[type=checkbox]');
  for (let i = 0; i < (await toggles.count()); i++) {
    await toggles.nth(i).click();
    await page.waitForTimeout(120);
    await checkText(page, '.readout', `${where} toggle ${i}`);
    await toggles.nth(i).click();
  }
  const actions = controls.locator('.action-list button');
  for (let i = 0; i < (await actions.count()); i++) {
    await actions.nth(i).click();
    await page.waitForTimeout(150);
    await checkText(page, '.readout', `${where} action ${i}`);
  }
  await page.locator('.console-actions button', { hasText: 'Reset' }).click();
  const speeds = page.locator('.console-actions .seg button');
  for (let i = 0; i < (await speeds.count()); i++) await speeds.nth(i).click();
  await speeds.first().click();
  const pause = page.locator('.console-actions > button').first();
  await pause.click();
  await pause.click();
}

async function testCodeTabs(page, where) {
  const tabs = page.locator('.code-tabs button');
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click();
    const lines = await page.locator('.code-line').count();
    if (!lines) fail(where, `code tab ${i} is empty`);
  }
  if (await tabs.count()) await tabs.first().click();
}

async function testExperiments(page, where, stats) {
  const tabs = page.locator('.exp-tabs button');
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    const body = page.locator('.exp-body');
    // Tabs toggle closed when re-clicked, so only click if this one isn't open.
    if ((await tabs.nth(i).getAttribute('aria-pressed')) !== 'true') await tabs.nth(i).click();
    await page.locator('.exp-option').first().click();
    await body.locator('.exp-verdict').waitFor({ timeout: 25000 });
    stats.experiments++;
    const right = await page.locator('.exp-option.right').count();
    if (right !== 1) fail(where, `experiment ${i} highlights ${right} right answers`);
    // Now take the right answer, so we also test the success path and the check.
    await page.locator('.exp-option.right').click();
    await page.waitForTimeout(150);
    await body.locator('.exp-verdict').waitFor({ timeout: 25000 });
    const verdict = await body.locator('.exp-verdict').innerText();
    if (!verdict.includes('You predicted it')) fail(where, `experiment ${i} verdict: ${verdict}`);
    const small = await body.locator('p.muted').innerText();
    if (!small.includes('confirmed it')) {
      stats.unconfirmed.push(`${where} #${i + 1}`);
    }
    await checkText(page, '.exp-body', `${where} experiment ${i}`);
    await checkText(page, '.readout', `${where} experiment ${i} readout`);
  }
}

/** Interactive widgets that only some lessons have. */
const WIDGETS = {
  async 'url-shortener'(page, where) {
    const input = page.locator('.lab-input input');
    await input.fill('not a url');
    await page.locator('.lab-input button').click();
    if (!(await page.locator('.lab-panel .field-error').count())) fail(where, 'accepted an invalid URL');
    await input.fill('https://example.com/some/long/path');
    await page.locator('.lab-input button').click();
    const code = await page.locator('.lab-panel table code').first().innerText();
    if (!code.startsWith('sho.rt/')) fail(where, `bad short code "${code}"`);
    await page.locator('.lab-panel table button').first().click();
    const text = await page.locator('.lab-panel').innerText();
    if (!text.includes('redirects to https://example.com/some/long/path')) fail(where, 'resolve did not find the URL');
  },
  async autocomplete(page, where) {
    await page.locator('.lab-input input').fill('py');
    await page.waitForTimeout(100);
    if (!(await page.locator('.lab-panel ol li').count())) fail(where, 'no suggestions for "py"');
    await page.locator('.lab-input input').fill('zzzzzz');
    await page.waitForTimeout(100);
    if (!(await page.locator('.lab-panel').innerText()).includes('No suggestions')) fail(where, 'no empty state');
  },
  async email(page, where) {
    await page.locator('.lab-input input').fill('invoice');
    await page.waitForTimeout(100);
    if (!/[1-9][\d,]* matches/.test(await page.locator('.lab-panel').innerText())) fail(where, 'search found nothing for "invoice"');
  },
  async 'stock-exchange'(page, where) {
    const panel = page.locator('.lab-panel');
    const inputs = panel.locator('.est-field input');
    await inputs.nth(0).fill('oops');
    await panel.locator('button', { hasText: 'Send order' }).click();
    if (!(await panel.locator('.field-error').count())) fail(where, 'accepted a bad price');
    await inputs.nth(0).fill('500');
    await inputs.nth(1).fill('10');
    await panel.locator('button', { hasText: 'Send order' }).click();
    await page.waitForTimeout(100);
    if (!(await panel.locator('.log').innerText()).includes('Bought')) fail(where, 'a high-priced buy did not fill');
  },
  async 'object-storage'(page, where) {
    const panel = page.locator('.lab-panel');
    const shards = panel.locator('.cells button');
    for (let i = 0; i < 4; i++) await shards.nth(i).click();
    await panel.locator('button', { hasText: 'Rebuild the object' }).click();
    if (!(await panel.innerText()).includes('Rebuilt perfectly')) fail(where, 'could not rebuild with 4 lost');
    await shards.nth(4).click();
    await panel.locator('button', { hasText: 'Rebuild the object' }).click();
    if (!(await panel.innerText()).includes('Too many shards')) fail(where, 'rebuilt with 5 lost');
  },
  async proximity(page, where) {
    const before = await page.locator('.lab-panel h4').innerText();
    await page.locator('.lab-panel svg').click({ position: { x: 120, y: 120 } });
    await page.waitForTimeout(100);
    if (!(await page.locator('.lab-panel h4').innerText())) fail(where, `map click broke the heading, was "${before}"`);
  },
  async framework(page, where) {
    const practice = page.locator('.practice');
    await practice.locator('button', { hasText: 'Start timer' }).click();
    await page.waitForTimeout(1200);
    await practice.locator('button', { hasText: 'Pause timer' }).click();
    if (!/\d\d:\d\d/.test(await practice.locator('.timer').innerText())) fail(where, 'timer not showing');
    await practice.locator('input[type=checkbox]').first().click();
    if (!(await practice.innerText()).includes('Covered 1 of')) fail(where, 'checklist did not count');
    await practice.locator('.phase-bar button').nth(2).click();
    await practice.locator('button', { hasText: 'Give me another question' }).click();
  },
  async estimation(page, where) {
    const quiz = page.locator('.practice').first();
    await quiz.locator('button', { hasText: 'Check my answer' }).click();
    if (!(await quiz.locator('.field-error').count())) fail(where, 'quiz accepted empty answers');
    const inputs = quiz.locator('input');
    await inputs.nth(0).fill('289');
    await inputs.nth(1).fill('164 PB');
    await quiz.locator('button', { hasText: 'Check my answer' }).click();
    const text = await quiz.innerText();
    if (!text.includes('Close enough')) fail(where, `quiz answer not accepted: ${text.slice(-200)}`);
    await quiz.locator('button', { hasText: 'Next scenario' }).click();
    const avail = page.locator('.practice').nth(1);
    await avail.locator('input').first().fill('abc');
    if (!(await avail.locator('.field-error').count())) fail(where, 'availability accepted bad input');
    await avail.locator('input').first().fill('99.9');
  },
};

async function testLesson(context, id, stats) {
  const page = await context.newPage();
  const where = id;
  watch(page, where);
  try {
    await open(page, id);
    await checkText(page, 'main', where);
    for (const section of await page.locator('.lesson-nav button').all()) await section.click();
    await testEstimator(page, where);
    await testDiagram(page, where);
    await testCodeTabs(page, where);
    await testControls(page, where);
    if (WIDGETS[id]) await WIDGETS[id](page, `${where} widget`);
    await testExperiments(page, where, stats);
    const faq = page.locator('.qa details');
    if (await faq.count()) await faq.first().locator('summary').click();
    stats.lessons++;
  } catch (e) {
    fail(where, `crashed: ${String(e.message).split('\n')[0].slice(0, 240)}`);
  } finally {
    await page.close();
  }
}

async function pool(items, worker) {
  const queue = [...items];
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    while (queue.length) await worker(queue.shift());
  }));
}

async function testApp(browser, ids) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(page, 'app');

  await page.goto(BASE);
  await page.locator('.hero-lab .chart').waitFor({ timeout: 15000 });
  await page.locator('.hero-foot button', { hasText: 'Kill server A' }).click();
  await page.locator('.hero-foot button', { hasText: 'Reset' }).click();
  await page.locator('.hero-lab .seg button', { hasText: 'Least connections' }).click();
  const listed = await page.locator('.catalog-list li').count();
  if (listed !== ids.length) fail('home', `lists ${listed} of ${ids.length} lessons`);

  // Sidebar search.
  await page.locator('.side-search').fill('kafka queue');
  await page.locator('.side-search').fill('rate');
  if (!(await page.locator('.side-link', { hasText: 'Rate limiter' }).count())) fail('search', 'did not find the rate limiter');
  await page.locator('.side-search').fill('zzzzzz');
  if (await page.locator('.side-link').count()) fail('search', 'matched nonsense');
  await page.locator('.side-search').fill('');

  // Guest progress, then sign-in, then persistence.
  await page.goto(`${BASE}#/learn/cache`);
  await page.locator('.lesson-foot button').click();
  await page.goto(`${BASE}#/signin`);
  await page.locator('form button[type=submit]').click();
  if (!(await page.locator('.field-error').count())) fail('signin', 'accepted an empty name');
  await page.locator('#profile-name').fill('Test Learner');
  await page.locator('form button[type=submit]').click();
  await page.locator('.side-user').waitFor();
  await page.reload();
  await page.locator('.side-user').waitFor();
  const done = await page.locator('.side-progress span').innerText();
  if (!done.startsWith('1 of')) fail('progress', `after sign-in and reload: "${done}"`);
  await page.locator('.side-user button').click();
  await page.locator('a.btn', { hasText: 'Sign in' }).waitFor();

  // Theme persists.
  const theme = page.locator('.side-foot button.wide');
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await theme.click();
  await page.reload();
  await page.locator('.side-foot').waitFor();
  const after = await page.evaluate(() => document.documentElement.dataset.theme);
  if (before === after) fail('theme', 'did not change and persist');

  // Beginner aids: paths, level filter, glossary links, and the first-time lab guide.
  await page.goto(`${BASE}#/start`);
  await page.locator('.track').first().waitFor();
  if ((await page.locator('.track').count()) !== 3) fail('start', 'expected 3 learning paths');
  await page.locator('.track .btn').first().click();
  await page.locator('.plain-english').waitFor();
  if (!(await page.locator('.plain-english').innerText()).includes('The one thing to remember')) fail('lesson', 'no plain-English summary');
  await page.goto(`${BASE}#/learn/rate-limiter`);
  await page.locator('.lab-help').waitFor();
  await page.locator('.lab-help button').click();
  await page.reload();
  await page.locator('.console').waitFor();
  if (await page.locator('.lab-help').count()) fail('lab help', 'came back after being dismissed');
  await page.goto(`${BASE}#/learn/scale`);
  await page.locator('a.term').first().waitFor();
  await page.locator('a.term').first().click();
  await page.locator('.glossary-item.focused').waitFor();
  await page.locator('.glossary-search').fill('sharding');
  if (!(await page.locator('.glossary-item').count())) fail('glossary', 'search found nothing');
  await page.locator('.glossary-search').fill('zzzzzz');
  if (await page.locator('.glossary-item').count()) fail('glossary', 'search matched nonsense');
  await page.goto(BASE);
  await page.locator('.level-filter button', { hasText: 'Advanced' }).click();
  const advanced = await page.locator('.catalog-list li').count();
  if (!advanced || advanced >= ids.length) fail('home', `advanced filter shows ${advanced}`);
  await page.locator('.level-filter button', { hasText: 'All lessons' }).click();

  // Unknown routes.
  await page.goto(`${BASE}#/learn/nope`);
  if (!(await page.locator('h1').innerText()).includes("Couldn't load")) fail('routes', 'bad lesson id not handled');
  await page.goto(`${BASE}#/nope`);
  if (!(await page.locator('h1').innerText()).includes("doesn't exist")) fail('routes', 'unknown route not handled');

  // Pager walks the whole course in order.
  await page.goto(`${BASE}#/learn/${ids[0]}`);
  for (let i = 1; i < Math.min(ids.length, 4); i++) {
    await page.locator('.lesson-pager a.next').click({ timeout: 8000 });
    await page.waitForFunction((id) => location.hash.endsWith(id), ids[i], { timeout: 8000 });
    await page.locator('.lesson-section').first().waitFor({ timeout: 8000 });
  }
  await context.close();
}

async function testMobile(browser, ids) {
  const context = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  watch(page, 'mobile');
  await page.goto(BASE);
  await page.locator('.topbar button').click();
  await page.locator('.sidebar.open .side-link').first().click();
  await page.locator('.lesson-section').first().waitFor();
  if (await page.locator('.sidebar.open').count()) fail('mobile', 'menu stayed open after choosing a lesson');
  for (const id of ids) {
    await open(page, id);
    await page.waitForTimeout(150);
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    if (scroll > inner + 1) {
      const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.diagram-scroll,.table-wrap,.code')).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 24)}`).join(' '));
      fail(`mobile ${id}`, `sideways scroll ${scroll}px wide: ${wide}`);
    }
  }
  await context.close();
}

async function testAccessibility(browser, ids) {
  const targets = ['', '#/signin', '#/glossary', '#/start', ...ids.map((id) => `#/learn/${id}`)];
  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: theme });
    await context.addInitScript((t) => localStorage.setItem('sdl:theme', t), theme);
    const page = await context.newPage();
    const seen = new Set();
    for (const target of targets) {
      await page.goto(BASE + target);
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      for (const v of results.violations) {
        const key = `${theme} ${v.id}`;
        const sample = v.nodes[0];
        const detail = `${v.impact}: ${v.help} (${v.nodes.length}x) at ${String(sample.target).slice(0, 70)}${sample.any?.[0]?.message ? ' | ' + sample.any[0].message.slice(0, 110) : ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          fail(`a11y ${theme} ${target || 'home'}`, detail);
        }
      }
    }
    await context.close();
  }
}

async function testKeyboard(browser) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  watch(page, 'keyboard');
  await open(page, 'rate-limiter');
  await page.locator('.exp-option').first().focus();
  await page.keyboard.press('Enter');
  await page.locator('.exp-verdict').waitFor({ timeout: 25000 });
  await page.locator('.qa summary').first().focus();
  await page.keyboard.press('Enter');
  if (!(await page.locator('.qa details').first().evaluate((d) => d.open))) fail('keyboard', 'FAQ did not open with Enter');
  const outline = await page.locator('.exp-option').first().evaluate((el) => {
    el.focus();
    return getComputedStyle(el).outlineStyle;
  });
  notes.push(`Focus outline on buttons: ${outline}`);
  await context.close();
}

async function measurePerformance(browser, ids) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const rows = [];
  for (const id of ids) {
    const page = await context.newPage();
    await open(page, id);
    if (!(await page.locator('.console').count())) {
      await page.close();
      continue;
    }
    await page.locator('.console-actions .seg button').nth(2).click();
    await page.locator('.readout').scrollIntoViewIfNeeded();
    const result = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let long = 0;
          let longest = 0;
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              long++;
              longest = Math.max(longest, e.duration);
            }
          });
          obs.observe({ entryTypes: ['longtask'] });
          setTimeout(() => {
            obs.disconnect();
            resolve({ long, longest: Math.round(longest) });
          }, 3000);
        }),
    );
    rows.push({ id, ...result });
    await page.close();
  }
  rows.sort((a, b) => b.longest - a.longest);
  notes.push(`Slowest labs at 25× speed, longest task in ms: ${rows.slice(0, 6).map((r) => `${r.id} ${r.longest} (${r.long} long tasks)`).join(', ')}`);
  for (const r of rows) if (r.longest > 400) fail(`performance ${r.id}`, `longest task ${r.longest} ms at 25× speed`);
}

async function main() {
  if (!LIVE_BASE && !fs.existsSync(path.join(DIST, 'index.html'))) throw new Error('Build first: npm run build');
  const server = LIVE_BASE ? null : await startServer();
  const browser = await chromium.launch({ executablePath: findChrome() });
  const started = Date.now();
  const allIds = lessonIds();
  const ids = only ? allIds.filter((id) => only.has(id)) : allIds;
  const stats = { lessons: 0, experiments: 0, unconfirmed: [] };

  try {
    // One phase crashing shouldn't hide what the others would have found.
    const phase = async (name, run) => {
      try {
        await run();
      } catch (e) {
        fail(name, `crashed: ${String(e.message).replace(/\s+/g, ' ').slice(0, 300)}`);
      }
      console.log(`${name} done. ${failures.length} failures so far.`);
    };
    await phase('App flows', () => testApp(browser, allIds));
    await phase('Keyboard', () => testKeyboard(browser));
    await phase('Mobile', () => testMobile(browser, ids));
    await phase('Lessons', async () => {
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await pool(ids, (id) => testLesson(context, id, stats));
      await context.close();
      console.log(`${stats.lessons} of ${ids.length} lessons, ${stats.experiments} experiments.`);
    });
    await phase('Performance', () => measurePerformance(browser, ids));
    if (!skipAxe) await phase('Accessibility', () => testAccessibility(browser, ids));
  } finally {
    await browser.close();
    server?.close();
  }

  console.log(`\nFinished in ${Math.round((Date.now() - started) / 1000)} s`);
  for (const n of notes) console.log(n);
  if (stats.unconfirmed.length) console.log(`Runs that randomness pushed off the usual result: ${stats.unconfirmed.join(', ')}`);
  if (failures.length) {
    console.log(`\n${failures.length} FAILURES`);
    for (const f of [...new Set(failures)]) console.log(`- ${f}`);
    process.exit(1);
  }
  console.log('ALL E2E CHECKS PASSED');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
