#!/usr/bin/env node
/**
 * تدقيق إمكانية الوصول الآلي (فجوة 14 — Phase 2 T8 / 3A-712).
 *
 * يشغّل axe-core (WCAG 2.0/2.1/2.2 — مستويات A وAA) على الشاشات
 * الأساسية في متصفح حقيقي بعرض موبايل 375px ضد Supabase الحي بحساب
 * الديمو العام، ويضيف فحص أهداف اللمس (WCAG 2.2 ‎2.5.8: حد أدنى
 * 24×24px لمستوى AA؛ 24–44px تُبلَّغ استشارياً لأن إرشاد المنصات 44px).
 *
 * بوابة CI: أي مخالفة critical أو serious تُسقط السكربت (وظيفة
 * a11y-audit حاجبة)؛ moderate/minor تُطبع وتُوثَّق ولا تحجب — قرار
 * موثق في docs/PHASE2-T8-PERF-A11Y.md §٢.
 *
 * axe-core اعتمادية تشغيل فقط: تُثبَّت --no-save (محلياً وفي صندوق
 * وظيفة CI) فلا تدخل مانيفستات التطبيق ولا حزمته.
 *
 * التشغيل: `npm run test:a11y` (يبني ثم يشغّل). التقرير الكامل JSON
 * في e2e/artifacts/a11y-audit.json (مجلد مولّد محجوب من git).
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT,
  NAV_TIMEOUT,
  assert,
  demoLogin,
  emulateMobile,
  fatalErrors,
  launchAuditedPage,
  launchBrowser,
  sleep,
  startPreview,
  waitBodyText,
} from './audit_harness.mjs';

const PORT = Number(process.env.A11Y_PORT || 4176);
const OUT_DIR = path.join(ROOT, 'e2e', 'artifacts');
const OUT_FILE = path.join(OUT_DIR, 'a11y-audit.json');

const AXE_PATH = path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js');
if (!fs.existsSync(AXE_PATH)) {
  console.error(
    'axe-core غير مثبّت — شغّل: npm i --no-save axe-core@4.11.0 (اعتمادية تشغيل فقط، لا تُحفظ في المانيفستات)',
  );
  process.exit(2);
}
const AXE_SOURCE = fs.readFileSync(AXE_PATH, 'utf8');

/** الشاشات الأساسية: [المسار، نص علامة الجاهزية] */
const AUTHED_SCREENS = [
  ['/', 'طالب جديد'],
  ['/attendance', 'الحضور'],
  ['/students', 'الطلاب'],
  ['/invoices', 'الفواتير'],
  ['/homework', 'الواجب'],
  ['/schedule', 'الجدول'],
  ['/money', 'المالية'],
  ['/notifications', 'الإشعارات'],
  ['/more', 'المزيد'],
  ['/settings', 'الإعدادات'],
];

async function runAxe(page) {
  await page.evaluate((src) => {
    // حقن axe في سياق الصفحة (مصدره ملف الحزمة الرسمي)
    const s = document.createElement('script');
    s.textContent = src;
    document.head.appendChild(s);
  }, AXE_SOURCE);
  return page.evaluate(async () => {
    const axe = window.axe;
    if (!axe) throw new Error('axe لم يُحقن');
    const results = await axe.run(document, {
      runOnly: {
        type: 'tag',
        values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      },
      resultTypes: ['violations'],
    });
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({
        target: n.target.join(' '),
        summary: (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 300),
      })),
    }));
  });
}

/** أهداف لمس أصغر من حد WCAG 2.2 AA ‏(24px) + نطاق استشاري حتى 44px */
async function touchTargets(page) {
  return page.evaluate(() => {
    const sel =
      'a[href], button, input, select, textarea, [role="button"], [role="tab"], [role="switch"], [tabindex]';
    const out = { below24: [], below44: [] };
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden' || style.display === 'none')
        continue;
      const rec = {
        tag: el.tagName.toLowerCase(),
        text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '')
          .trim()
          .slice(0, 40),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
      if (r.width < 24 || r.height < 24) out.below24.push(rec);
      else if (r.width < 44 || r.height < 44) out.below44.push(rec);
    }
    return out;
  });
}

async function auditScreen(page, base, route, marker) {
  await page.goto(base + route, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  if (marker) await waitBodyText(page, marker).catch(() => {});
  await sleep(1200); // استقرار الرسم/الحركات قبل القياس
  const violations = await runAxe(page);
  const targets = await touchTargets(page);
  return { route, violations, targets };
}

async function main() {
  const preview = await startPreview(PORT);
  const base = preview.base;
  const browser = await launchBrowser();
  const report = { at: new Date().toISOString(), base, screens: [] };
  let failures = 0;
  try {
    const { page, watch } = await launchAuditedPage(browser, base);
    await emulateMobile(page);

    // شاشة الدخول (عامة)
    report.screens.push(await auditScreen(page, base, '/login', 'دخول تجريبي'));

    await demoLogin(page, base);
    for (const [route, marker] of AUTHED_SCREENS) {
      report.screens.push(await auditScreen(page, base, route, marker));
    }

    const fatal = fatalErrors(watch);
    if (fatal.length) {
      failures += 1;
      console.error('أخطاء فادحة أثناء التدقيق:\n' + fatal.map((e) => `  ${e}`).join('\n'));
    }
  } finally {
    await browser.close().catch(() => {});
    preview.child.kill('SIGTERM');
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(report, null, 2));

  console.log('— تدقيق إمكانية الوصول (axe — WCAG 2.2 AA) + أهداف اللمس —');
  for (const s of report.screens) {
    const byImpact = {};
    for (const v of s.violations) {
      byImpact[v.impact || 'unknown'] = (byImpact[v.impact || 'unknown'] || 0) + v.nodes.length;
    }
    const parts = Object.entries(byImpact)
      .map(([k, n]) => `${k}:${n}`)
      .join(' ');
    console.log(
      `${s.route} — مخالفات: ${s.violations.length} قاعدة (${parts || 'لا شيء'}) | لمس <24px: ${s.targets.below24.length} | لمس 24–44px: ${s.targets.below44.length}`,
    );
    for (const v of s.violations) {
      console.log(`   [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length} عقدة)`);
      for (const n of v.nodes.slice(0, 3)) console.log(`        ${n.target} :: ${n.summary}`);
      if (v.nodes.length > 3) console.log(`        … و${v.nodes.length - 3} عقد أخرى`);
      if (v.impact === 'critical' || v.impact === 'serious') failures += 1;
    }
    for (const tEl of s.targets.below24.slice(0, 5)) {
      console.log(`   [touch<24] ${tEl.tag} «${tEl.text}» ${tEl.w}×${tEl.h}`);
    }
  }
  console.log(`التقرير الكامل: ${path.relative(ROOT, OUT_FILE)}`);
  assert(failures === 0, `توجد مخالفات critical/serious أو أخطاء فادحة: ${failures}`);
  console.log('لا مخالفات critical/serious.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
