/**
 * مكتبة تدقيق مشتركة لسكربتات الأداء/الوصول/الأوفلاين (Phase 2 T8 —
 * 3A-712): خادم معاينة محلي + متصفح Puppeteer بوضع الريلاي عند وجود
 * بروكسي بيئة (نفس نمط e2e/run.mjs وسببه: Chromium المجمّع لا يقرأ
 * مخزن شهادات النظام في بيئات البروكسي) + دخول الديمو العام + محاكاة
 * موبايل 375px وخنق شبكة/معالج عبر CDP.
 *
 * لا أسرار هنا: الدخول بزر الديمو العام في صفحة الدخول نفسها.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const NAV_TIMEOUT = 60_000;
export const WAIT_TIMEOUT = 45_000;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const RELAY =
  process.env.E2E_RELAY != null
    ? process.env.E2E_RELAY === '1'
    : Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);

/* ------------------------------- خادم المعاينة ------------------------------ */

export async function startPreview(port) {
  const child = spawn(
    process.execPath,
    [
      path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      'preview',
      '--port',
      String(port),
      '--strictPort',
      '--host',
      '127.0.0.1',
    ],
    { cwd: ROOT, stdio: 'pipe' },
  );
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      const res = await fetch(base + '/login');
      if (res.ok) return { child, base };
    } catch {
      /* لم يجهز بعد */
    }
    if (Date.now() > deadline) {
      child.kill('SIGTERM');
      throw new Error('خادم المعاينة لم يجهز خلال ٣٠ ثانية');
    }
    await sleep(400);
  }
}

/* ---------------------------------- الريلاي ---------------------------------- */

async function enableRelay(page, base, stats) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (
      url.startsWith(base) ||
      url.startsWith('data:') ||
      url.startsWith('blob:') ||
      url.startsWith('about:')
    ) {
      req.continue().catch(() => {});
      return;
    }
    const method = req.method();
    const attempt = async () => {
      const headers = { ...req.headers() };
      delete headers.host;
      const init = { method, headers, redirect: 'follow' };
      const pd = req.postData();
      if (pd && method !== 'GET' && method !== 'HEAD') init.body = pd;
      const res = await fetch(url, init);
      const buf = Buffer.from(await res.arrayBuffer());
      const out = {};
      res.headers.forEach((v, k) => {
        if (
          !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(
            k.toLowerCase(),
          )
        )
          out[k] = v;
      });
      await req.respond({ status: res.status, headers: out, body: buf });
    };
    try {
      await attempt();
    } catch {
      if (method === 'GET' || method === 'HEAD') {
        await sleep(300);
        try {
          await attempt();
          return;
        } catch {
          /* fallthrough للإجهاض */
        }
      }
      stats.aborted += 1;
      req.abort().catch(() => {});
    }
  });
}

/* --------------------------------- المتصفح --------------------------------- */

export async function launchAuditedPage(browser, base, context = null) {
  const page = context ? await context.newPage() : await browser.newPage();
  const stats = { aborted: 0 };
  const watch = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (e) => watch.pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') watch.consoleErrors.push(m.text());
  });
  page.on('dialog', async (d) => {
    await d.accept().catch(() => {});
  });
  if (RELAY) await enableRelay(page, base, stats);
  return { page, stats, watch };
}

export async function launchBrowser() {
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/** ملف الموبايل المرجعي: 375×667 + لمس + وكيل مستخدم موبايل */
export async function emulateMobile(page) {
  await page.emulate({
    viewport: { width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
  });
}

/** خنق شبكة Slow-4G + معالج ×4 (ملف «جهاز ضعيف/شبكة بطيئة») عبر CDP */
export async function throttleWeakDevice(page) {
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150, // Slow-4G: ‏RTT ‏150ms
    downloadThroughput: (1.6 * 1024 * 1024) / 8, // ‏1.6Mbps
    uploadThroughput: (750 * 1024) / 8, // ‏750Kbps
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return cdp;
}

export async function clearThrottle(cdp) {
  if (!cdp) return;
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {});
  await cdp
    .send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    })
    .catch(() => {});
}

/* -------------------------------- أدوات صفحات -------------------------------- */

export async function waitBodyText(page, text, timeout = WAIT_TIMEOUT) {
  await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), {
    timeout,
  }, text);
}

export async function bodyText(page) {
  return page.evaluate(() => (document.body ? document.body.innerText : ''));
}

async function waitElementStable(page, el) {
  await page
    .evaluate(async (target) => {
      let prev = target.getBoundingClientRect();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 50));
        const cur = target.getBoundingClientRect();
        if (
          Math.abs(cur.top - prev.top) < 0.5 &&
          Math.abs(cur.left - prev.left) < 0.5 &&
          cur.width > 0
        )
          return;
        prev = cur;
      }
    }, el)
    .catch(() => {});
}

export async function clickByText(page, text, { timeout = WAIT_TIMEOUT, selector = 'button, a' } = {}) {
  const handle = await page.waitForFunction(
    (t, sel) => {
      const els = [...document.querySelectorAll(sel)];
      return els.find((el) => el.innerText && el.innerText.includes(t) && !el.disabled) || null;
    },
    { timeout },
    text,
    selector,
  );
  const el = handle.asElement();
  assert(el, `لم يُعثر على عنصر قابل للنقر يحتوي: ${text}`);
  await el.scrollIntoView().catch(() => {});
  await waitElementStable(page, el);
  await el.click();
  return el;
}

export async function waitPathname(page, expected, timeout = WAIT_TIMEOUT) {
  await page.waitForFunction((p) => location.pathname === p, { timeout }, expected);
}

/**
 * دخول الديمو العام من صفحة الدخول (نفس تدفق e2e). متسامح مع جلسة
 * قائمة: صفحات المتصفح نفسه تتشارك localStorage، فصفحة لاحقة قد تجد
 * جلسة حية وتُعاد توجيهها من /login للرئيسية مباشرة — عندها لا زر
 * «دخول تجريبي» أصلاً، والدخول متحقق بلا نقر.
 */
export async function demoLogin(page, base, timeout = WAIT_TIMEOUT) {
  await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await sleep(1200);
  const path = await page.evaluate(() => location.pathname).catch(() => '/login');
  if (path === '/login') {
    await clickByText(page, 'دخول تجريبي', { timeout });
    await waitPathname(page, '/', timeout);
  }
  await waitBodyText(page, 'طالب جديد', timeout);
  await sleep(1500);
}

const FATAL_CONSOLE = /uncaught|TypeError|ReferenceError|SyntaxError/i;

export function fatalErrors(watch) {
  return [
    ...watch.pageErrors.map((m) => `pageerror: ${m}`),
    ...watch.consoleErrors
      .filter((t) => FATAL_CONSOLE.test(t))
      .map((t) => `console: ${t.slice(0, 200)}`),
  ];
}
