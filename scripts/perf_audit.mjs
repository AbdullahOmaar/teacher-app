#!/usr/bin/env node
/**
 * تدقيق الأداء والأجهزة الضعيفة والأوفلاين (فجوة 7 + بنود الموجة —
 * Phase 2 T8 / 3A-712).
 *
 * قياس مختبري بمتصفح حقيقي (Puppeteer + CDP) بعرض موبايل 375px —
 * «ما يعادله Lighthouse» بلا اعتمادية ثقيلة جديدة: نرصد مداخل
 * Performance API نفسها التي يبني عليها Lighthouse حكمه (LCP/CLS/
 * FCP/TTFB + مهام طويلة + حدث تفاعل فعلي لقياس زمن الاستجابة)،
 * بملفين: عادي، و«جهاز ضعيف» (Slow-4G + خنق معالج ×4).
 *
 * صدق القياس: في بيئة التطوير تمرّ الطلبات الخارجية عبر ريلاي
 * بروكسي (نمط e2e) فيتضخم زمن الشبكة؛ وفي CI تمرّ مباشرة من خوادم
 * GitHub لا من شبكة مستخدم مصري — لذا الأرقام المطلقة خطوط أساس
 * للانحدار لا حكم ميداني، والمقاييس الحتمية (CLS/مهام طويلة/حجم
 * JS) هي الإشارة الأقوى. القياس الميداني الحقيقي (RUM) متابعة
 * موثقة في docs/PHASE2-T8-PERF-A11Y.md §١.
 *
 * قسم الأوفلاين سلوكي وحاجب: قشرة التطبيق من الكاش + شريط الأوفلاين
 * + طابور حضور يُكتب محلياً ولا يُفقد (يُنظَّف محلياً داخل الاختبار
 * نفسه قبل عودة الاتصال حتى لا يمسّ بيانات الديمو).
 *
 * التشغيل: `npm run test:perf` (يبني ثم يشغّل). التقرير JSON في
 * e2e/artifacts/perf-audit.json. في CI: وظيفة perf-audit معلوماتية
 * (continue-on-error) بنمط الانحدار البصري — الدرجات المختبرية
 * متذبذبة على خوادم مشتركة، والبوابة الحاجبة للأداء هي حارس الحجم
 * الحتمي (test:bundle)؛ ترقية هذا السكربت لقرار لاحق بالأدلة.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  NAV_TIMEOUT,
  WAIT_TIMEOUT,
  assert,
  bodyText,
  clearThrottle,
  clickByText,
  demoLogin,
  emulateMobile,
  fatalErrors,
  launchAuditedPage,
  launchBrowser,
  sleep,
  startPreview,
  throttleWeakDevice,
  waitBodyText,
} from './audit_harness.mjs';

const PORT = Number(process.env.PERF_PORT || 4177);
const OUT_DIR = path.join(ROOT, 'e2e', 'artifacts');
const OUT_FILE = path.join(OUT_DIR, 'perf-audit.json');
const QUEUE_KEY = 'teacher-app-attendance-queue-v1';

/** حقن مراقبي الأداء قبل أي تنقّل: LCP/CLS/مهام طويلة/أحداث تفاعل */
async function instrument(page) {
  await page.evaluateOnNewDocument(() => {
    const m = {
      lcp: 0,
      lcpElement: '',
      cls: 0,
      shifts: [],
      longTasks: [],
      events: [],
    };
    window.__perf = m;
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          m.lcp = e.renderTime || e.loadTime || e.startTime;
          m.lcpElement = e.element ? e.element.tagName + '.' + (e.element.className || '') : '';
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    } catch { /* غير مدعوم */ }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) {
            m.cls += e.value;
            if (e.value > 0.01) {
              m.shifts.push({
                value: Number(e.value.toFixed(3)),
                sources: (e.sources || []).slice(0, 3).map((s) => {
                  const n = s.node;
                  if (!n) return '?';
                  const cls =
                    n.className && typeof n.className === 'string'
                      ? '.' + n.className.split(' ').slice(0, 3).join('.')
                      : '';
                  const txt = (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
                  const pr = s.previousRect || {};
                  const cr = s.currentRect || {};
                  return `${n.nodeName.toLowerCase()}${cls} «${txt}» ${Math.round(pr.height || 0)}→${Math.round(cr.height || 0)}px`;
                }),
              });
            }
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* غير مدعوم */ }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) m.longTasks.push(Math.round(e.duration));
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* غير مدعوم */ }
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) m.events.push(Math.round(e.duration));
      }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
    } catch { /* غير مدعوم */ }
  });
}

