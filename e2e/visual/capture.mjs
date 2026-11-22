#!/usr/bin/env node
/**
 * محرك التقاط الفحص البصري (3A-326): يلتقط لقطة كاملة لكل شاشة في
 * الجرد (screens.mjs) عند عرضَي 390 و360 من بيئة الإنتاج بحساب الديمو
 * العام (زر «دخول تجريبي» — بياناته عامة عمداً بقرار المالك، لا أسرار
 * في الكود).
 *
 * انضباط الحتمية (موثّق في e2e/visual/README.md):
 * - ساعة مجمّدة: Date مُبدَّلة عند 2026-11-21T22:00Z مع منطقة زمنية
 *   Africa/Cairo = الأحد 2026-11-22 00:00 EET في كل بيئة تشغيل.
 * - prefers-reduced-motion + سحق مدد الأنيميشن/الانتقالات بـ CSS محقون.
 * - تمرير استقرار (auto-scroll) ثم انتظار خمول الشبكة والخطوط وثبات
 *   طول نص الصفحة قبل الالتقاط.
 * - وضع الريلاي (من e2e/run.mjs): في بيئات البروكسي الموثّق تُعترض
 *   الطلبات وتُمرَّر عبر Node fetch — Chromium المجمّع لا يعبر البروكسي
 *   الموثّق بنفسه (مُثبت قياساً في فحص جدوى 3A-326).
 *
 * الاستخدام:
 *   node e2e/visual/capture.mjs --out <dir> [--base <url>]
 *        [--widths 390,360] [--only id1,id2] [--no-tokens] [--theme dark|light]
 *   --theme: يضبط localStorage ‏teacher-app-theme قبل التحميل (آلية
 *   useTheme الفعلية: المفتاح نفسه في index.html/useTheme.ts) + محاكاة
 *   prefers-color-scheme بنفس القيمة (حتى لا يقلب مزامنة إعدادات الحساب
 *   «auto» الشاشةَ للفاتح أثناء لقطة الداكن). بلا --theme السلوك كما كان.
 * يخرج بكود 1 بصوت عالٍ إن فشلت أي شاشة (البيان يوثّق الخطأ) — لا
 * يُقبل سويب ناقص كأنه كامل (حارس العدّاد).
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { SCREENS } from './screens.mjs';

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const OUT = arg('out', null);
if (!OUT) {
  console.error('usage: capture.mjs --out <dir> [--base <url>] [--widths 390,360] [--only ids] [--no-tokens]');
  process.exit(2);
}
const BASE = (arg('base', process.env.VISUAL_BASE || 'https://teacher-app-prod.vercel.app')).replace(/\/$/, '');
const WIDTHS = arg('widths', '390,360').split(',').map(Number);
const ONLY = arg('only', null)?.split(',') ?? null;
const WITH_TOKENS = !args.includes('--no-tokens');
const THEME = arg('theme', null);
if (THEME != null && THEME !== 'dark' && THEME !== 'light') {
  console.error(`--theme يقبل dark أو light فقط (وصل: ${THEME})`);
  process.exit(2);
}
const RELAY =
  process.env.VISUAL_RELAY != null
    ? process.env.VISUAL_RELAY === '1'
    : Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
const NAV_TIMEOUT = 60_000;
const WAIT_TIMEOUT = 45_000;
/** الأحد 2026-11-22 00:00 بتوقيت القاهرة */
const FROZEN_UTC = '2026-11-21T22:00:00.000Z';
const TIMEZONE = 'Africa/Cairo';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const screens = SCREENS.filter((s) => !ONLY || ONLY.includes(s.id));

