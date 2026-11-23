#!/usr/bin/env node
/**
 * اختبارات E2E دخانية للتدفقات الحرجة (R1 — بند 3A-311).
 *
 * شبكة أمان آلية: ستة تدفقات دخانية (دخول تجريبي، رئيسية+جرس، طلاب،
 * حضور، فواتير، بوابتان) تعمل بـ Puppeteer على بناء معاينة محلي
 * (vite preview من نفس الكود) ضد Supabase الحي بحساب الديمو العام
 * (بيانات اعتماده عامة عمداً بقرار المالك — لا أسرار أخرى هنا).
 *
 * التشغيل: npm run test:e2e  (يبني أولاً ثم يشغّل هذا الملف)
 *
 * وضع الريلاي (E2E_RELAY): عندما توجد متغيرات بروكسي في البيئة
 * (HTTPS_PROXY) يُفعَّل تلقائياً — تُعترض طلبات المتصفح الخارجية
 * وتُمرَّر عبر Node fetch (يحترم بروكسي البيئة ومخزن شهادات النظام)،
 * لأن Chromium المجمّع لا يقرأ مخزن شهادات النظام في بيئات البروكسي
 * الموقّعة بشهادة وسيطة. في CI (لا بروكسي) يعمل المتصفح مباشرة.
 * فرض صريح: E2E_RELAY=1 / E2E_RELAY=0.
 *
 * سياسة الأخطاء: أخطاء الصفحة (pageerror) وأخطاء الكونسول الفادحة
 * (Uncaught/TypeError/ReferenceError) تُسقط الاختبار؛ فشل تحميل
 * الموارد يُسجَّل تحذيراً (في وضع الريلاي مصدره الريلاي نفسه غالباً).
 * عند أي فشل: لقطة شاشة في e2e/artifacts/<test-id>.png.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = Number(process.env.E2E_PORT || 4173);
const BASE = `http://127.0.0.1:${PORT}`;
const ARTIFACTS = path.join(ROOT, 'e2e', 'artifacts');
const RELAY =
  process.env.E2E_RELAY != null
    ? process.env.E2E_RELAY === '1'
    : Boolean(process.env.HTTPS_PROXY || process.env.https_proxy);
const NAV_TIMEOUT = 60_000;
const WAIT_TIMEOUT = 45_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

/* ---------------------------------- ريلاي الطلبات ---------------------------------- */

async function enableRelay(page, stats) {
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const url = req.url();
    if (
      url.startsWith(BASE) ||
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
      // إعادة واحدة للطلبات الآمنة (قراءة) ضد هزّات البروكسي العابرة
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

/* ---------------------------------- أدوات صفحات ---------------------------------- */

function watchPage(page) {
  const w = { pageErrors: [], consoleErrors: [] };
  page.on('pageerror', (e) => w.pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') w.consoleErrors.push(m.text());
  });
  page.on('dialog', async (d) => {
    await d.accept().catch(() => {});
  });
  return w;
}

const FATAL_CONSOLE = /uncaught|TypeError|ReferenceError|SyntaxError/i;

function fatalErrors(w, from) {
  const errs = [];
  errs.push(...w.pageErrors.slice(from.pe).map((m) => `pageerror: ${m}`));
  errs.push(
    ...w.consoleErrors
      .slice(from.ce)
      .filter((t) => FATAL_CONSOLE.test(t))
      .map((t) => `console: ${t.slice(0, 200)}`),
  );
  return errs;
}

async function waitBodyText(page, text, timeout = WAIT_TIMEOUT) {
  await page.waitForFunction((t) => document.body && document.body.innerText.includes(t), {
    timeout,
  }, text);
}

async function bodyText(page) {
  return page.evaluate(() => (document.body ? document.body.innerText : ''));
}

/** ينقر أول عنصر (زر/رابط) يحتوي نصه على النص المعطى — نقرة حقيقية عبر Puppeteer. */
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
  assert(el, `لم يُعثر على عنصر قابل للنقر يحتوي: ${text}`);
  await el.scrollIntoView().catch(() => {});
  await waitElementStable(page, el);
  await el.click();
  return el;
}

/**
 * انتظار استقرار موضع العنصر قبل النقر: حركات الدخول (شيتات 3A-384
 * تنزلق 340ms) تجعل نقطة النقر متحركة فيفشل نقر Puppeteer الآلي
 * («not clickable») وإن كان العنصر سليماً للمستخدم البشري. ننتظر
 * ثبات المستطيل عبر قياسين متتاليين (بسقف ~ثانيتين ثم نتابع).
 */
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

async function waitPathname(page, expected, timeout = WAIT_TIMEOUT) {
  await page.waitForFunction((p) => location.pathname === p, { timeout }, expected);
}