async function collectMetrics(page) {
  return page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] || {};
    const paints = performance.getEntriesByType('paint');
    const fcp = paints.find((p) => p.name === 'first-contentful-paint');
    let jsBytes = 0;
    let reqCount = 0;
    for (const r of performance.getEntriesByType('resource')) {
      reqCount += 1;
      if (r.initiatorType === 'script' || r.name.endsWith('.js')) {
        jsBytes += r.encodedBodySize || r.transferSize || 0;
      }
    }
    const m = window.__perf || { lcp: 0, cls: 0, longTasks: [], events: [] };
    return {
      ttfb: Math.round(nav.responseStart || 0),
      fcp: Math.round(fcp ? fcp.startTime : 0),
      dcl: Math.round(nav.domContentLoadedEventEnd || 0),
      load: Math.round(nav.loadEventEnd || 0),
      lcp: Math.round(m.lcp || 0),
      lcpElement: m.lcpElement || '',
      cls: Number((m.cls || 0).toFixed(3)),
      shifts: (m.shifts || []).sort((a, b) => b.value - a.value).slice(0, 5),
      longTaskCount: m.longTasks.length,
      longTaskTotal: m.longTasks.reduce((a, b) => a + b, 0),
      longTaskMax: m.longTasks.length ? Math.max(...m.longTasks) : 0,
      maxEventMs: m.events.length ? Math.max(...m.events) : 0,
      jsTransferBytes: jsBytes,
      requests: reqCount,
    };
  });
}

/** تفاعل حقيقي: كتابة في بحث الطلاب أو نقر تبويب — لقياس زمن الحدث */
async function interact(page, route) {
  if (route === '/students') {
    const input = await page.$('input[type="search"], input[placeholder]');
    if (input) {
      await input.click();
      await input.type('ا', { delay: 60 });
      await sleep(900);
    }
  } else {
    if (page.touchscreen && page.touchscreen.tap) {
      await page.touchscreen.tap(187, 400).catch(() => {});
    } else {
      await page.mouse.click(187, 400).catch(() => {});
    }
    await sleep(900);
  }
}