/* ------------------------------- الريلاي ------------------------------- */
async function enableRelay(page, stats) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('about:')) {
      req.continue().catch(() => {});
      return;
    }
    const method = req.method();
    const attempt = async () => {
      const headers = { ...req.headers() };
      delete headers.host;
      // مهلة إجهاض صريحة: fetch معلّق بلا مهلة علّق سويباً كاملاً على
      // شاشة الماليات (2026-11-22) — لا انتظار غير محدود في الريلاي أبداً
      const ctl = new AbortController();
      const killer = setTimeout(() => ctl.abort(), 25_000);
      const init = { method, headers, redirect: 'follow', signal: ctl.signal };
      const pd = req.postData();
      if (pd && method !== 'GET' && method !== 'HEAD') init.body = pd;
      const res = await fetch(url, init).finally(() => clearTimeout(killer));
      const buf = Buffer.from(await res.arrayBuffer());
      const out = {};
      res.headers.forEach((v, k) => {
        if (!['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k.toLowerCase()))
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
        } catch { /* fallthrough */ }
      }
      stats.aborted += 1;
      req.abort().catch(() => {});
    }
  });
}

/* --------------------------- تجهيز الصفحة --------------------------- */
const FREEZE_AND_FLATTEN = (frozenIso) => {
  const FIXED = new Date(frozenIso).getTime();
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...a) {
      super(...(a.length ? a : [FIXED]));
    }
    static now() {
      return FIXED;
    }
  }
  window.Date = FrozenDate;
  const st = document.createElement('style');
  st.textContent =
    '*,*::before,*::after{animation-duration:0.01ms!important;animation-delay:0s!important;' +
    'animation-iteration-count:1!important;transition-duration:0.01ms!important;' +
    'transition-delay:0s!important;scroll-behavior:auto!important;caret-color:transparent!important}';
  const attach = () => {
    if (document.documentElement) document.documentElement.appendChild(st);
    else setTimeout(attach, 10);
  };
  attach();
};

const SET_THEME = (mode) => {
  try {
    localStorage.setItem('teacher-app-theme', mode);
  } catch { /* صفحات بلا تخزين (about:blank) — تُعاد عند التنقّل الفعلي */ }
  // حارس ضد قلب صفحة الإعدادات للثيم: SettingsPage تزامن ثيم الحساب
  // المحفوظ في القاعدة (للديمو: فاتح) فوق الاختيار المحلي عند فتحها،
  // فتُلتقط فاتحة وسط سويب داكن — المراقب يعيد فرض الثيم المطلوب على
  // dataset.theme فور أي تغيير، والفواصل تعيد كتابة مفتاح التخزين.
  const enforce = () => {
    try {
      localStorage.setItem('teacher-app-theme', mode);
    } catch { /* تجاهل */ }
    const el = document.documentElement;
    if (el && el.dataset.theme !== mode) el.dataset.theme = mode;
  };
  const arm = () => {
    if (!document.documentElement) return setTimeout(arm, 10);
    new MutationObserver(enforce).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    enforce();
    setInterval(enforce, 500);
  };
  arm();
};

async function preparePage(page, stats) {
  if (RELAY) await enableRelay(page, stats);
  await page.emulateTimezone(TIMEZONE);
  const media = [{ name: 'prefers-reduced-motion', value: 'reduce' }];
  if (THEME) media.push({ name: 'prefers-color-scheme', value: THEME });
  await page.emulateMediaFeatures(media);
  if (THEME) await page.evaluateOnNewDocument(SET_THEME, THEME);
  await page.evaluateOnNewDocument(FREEZE_AND_FLATTEN, FROZEN_UTC);
  page.on('dialog', async (d) => {
    await d.accept().catch(() => {});
  });
}

async function waitBodyText(page, text, timeout = WAIT_TIMEOUT) {
  await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), { timeout }, text);
}

async function clickByText(page, text, { timeout = WAIT_TIMEOUT, selector = 'button, a' } = {}) {
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
  if (!el) throw new Error(`عنصر غير موجود: ${text}`);
  await el.scrollIntoView().catch(() => {});
  await el.click();
  return el;
}

/** سباق مهلة: أي انتظار داخل الصفحة قد يعلّق للأبد (fonts.ready مع خط
 *  عالق في الريلاي علّق أول سويب كامل) — كل خطوة استقرار محدودة بمهلة. */
function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`مهلة ${label} (${ms}ms)`)), ms)),
  ]);
}