/* ---------------------------------- جلسة الديمو ---------------------------------- */

async function demoLogin(page) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await clickByText(page, 'دخول تجريبي');
  await waitPathname(page, '/');
  await waitBodyText(page, 'طالب جديد');
  await sleep(1500);
}

async function ensureSession(page) {
  if (page.url().includes('/login') || page.url() === 'about:blank') {
    await demoLogin(page);
    return;
  }
  // إن طُردنا لصفحة الدخول بعد تنقّل، سجّل من جديد
  const onLogin = await page.evaluate(() => location.pathname === '/login').catch(() => false);
  if (onLogin) await demoLogin(page);
}

/* ---------------------------------- الاختبارات ---------------------------------- */

const shared = { studentHref: null, studentName: null };

const tests = [
  {
    id: '01-login-demo',
    title: 'الدخول التجريبي والوصول للرئيسية',
    async run(page) {
      await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitBodyText(page, 'دخول تجريبي');
      await clickByText(page, 'دخول تجريبي');
      await waitPathname(page, '/');
      await waitBodyText(page, 'طالب جديد');
      // مؤشرات الأداء تُجلب باستعلام لاحق للإجراءات السريعة — انتظار لا فحص فوري
      await waitBodyText(page, 'طالب نشط');
    },
  },
  {
    id: '02-home-notifications',
    title: 'بطاقات الرئيسية + فتح الجرس/الإشعارات',
    async run(page) {
      await ensureSession(page);
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitBodyText(page, 'طالب نشط');
      const txt = await bodyText(page);
      for (const label of ['طالب جديد', 'المجموعات', 'الحضور', 'الفواتير'])
        assert(txt.includes(label), `إجراء سريع مفقود في الرئيسية: ${label}`);
      const bell = await page.$('button[aria-label="الإشعارات"]');
      assert(bell, 'زر الجرس (aria-label=الإشعارات) غير موجود');
      await bell.click();
      await waitPathname(page, '/notifications');
      await waitBodyText(page, 'الإشعارات');
    },
  },
  {
    id: '03-students',
    title: 'قائمة الطلاب + فتح ملف طالب',
    async run(page) {
      await ensureSession(page);
      await page.goto(BASE + '/students', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForFunction(
        () => document.querySelectorAll('a[href^="/students/"]').length > 0,
        { timeout: WAIT_TIMEOUT },
      );
      const first = await page.evaluate(() => {
        const a = document.querySelector('a[href^="/students/"]');
        return { href: a.getAttribute('href'), name: (a.innerText || '').split('\n')[0].trim() };
      });
      assert(first.href, 'أول صف طالب بلا رابط');
      shared.studentHref = first.href;
      shared.studentName = first.name;
      await page.click(`a[href="${first.href}"]`);
      await waitPathname(page, first.href);
      if (first.name) await waitBodyText(page, first.name);
      await waitBodyText(page, 'رابط ولي الأمر');
    },
  },
  {
    id: '04-attendance',
    title: 'الحضور: اختيار جلسة/مجموعة وعرض قائمتها',
    async run(page) {
      await ensureSession(page);
      await page.goto(BASE + '/attendance', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      // قد لا توجد حصص اليوم: تقدّم يوماً بيوم (حتى ٧ أيام) عبر مدخل التاريخ
      let found = false;
      for (let offset = 0; offset <= 7 && !found; offset++) {
        if (offset > 0) {
          const d = new Date();
          d.setDate(d.getDate() + offset);
          const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          await page.evaluate((v) => {
            const input = document.querySelector('input[type="date"]');
            if (!input) return;
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            setter.call(input, v);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          }, iso);
        }
        try {
          await page.waitForFunction(
            () =>
              [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'حاضر') ||
              (document.body && document.body.innerText.includes('لا توجد حصص في اليوم ده')),
            { timeout: 25_000 },
          );
        } catch {
          /* جرّب اليوم التالي */
        }
        const state = await page.evaluate(() => ({
          roster: [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'حاضر').length,
          empty: document.body.innerText.includes('لا توجد حصص في اليوم ده'),
        }));
        if (state.roster > 0) found = true;
        else assert(state.empty, 'صفحة الحضور بلا قائمة وبلا حالة فراغ مفهومة');
      }
      assert(found, 'لا جلسة حضور بأي قائمة خلال ٧ أيام من اليوم');
      // اختيار صريح عند تعدد جلسات اليوم: انقر آخر رقاقة جلسة
      const chips = await page.$$('.chip-row-fade button');
      if (chips.length > 1) {
        await chips[chips.length - 1].click();
        await sleep(2500);
      }
      const check = await page.evaluate(() => ({
        roster: [...document.querySelectorAll('button')].filter((b) => b.innerText.trim() === 'حاضر').length,
        progress: /\d+\s*\/\s*\d+/.test(document.body.innerText),
      }));
      assert(check.roster > 0, 'قائمة الجلسة المختارة فارغة (لا أزرار حضور)');
      assert(check.progress, 'عدّاد تقدّم الجلسة (done/total) غير ظاهر');
    },
  },
  {
    id: '05-invoices',
    title: 'قائمة الفواتير + فتح تفاصيل فاتورة',
    async run(page) {
      await ensureSession(page);
      await page.goto(BASE + '/invoices', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForFunction(
        () => document.querySelectorAll('a[href^="/invoices/"]').length > 0,
        { timeout: WAIT_TIMEOUT },
      );
      const href = await page.evaluate(
        () => document.querySelector('a[href^="/invoices/"]').getAttribute('href'),
      );
      await page.click(`a[href="${href}"]`);
      await waitPathname(page, href);
      await page.waitForFunction(
        () =>
          document.body &&
          (document.body.innerText.includes('إيصال') || /20\d\d-\d+/.test(document.body.innerText)),
        { timeout: WAIT_TIMEOUT },
      );
    },
  },
  {
    id: '06-portals',
    title: 'بوابة ولي الأمر + بوابة الطالب (توليد/زيارة/إبطال)',
    async run(page, ctx) {
      await ensureSession(page);
      assert(shared.studentHref, 'لا طالب معروف من اختبار الطلاب');
      // جرّب حتى ٣ طلاب لبوابة ولي الأمر (زر التوليد يُعطَّل بلا هاتف ولي) —
      // المرشحون من صفحة القائمة نفسها لا من أي صفحة متبقية من اختبار سابق
      await page.goto(BASE + '/students', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await page.waitForFunction(
        () => document.querySelectorAll('a[href^="/students/"]').length > 0,
        { timeout: WAIT_TIMEOUT },
      );
      const studentHrefs = await page.evaluate(() =>
        [...document.querySelectorAll('a[href^="/students/"]')]
          .slice(0, 3)
          .map((a) => ({ href: a.getAttribute('href'), name: (a.innerText || '').split('\n')[0].trim() })),
      );
      let guardianDone = false;
      for (const s of studentHrefs) {
        await page.goto(BASE + s.href, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
        await waitBodyText(page, 'رابط ولي الأمر');
        const res = await portalFlow(page, ctx, {
          tile: 'رابط ولي الأمر',
          generateTexts: ['توليد رابط ولي الأمر', 'إعادة توليد رابط جديد (يبطل القديم)'],
          linkRe: /https?:\/\/\S+\/portal\?\S+/i,
          studentName: s.name,
          allowDisabled: true,
        });
        if (res === 'done') {
          guardianDone = true;
          shared.studentHref = s.href;
          shared.studentName = s.name;
          break;
        }
      }
      assert(guardianDone, 'تعذّر إكمال تدفق بوابة ولي الأمر لأي طالب من أول ٣');
      // بوابة الطالب لنفس الطالب الناجح
      await page.goto(BASE + shared.studentHref, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitBodyText(page, 'رابط بوابة الطالب');
      const res2 = await portalFlow(page, ctx, {
        tile: 'رابط بوابة الطالب',
        generateTexts: ['توليد رابط بوابة الطالب', 'إعادة توليد رابط جديد (يبطل القديم)'],
        linkRe: /https?:\/\/\S+\/student-portal\?\S+/i,
        studentName: shared.studentName,
        allowDisabled: false,
      });
      assert(res2 === 'done', 'تعذّر إكمال تدفق بوابة الطالب');
    },
  },
];

/**
 * تدفق بوابة كامل: فتح الشيت ← توليد الرابط ← زيارته في سياق مجهول
 * والتحقق من الهوية ← إبطال الرابط من الشيت (تنظيف).
 * يرجع 'done' أو 'disabled' (زر التوليد معطّل — مسموح لولي الأمر فقط).
 */
async function portalFlow(page, ctx, { tile, generateTexts, linkRe, studentName, allowDisabled }) {
  await clickByText(page, tile);
  // انتظر زر التوليد بأي صيغتيه
  const genHandle = await page
    .waitForFunction(
      (texts) =>
        [...document.querySelectorAll('button')].find(
          (b) => texts.some((t) => b.innerText.includes(t)),
        ) || null,
      { timeout: WAIT_TIMEOUT },
      generateTexts,
    )
    .catch(() => null);
  assert(genHandle, `زر توليد الرابط لم يظهر في شيت: ${tile}`);
  const genBtn = genHandle.asElement();
  const disabled = await page.evaluate((el) => el.disabled, genBtn);
  if (disabled) {
    await page.keyboard.press('Escape');
    await sleep(600);
    if (allowDisabled) return 'disabled';
    throw new Error(`زر توليد الرابط معطّل في: ${tile}`);
  }
  await waitElementStable(page, genBtn);
  await genBtn.click();
  // الرابط الجديد يظهر نصاً داخل الشيت
  const marker = linkRe.source.includes('student-portal') ? '/student-portal?' : '/portal?';
  const link = await page
    .waitForFunction(
      (mk) => {
        // textContent الخام لا فواصل بصرية فيه (عكس innerText الذي يلتف
        // مع التفاف السطر) — خلية الرابط تحتوي الرابط وحده نصاً كاملاً
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
  assert(link && linkRe.test(link), `الرابط المولّد لا يطابق النمط المتوقع: ${link}`);
  const url = link.startsWith('http') ? link : BASE + link;
  // زيارة البوابة في سياق مجهول (بلا جلسة مدرّس)
  const anon = await ctx.browser.createBrowserContext();
  try {
    const p2 = await anon.newPage();
    await p2.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    if (RELAY) await enableRelay(p2, ctx.relayStats);
    const w2 = watchPage(p2);
    await p2.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
    await p2.waitForFunction(
      (name) =>
        document.body &&
        document.body.innerText.length > 80 &&
        (document.body.innerText.includes(name) || document.body.innerText.includes('مدرس تجريبي')),
      { timeout: WAIT_TIMEOUT },
      studentName || '',
    );
    const ptxt = await p2.evaluate(() => document.body.innerText);
    assert(!/غير صالح|انتهت صلاحية الرابط|رابط غير صحيح/.test(ptxt), 'البوابة عرضت خطأ رابط غير صالح');
    assert(w2.pageErrors.length === 0, `أخطاء صفحة داخل البوابة: ${w2.pageErrors[0]}`);
  } finally {
    await anon.close().catch(() => {});
  }
  // التنظيف: إبطال الرابط النشط من نفس الشيت (حوار التأكيد يُقبل تلقائياً)
  await clickByText(page, 'إلغاء الرابط');
  await page
    .waitForFunction(() => document.body.innerText.includes('ملغي'), { timeout: 20_000 })
    .catch(() => {});
  const after = await bodyText(page);
  assert(after.includes('ملغي'), 'لم يظهر تأكيد إبطال الرابط (حالة «ملغي») في الشيت');
  await page.keyboard.press('Escape');
  await sleep(600);
  return 'done';
}

/* ---------------------------------- التشغيل ---------------------------------- */

async function startPreview() {
  const child = spawn(
    process.execPath,
    [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'pipe' },
  );
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (out += d));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`خادم المعاينة خرج مبكراً:\n${out}`);
    try {
      const r = await fetch(BASE + '/');
      if (r.ok) return child;
    } catch {
      /* لم يجهز بعد */
    }
    await sleep(500);
  }
  child.kill('SIGTERM');
  throw new Error('خادم المعاينة لم يجهز خلال ٣٠ ثانية');
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  console.log(`E2E smoke — base=${BASE} relay=${RELAY ? 'on' : 'off'}`);
  const preview = await startPreview();
  const relayStats = { aborted: 0 };
  let browser;
  const results = [];
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, hasTouch: true, isMobile: true });
    const watcher = watchPage(page);
    if (RELAY) await enableRelay(page, relayStats);
    const ctx = { browser, relayStats };
    for (const t of tests) {
      const from = { pe: watcher.pageErrors.length, ce: watcher.consoleErrors.length };
      const started = Date.now();
      try {
        await t.run(page, ctx);
        const fatal = fatalErrors(watcher, from);
        assert(fatal.length === 0, `أخطاء فادحة أثناء الاختبار: ${fatal[0]}`);
        results.push({ id: t.id, title: t.title, ok: true, ms: Date.now() - started });
        console.log(`✓ ${t.id} — ${t.title} (${Math.round((Date.now() - started) / 1000)}s)`);
      } catch (e) {
        const shot = path.join(ARTIFACTS, `${t.id}.png`);
        await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
        results.push({ id: t.id, title: t.title, ok: false, ms: Date.now() - started, error: e.message });
        console.log(`✗ ${t.id} — ${t.title}: ${e.message} [لقطة: e2e/artifacts/${t.id}.png]`);
      }
    }
  } finally {
    if (browser) await browser.close().catch(() => {});
    preview.kill('SIGTERM');
  }
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\nالنتيجة: ${results.length - failed.length}/${results.length} ناجح` +
      (relayStats.aborted ? ` — طلبات ريلاي مُجهضة بعد إعادة المحاولة: ${relayStats.aborted} (تحذير)` : ''),
  );
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('E2E runner failed:', e.message);
  process.exit(1);
});