async function measureScreen(browser, base, route, marker, profile) {
  // شاشة الدخول تُقاس في سياق متصفح معزول: جلسة حية من قياس سابق
  // في نفس المتصفح كانت ستعيد توجيه /login للرئيسية فلا يظهر زر
  // الديمو أبداً (علّة قياس شُخّصت أثناء T8 — لا علاقة لها بالتطبيق)
  const context = route === '/login' ? await browser.createBrowserContext() : null;
  const { page, watch } = await launchAuditedPage(browser, base, context);
  await emulateMobile(page);
  await instrument(page);
  let cdp = null;
  if (profile === 'weak') cdp = await throttleWeakDevice(page);
  const T = profile === 'weak' ? 120_000 : WAIT_TIMEOUT;
  try {
    if (route === '/login') {
      await page.goto(base + '/login', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      await waitBodyText(page, 'دخول تجريبي', T);
    } else {
      await demoLogin(page, base, T);
      // تحميل وثيقة كامل للشاشة المقاسة (لا تنقّل SPA): مقاييس الرسم
      // (LCP/FCP) لكل وثيقة، والتنقّل الداخلي كان سيلوّثها من شاشة
      // الدخول — والجلسة محفوظة في localStorage فلا دخول جديداً.
      await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
      if (marker) await waitBodyText(page, marker, T).catch(() => {});
    }
    await sleep(2500); // استقرار LCP/CLS بعد الرسم
    await interact(page, route);
    const metrics = await collectMetrics(page);
    return { route, profile, metrics, fatal: fatalErrors(watch) };
  } finally {
    await clearThrottle(cdp);
    await page.close().catch(() => {});
    if (context) await context.close().catch(() => {});
  }
}

/* ------------------------------- قسم الأوفلاين ------------------------------ */

async function offlineSection(browser, base) {
  const results = [];
  const { page, watch } = await launchAuditedPage(browser, base);
  await emulateMobile(page);
  await demoLogin(page, base);

  // انتظار تفعيل عامل الخدمة والتحكم بالصفحة
  await page.evaluate(async () => {
    if ('serviceWorker' in navigator) await navigator.serviceWorker.ready;
  });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  await waitBodyText(page, 'طالب جديد');
  await sleep(1000);
  const swState = await page.evaluate(async () => ({
    hasController: Boolean(navigator.serviceWorker && navigator.serviceWorker.controller),
  }));
  results.push({ check: 'sw-controller', pass: swState.hasController, detail: JSON.stringify(swState) });

  // قطع الاتصال وإعادة التحميل: القشرة من الكاش + شريط أوفلاين صادق
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {});
  await sleep(2500);
  const offlineHome = await page.evaluate(() => ({
    textLen: document.body ? document.body.innerText.length : 0,
    text: document.body ? document.body.innerText.slice(0, 400) : '',
  }));
  results.push({
    check: 'offline-reload-shell',
    pass: offlineHome.textLen > 80,
    detail: `body=${offlineHome.textLen} chars`,
  });
  const stripVisible =
    offlineHome.text.includes('مفيش نت') || offlineHome.text.includes('غير متصل');
  results.push({
    check: 'offline-strip-visible',
    pass: stripVisible,
    detail: stripVisible ? 'شريط الأوفلاين ظاهر' : `غير ظاهر — أول النص: ${offlineHome.text.slice(0, 120)}`,
  });

  // تنقّل لشاشة بيانات أثناء الأوفلاين: لا شاشة بيضاء ولا انهيار
  await page.goto(base + '/students', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {});
  await sleep(2500);
  const offlineStudents = await page.evaluate(() => ({
    textLen: document.body ? document.body.innerText.length : 0,
  }));
  results.push({
    check: 'offline-data-screen-not-blank',
    pass: offlineStudents.textLen > 80,
    detail: `body=${offlineStudents.textLen} chars`,
  });
  await page.setOfflineMode(false);
  await sleep(1000);

  // طابور الحضور: تعليم طالب أثناء الأوفلاين يُحفظ محلياً ولا يُفقد.
  // الجاهزية تُنتظَر فعلياً لا بنوم ثابت (نمط e2e)، واليوم الصالح هو
  // يوم جلسته غير ملغاة (أزرار الجلسة الملغاة disabled بحكم التصميم
  // وchangeValue يرفضها بحارس cancelled). تشخيص T8 بمَسابير موثقة:
  // الزر أعلى عنصر عند مركزه والنقر البرمجي يكتب فوراً — فشل النقر
  // الفيزيائي كان اعتراض الشريط اللاصق السفلي لمركز الزر.
  const rosterReady = () =>
    page.evaluate(() => {
      const text = document.body ? document.body.innerText : '';
      const statusBtns = [...document.querySelectorAll('button')].filter(
        (b) => b.innerText.trim() === 'حاضر',
      );
      return {
        // زر مفعّل فعلياً: الجلسة الملغاة أزرارها disabled والنقر
        // عليها لا يكتب بحكم التصميم — تُتخطى لأقرب يوم صالح
        ready:
          statusBtns.some((b) => !b.disabled) && /\d+\s*\/\s*\d+/.test(text),
        empty: text.includes('لا توجد حصص في اليوم ده'),
        blocked: statusBtns.length > 0 && statusBtns.every((b) => b.disabled),
      };
    });
  await page.goto(base + '/attendance', { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  let rosterFound = false;
  for (let offset = 0; offset <= 7 && !rosterFound; offset++) {
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
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !rosterFound) {
      const st = await rosterReady().catch(() => ({ ready: false, empty: false }));
      if (st.ready) rosterFound = true;
      else if (st.empty || st.blocked) break;
      else await sleep(700);
    }
  }
  results.push({ check: 'attendance-roster-found', pass: rosterFound, detail: '' });
  if (rosterFound) {
    // اختيار جلسة صريح عند التعدد (نمط e2e): جرّب الشرائح من الأخير
    // للأول واثبت على أول جلسة جاهزة فعلاً — الشريحة الأخيرة قد تكون
    // جلسة ملغاة (أزرارها معطّلة) فلا تُكتب منها كتابة أبداً
    const chips = await page.$$('.chip-row-fade button');
    if (chips.length > 1) {
      for (let ci = chips.length - 1; ci >= 0; ci--) {
        await chips[ci].click();
        const deadline = Date.now() + 8_000;
        let ok = false;
        while (Date.now() < deadline) {
          const st = await rosterReady().catch(() => ({ ready: false }));
          if (st.ready) {
            ok = true;
            break;
          }
          await sleep(700);
        }
        if (ok) break;
      }
    }
    await page.setOfflineMode(true);
    await sleep(300);
    // زر حالة غير نشط حالياً: النقر على الحالة النشطة نفسها لا يُنتج
    // كتابة أصلاً (لا تغيير) فلا شيء يُطابَق — درس تشخيص T8. النشط
    // يُعرف بكلاس att-active-* (index.css).
    // النقر: فيزيائي بعد تمرير الزر لوسط الشاشة وتأكيد أنه العنصر
    // الأعلى عند مركزه (الشريط اللاصق السفلي يعترض نقرات الأزرار
    // القريبة من أسفل الشاشة — تشخيص T8)، وعند الاعتراض سقوط موثّق
    // لنقر DOM: الغرض فحص مسار الكتابة نفسه لا محاكاة الإصبع.
    const clickInactiveStatus = async () => {
      const btn = await page.evaluateHandle(() => {
        const btns = [...document.querySelectorAll('button')];
        return (
          btns.find(
            (b) =>
              b.innerText.trim() === 'حاضر' &&
              !b.disabled &&
              !b.className.includes('att-active'),
          ) ||
          btns.find(
            (b) =>
              b.innerText.trim() === 'غائب' &&
              !b.disabled &&
              !b.className.includes('att-active'),
          ) ||
          null
        );
      });
      const el = btn.asElement();
      if (!el) return 'none';
      await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
      await sleep(350);
      const onTop = await el.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === n;
      });
      if (onTop) {
        await el.click();
        return 'physical';
      }
      await el.evaluate((n) => n.click());
      return 'dom-fallback';
    };
    const readQueueLen = async () => {
      const raw = await page.evaluate((k) => localStorage.getItem(k), QUEUE_KEY);
      try {
        const parsed = JSON.parse(raw || '[]');
        return Array.isArray(parsed) ? parsed.length : (parsed.items || []).length;
      } catch {
        return 0;
      }
    };
    const method1 = await clickInactiveStatus();
    await sleep(2500);
    let queueLen = await readQueueLen();
    let method = method1;
    if (queueLen === 0) {
      // محاولة ثانية موثقة قبل إعلان الفشل (هزّة توقيت لا صمت)
      method = await clickInactiveStatus();
      await sleep(2500);
      queueLen = await readQueueLen();
    }
    results.push({
      check: 'offline-attendance-queued',
      pass: queueLen >= 1,
      detail: `queue items=${queueLen}, click=${method}`,
    });
    // تنظيف محلي قبل عودة الاتصال: حذف المفتاح ثم إعادة تحميل أوفلاين
    // (تُنهي أي حالة محرك مزامنة في الذاكرة) — لا شيء يصل للخادم
    // من هذا الاختبار إطلاقاً
    await page.evaluate((k) => localStorage.removeItem(k), QUEUE_KEY);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT }).catch(() => {});
    await sleep(1000);
    await page.setOfflineMode(false);
    await sleep(500);
  } else {
    await page.setOfflineMode(false);
  }

  const fatal = fatalErrors(watch);
  results.push({ check: 'offline-no-fatal-errors', pass: fatal.length === 0, detail: fatal.join(' | ') });
  await page.close().catch(() => {});
  return results;
}