/** استقرار: خمول شبكة + خطوط + ثبات طول النص، ثم تمرير كامل وإعادة للأعلى. */
async function settle(page) {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 15_000 }).catch(() => {});
  await withTimeout(
    page.evaluate(async () => {
      // جاهزية الخطوط العامة + تحميل كل وجه معلن فعلياً: وجه عريض يصل
      // متأخراً كان يبدّل رسم عناوين/نصوص بين تشغيلتين (ضجيج أشباح
      // بكسلي قيس في اختبار 3A-326 الذاتي)
      await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 4000))]);
      await Promise.race([
        Promise.all([...document.fonts].map((f) => f.loaded.catch(() => {}))),
        new Promise((r) => setTimeout(r, 4000)),
      ]);
    }),
    10_000,
    'fonts',
  ).catch(() => {});
  let last = -1;
  for (let i = 0; i < 12; i++) {
    const len = await page.evaluate(() => (document.body ? document.body.innerText.length : 0)).catch(() => 0);
    if (len === last && len > 0) break;
    last = len;
    await sleep(600);
  }
  await withTimeout(
    page.evaluate(async () => {
      const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
      // سقف خطوات وارتفاع: صفحة تنمو بلا نهاية لا تعلّق الحلقة
      for (let y = 0, n = 0; y < document.body.scrollHeight && n < 60 && y < 40_000; y += step, n++) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 110));
      }
      window.scrollTo(0, 0);
    }),
    20_000,
    'autoscroll',
  ).catch(() => {});
  await page.waitForNetworkIdle({ idleTime: 400, timeout: 8_000 }).catch(() => {});
  // ثبات هندسي أخير: رسوم بيانية SVG تتحرك بـ JS (لا يطالها سحق CSS)
  // فتُقاس بصمة (أطوال HTML + ارتفاع الصفحة + سمات d لمسارات SVG)
  // حتى تتطابق عيّنتان متتاليتان — ذيل الأنيميشن ينتهي قبل اللقطة
  await withTimeout(
    page.evaluate(async () => {
      const snap = () => {
        let d = '';
        document.querySelectorAll('svg path').forEach((p) => {
          d += p.getAttribute('d') || '';
        });
        return `${document.body.innerHTML.length}|${document.body.scrollHeight}|${d.length}|${d.slice(0, 64)}|${d.slice(-64)}`;
      };
      let prev = snap();
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 700));
        const cur = snap();
        if (cur === prev) break;
        prev = cur;
      }
    }),
    12_000,
    'geometry-stability',
  ).catch(() => {});
  await sleep(400);
}

async function shoot(page, file) {
  await withTimeout(page.screenshot({ path: file, fullPage: true }), 45_000, 'screenshot');
  const buf = fs.readFileSync(file);
  // أبعاد PNG من الترويسة (IHDR)
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  return { bytes: buf.length, pngWidth: w, pngHeight: h };
}

/** تدقيق DOM برمجي (تسوية التحقق): تجاوز أفقي للوثيقة + عناصر تتجاوز
 *  عرض الشاشة أو مقصوصة بمخفيّ overflow — تُسجَّل في البيان فقط، لا
 *  تؤثر في اللقطة ولا في نجاحها. */
async function collectDomAudit(page) {
  return page
    .evaluate(() => {
      const de = document.documentElement;
      const vw = de.clientWidth;
      const docOverflowX = Math.max(de.scrollWidth, document.body?.scrollWidth ?? 0) > vw;
      const offenders = [];
      const clipped = [];
      for (const el of document.querySelectorAll('*')) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        const style = getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const desc =
          el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 3).join('.') : '') +
          ' «' + (el.textContent || '').trim().slice(0, 40) + '»';
        if ((r.right > vw + 1 || r.left < -1) && offenders.length < 10)
          offenders.push({ desc, left: Math.round(r.left), right: Math.round(r.right), vw });
        if (
          clipped.length < 10 &&
          ((style.overflowX === 'hidden' && el.scrollWidth > el.clientWidth + 1) ||
            (style.overflowY === 'hidden' && el.scrollHeight > el.clientHeight + 1))
        )
          clipped.push({ desc, sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight });
      }
      return { docOverflowX, docScrollWidth: Math.max(de.scrollWidth, document.body?.scrollWidth ?? 0), vw, theme: de.dataset.theme ?? null, offenders, clipped };
    })
    .catch((e) => ({ error: e.message }));
}