/* ---------------------------------- الرئيسي --------------------------------- */

const SCREENS = [
  ['/login', null],
  ['/', 'طالب جديد'],
  ['/students', 'الطلاب'],
  ['/invoices', 'الفواتير'],
  ['/attendance', 'الحضور'],
];

async function main() {
  const preview = await startPreview(PORT);
  const base = preview.base;
  const browser = await launchBrowser();
  const report = { at: new Date().toISOString(), base, measurements: [], offline: [] };
  try {
    if (process.env.PERF_ONLY_OFFLINE === '1') {
      report.offline = await offlineSection(browser, base);
      console.log('— الأوفلاين (وضع مختصر) —');
      for (const r of report.offline) {
        console.log(`${r.pass ? '✓' : '✗'} ${r.check}${r.detail ? ' — ' + r.detail : ''}`);
      }
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
      const fails = report.offline.filter((r) => !r.pass);
      assert(fails.length === 0, `فحوص أوفلاين فاشلة: ${fails.length}`);
      console.log('كل فحوص الأوفلاين ناجحة.');
      return;
    }
    for (const profile of ['regular', 'weak']) {
      for (const [route, marker] of SCREENS) {
        const r = await measureScreen(browser, base, route, marker, profile);
        report.measurements.push(r);
        const m = r.metrics;
        console.log(
          `[${profile}] ${route} — TTFB ${m.ttfb}ms | FCP ${m.fcp}ms | LCP ${m.lcp}ms | CLS ${m.cls} | مهام طويلة ${m.longTaskCount} (${m.longTaskTotal}ms، أقصى ${m.longTaskMax}ms) | أطول حدث ${m.maxEventMs}ms | JS منقول ${Math.round(m.jsTransferBytes / 1024)}KB | طلبات ${m.requests}${r.fatal.length ? ' | أخطاء فادحة: ' + r.fatal.join('; ') : ''}`,
        );
        if (m.cls > 0.1 && m.shifts && m.shifts.length) {
          for (const s of m.shifts) {
            console.log(`    إزاحة ${s.value}: ${s.sources.join(', ')}`);
          }
        }
      }
    }
    report.offline = await offlineSection(browser, base);
    console.log('— الأوفلاين —');
    for (const r of report.offline) {
      console.log(`${r.pass ? '✓' : '✗'} ${r.check}${r.detail ? ' — ' + r.detail : ''}`);
    }
  } finally {
    await browser.close().catch(() => {});
    preview.child.kill('SIGTERM');
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));
  console.log(`التقرير الكامل: ${path.relative(ROOT, OUT_FILE)}`);

  const hardFails = [
    ...report.measurements.filter((r) => r.fatal.length),
    ...report.offline.filter((r) => !r.pass),
  ];
  assert(hardFails.length === 0, `فحوص صلبة فاشلة: ${hardFails.length}`);
  console.log('كل الفحوص الصلبة (أخطاء فادحة/أوفلاين) ناجحة.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