/* ------------------------------ الجلسة ------------------------------ */
async function demoLogin(page) {
  let step = 'goto-login';
  try {
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    step = 'click-demo';
    await clickByText(page, 'دخول تجريبي');
    step = 'wait-home-path';
    await page.waitForFunction(() => location.pathname === '/', { timeout: WAIT_TIMEOUT });
    step = 'wait-home-text';
    await waitBodyText(page, 'طالب جديد');
  } catch (e) {
    throw new Error(`demoLogin/${step}: ${e.message}`);
  }
  await settle(page);
}

async function ensureSession(page) {
  const onLogin = await page.evaluate(() => location.pathname === '/login').catch(() => true);
  if (onLogin) await demoLogin(page);
}

async function firstHref(page, listPath, prefix) {
  await page.goto(BASE + listPath, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForFunction(
    (p) => document.querySelector(`a[href^="${p}"]`) != null,
    { timeout: WAIT_TIMEOUT },
    prefix,
  );
  return page.evaluate((p) => document.querySelector(`a[href^="${p}"]`).getAttribute('href'), prefix);
}

/** الحضور: تقدّم يوماً بيوم حتى أول قائمة (منطق e2e/run.mjs نفسه). يرجع إزاحة الأيام. */
async function resolveAttendance(page) {
  await page.goto(BASE + '/attendance', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  for (let offset = 0; offset <= 7; offset++) {
    if (offset > 0) {
      await page.evaluate((off) => {
        const input = document.querySelector('input[type="date"]');
        if (!input) return;
        const base = new Date(window.Date.now());
        base.setDate(base.getDate() + off);
        const iso = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, iso);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, offset);
    }
    try {
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'حاضر') ||
          (document.body && document.body.innerText.includes('لا توجد حصص في اليوم ده')),
        { timeout: 20_000 },
      );
    } catch { /* جرّب التالي */ }
    const state = await page.evaluate(() => ({
      roster: [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'حاضر').length,
      empty: document.body.innerText.includes('لا توجد حصص في اليوم ده'),
    }));
    if (state.roster > 0) return { offset, note: `جلسة عند إزاحة +${offset} يوم من اليوم المجمّد` };
    if (!state.empty && offset === 7) return { offset: 0, note: 'لا قائمة ولا حالة فراغ مفهومة خلال ٧ أيام — لقطة اليوم كما هي' };
  }
  return { offset: 0, note: 'حالة فراغ «لا توجد حصص» عند اليوم المجمّد' };
}

/* ------------------------------ البوابتان ------------------------------ */
/**
 * يولّد رابط بوابة من ملف أول طالب متاح (حتى ٣ مرشحين)، يزوره في سياق
 * مجهول ويلتقطه، ثم يُبطل الرابط (تنظيف — دورة حياة الرابط الطبيعية).
 */
async function capturePortal(browser, page, stats, kind, width, file) {
  const isParent = kind === 'portal-parent';
  const tile = isParent ? 'رابط ولي الأمر' : 'رابط بوابة الطالب';
  const generateTexts = isParent
    ? ['توليد رابط ولي الأمر', 'إعادة توليد رابط جديد (يبطل القديم)']
    : ['توليد رابط بوابة الطالب', 'إعادة توليد رابط جديد (يبطل القديم)'];
  const linkRe = isParent ? /https?:\/\/\S+\/portal\?\S+/i : /https?:\/\/\S+\/student-portal\?\S+/i;
  const marker = isParent ? '/portal?' : '/student-portal?';

  await page.goto(BASE + '/students', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await page.waitForFunction(() => document.querySelectorAll('a[href^="/students/"]').length > 0, { timeout: WAIT_TIMEOUT });
  const candidates = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/students/"]')].slice(0, 3).map((a) => a.getAttribute('href')),
  );
  let lastErr = null;
  for (const href of candidates) {
    try {
      await page.goto(BASE + href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitBodyText(page, tile);
      await clickByText(page, tile);
      const genHandle = await page.waitForFunction(
        (texts) => [...document.querySelectorAll('button')].find((b) => texts.some((t) => b.innerText.includes(t))) || null,
        { timeout: WAIT_TIMEOUT },
        generateTexts,
      );
      const genBtn = genHandle.asElement();
      const disabled = await page.evaluate((el) => el.disabled, genBtn);
      if (disabled) {
        await page.keyboard.press('Escape');
        await sleep(500);
        lastErr = new Error(`زر التوليد معطّل للطالب ${href} (لا هاتف ولي على الأرجح)`);
        continue;
      }
      await genBtn.click();
      const link = await page
        .waitForFunction(
          (mk) => {
            const divs = [...document.querySelectorAll('div')];
            for (const d of divs) {
              const t = (d.textContent || '').trim();
              if (t.length < 300 && /^https?:\/\//.test(t) && t.includes(mk)) return t;
            }
            return null;
          },
          { timeout: WAIT_TIMEOUT },
          marker,
        )
        .then((h) => h.jsonValue());
      if (!link || !linkRe.test(link)) throw new Error(`رابط مولّد لا يطابق النمط: ${link}`);
      const url = link.startsWith('http') ? link : BASE + link;
      // الزيارة والالتقاط في سياق مجهول عند العرض المطلوب
      const anon = await browser.createBrowserContext();
      try {
        const p2 = await anon.newPage();
        await p2.setViewport({ width, height: 844, hasTouch: true, isMobile: true });
        await preparePage(p2, stats);
        await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await settle(p2);
        const dom = await collectDomAudit(p2);
        const info = { ...(await shoot(p2, file)), dom };
        const txt = await p2.evaluate(() => document.body.innerText);
        if (/غير صالح|انتهت صلاحية الرابط|رابط غير صحيح/.test(txt)) throw new Error('البوابة عرضت خطأ رابط غير صالح');
        return info;
      } finally {
        await anon.close().catch(() => {});
        // التنظيف: إبطال الرابط من نفس الشيت
        await clickByText(page, 'إلغاء الرابط').catch(() => {});
        await page
          .waitForFunction(() => document.body.innerText.includes('ملغي'), { timeout: 20_000 })
          .catch(() => {});
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(500);
      }
    } catch (e) {
      lastErr = e;
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  throw lastErr || new Error('تعذّر توليد رابط البوابة لأي مرشح');
}

/* ------------------------------- التشغيل ------------------------------- */
async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const stats = { aborted: 0 };
  const manifest = {
    tool: 'visual-capture 3A-326',
    base: BASE,
    frozenNowUtc: FROZEN_UTC,
    timezone: TIMEZONE,
    relay: RELAY,
    theme: THEME ?? 'default(saved/auto)',
    startedAt: new Date().toISOString(),
    widths: {},
  };
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  let failures = 0;
  try {
    for (const width of WIDTHS) {
      const dir = path.join(OUT, String(width));
      fs.mkdirSync(dir, { recursive: true });
      const entries = [];
      manifest.widths[width] = entries;
      let page = await browser.newPage();
      await page.setViewport({ width, height: 844, hasTouch: true, isMobile: true });
      await preparePage(page, stats);
      // الشاشات العامة أولاً (قبل أي جلسة)
      for (const s of screens.filter((x) => x.auth === 'public')) {
        const file = path.join(dir, s.id + '.png');
        try {
          await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
          await settle(page);
          const dom = await collectDomAudit(page);
          const info = { ...(await shoot(page, file)), dom };
          entries.push({ id: s.id, file: `${width}/${s.id}.png`, path: s.path, ...info });
          console.log(`✓ [${width}] ${s.id}`);
        } catch (e) {
          failures++;
          entries.push({ id: s.id, file: `${width}/${s.id}.png`, path: s.path, error: e.message });
          console.log(`✗ [${width}] ${s.id}: ${e.message}`);
        }
      }
      // جلسة الديمو — سياق متصفح مستقل عن مرحلة العامة (عزل SW/التخزين:
      // في أول سويب كامل 2026-11-22 تعطّل دخول الديمو بعد زيارات العامة
      // في نفس السياق ثم نجح في سياق البوابات المستقل) + إعادة محاولة
      // واحدة بسياق جديد عند فشل الدخول قبل إعلان فشل المرحلة.
      await page.close().catch(() => {});
      let demoCtx = await browser.createBrowserContext();
      page = await demoCtx.newPage();
      await page.setViewport({ width, height: 844, hasTouch: true, isMobile: true });
      await preparePage(page, stats);
      const authScreens = screens.filter((x) => x.auth === 'demo');
      if (authScreens.length) {
        let loginErr = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            await demoLogin(page);
            loginErr = null;
            break;
          } catch (e) {
            loginErr = e;
            console.log(`✗ [${width}] demo login attempt ${attempt}: ${e.message}`);
            if (attempt < 2) {
              await demoCtx.close().catch(() => {});
              demoCtx = await browser.createBrowserContext();
              page = await demoCtx.newPage();
              await page.setViewport({ width, height: 844, hasTouch: true, isMobile: true });
              await preparePage(page, stats);
              await sleep(3000);
            }
          }
        }
        if (loginErr) {
          failures += authScreens.length;
          for (const s of authScreens) entries.push({ id: s.id, file: `${width}/${s.id}.png`, error: `فشل دخول الديمو: ${loginErr.message}` });
          authScreens.length = 0;
        }
      }
      const resolved = {};
      for (const s of authScreens) {
        const file = path.join(dir, s.id + '.png');
        try {
          await ensureSession(page);
          let note = null;
          if (s.resolve === 'attendance') {
            const r = await resolveAttendance(page);
            note = r.note;
          } else if (s.resolve) {
            const map = {
              'first-student': ['/students', '/students/'],
              'first-group': ['/groups', '/groups/'],
              'first-invoice': ['/invoices', '/invoices/'],
              'first-assessment': ['/grades', '/assessments/'],
            };
            const [listPath, prefix] = map[s.resolve];
            if (!resolved[s.resolve]) resolved[s.resolve] = await firstHref(page, listPath, prefix);
            await page.goto(BASE + resolved[s.resolve], { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
            note = `حُلّ إلى ${resolved[s.resolve]}`;
          } else {
            await page.goto(BASE + s.path, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
          }
          await settle(page);
          const dom = await collectDomAudit(page);
          const info = { ...(await shoot(page, file)), dom };
          entries.push({ id: s.id, file: `${width}/${s.id}.png`, path: s.path || resolved[s.resolve] || null, ...(note ? { note } : {}), ...info });
          console.log(`✓ [${width}] ${s.id}`);
        } catch (e) {
          failures++;
          entries.push({ id: s.id, file: `${width}/${s.id}.png`, error: e.message });
          console.log(`✗ [${width}] ${s.id}: ${e.message}`);
        }
      }
      // البوابتان بروابط مولّدة
      if (WITH_TOKENS) {
        for (const s of screens.filter((x) => x.auth === 'token')) {
          const file = path.join(dir, s.id + '.png');
          try {
            await ensureSession(page);
            const info = await capturePortal(browser, page, stats, s.id, width, file);
            entries.push({ id: s.id, file: `${width}/${s.id}.png`, path: '(generated token link, revoked after capture)', ...info });
            console.log(`✓ [${width}] ${s.id}`);
          } catch (e) {
            failures++;
            entries.push({ id: s.id, file: `${width}/${s.id}.png`, error: e.message });
            console.log(`✗ [${width}] ${s.id}: ${e.message}`);
          }
        }
      }
      await page.close().catch(() => {});
      await demoCtx.close().catch(() => {});
    }
  } finally {
    await browser.close().catch(() => {});
  }
  manifest.finishedAt = new Date().toISOString();
  manifest.relayAborted = stats.aborted;
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const total = Object.values(manifest.widths).flat().length;
  const ok = Object.values(manifest.widths).flat().filter((e) => !e.error).length;
  console.log(`\nVISUAL_CAPTURE ${failures ? 'INCOMPLETE' : 'OK'} — ناجح ${ok}/${total} (عروض: ${WIDTHS.join('+')}) — أخطاء: ${failures}`);
  if (failures) process.exit(1);
}

main().catch((e) => {
  console.error('capture failed:', e.message);
  process.exit(1);
});
