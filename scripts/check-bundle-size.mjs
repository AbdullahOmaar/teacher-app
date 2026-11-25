#!/usr/bin/env node
/**
 * حارس حجم الحزمة (فجوة 7 — Phase 2 T8 / 3A-712).
 *
 * يقيس بناء dist الفعلي ويقارنه بميزانيات موثقة — لا أرقام من الذاكرة:
 * خط الأساس قيس من بناء main ‏(4f99130) بتاريخ 2026-11-25، والميزانية =
 * خط الأساس + هامش نمو مقصود (~١٠٪) حتى لا يرنّ الحارس مع كل ميزة
 * صغيرة، لكن أي قفزة حقيقية (اعتمادية ثقيلة تتسلل للدفعة الأولى، أو
 * فقدان تقسيم كسول لشاشة ثقيلة) تكسره بصوت عالٍ في CI.
 *
 * المقاييس:
 * - JS الأولي: كل ملفات JS المشار إليها من dist/index.html ‏(script +
 *   modulepreload) — ما يُنزَّل فعلاً قبل أول رسم تفاعلي.
 * - JS الكلي: كل chunks ‏(بما فيها الكسولة) — سقف ضد تضخم عام.
 * - أكبر chunk منفرد: يمنع شاشة/مكتبة واحدة من الابتلاع الصامت.
 * - CSS الكلي: ملف واحد حالياً.
 * الأوزان تُقاس gzip (ما يمرّ على الشبكة فعلياً) والخام يُطبع للسياق.
 *
 * التشغيل: بعد `npm run build` — ‏`npm run test:bundle`.
 * في CI: خطوة حاجبة داخل وظيفة check-and-test (قرار التوثيق في
 * docs/PHASE2-T8-PERF-A11Y.md §١).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const ASSETS = path.join(DIST, 'assets');

/* الميزانيات (بايتات gzip ما لم يُذكر) — خط الأساس 2026-11-25 بين قوسين */
const BUDGETS = {
  initialJsGzip: 290_000, // (263,491 عند القياس الأول)
  totalJsGzip: 815_000, // (739,702)
  largestChunkRaw: 560_000, // (477,300 — chunk مكتبة الجداول الكسول)
  totalCssGzip: 24_000, // (19,960)
};

function gzipSize(buf) {
  return zlib.gzipSync(buf).length;
}

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exitCode = 1;
}

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/index.html غير موجود — شغّل `npm run build` أولاً.');
  process.exit(1);
}

const html = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const initialRefs = new Set(
  [...html.matchAll(/(?:src|href)="(?:\/)?(assets\/[^"]+\.js)"/g)].map((m) => m[1]),
);
if (initialRefs.size === 0) fail('لم يُعثر على أي JS مرجعي في index.html — شكل البناء تغيّر؟');

let initialRaw = 0;
let initialGzip = 0;
let totalJsRaw = 0;
let totalJsGzip = 0;
let totalCssRaw = 0;
let totalCssGzip = 0;
let largest = { name: '', raw: 0 };

for (const f of fs.readdirSync(ASSETS)) {
  const p = path.join(ASSETS, f);
  const buf = fs.readFileSync(p);
  if (f.endsWith('.js')) {
    const gz = gzipSize(buf);
    totalJsRaw += buf.length;
    totalJsGzip += gz;
    if (buf.length > largest.raw) largest = { name: f, raw: buf.length };
    if (initialRefs.has(`assets/${f}`)) {
      initialRaw += buf.length;
      initialGzip += gz;
    }
  } else if (f.endsWith('.css')) {
    totalCssRaw += buf.length;
    totalCssGzip += gzipSize(buf);
  }
}

const fmt = (n) => n.toLocaleString('en-US');
const row = (label, value, budget) => {
  const ok = value <= budget;
  console.log(
    `${ok ? '✓' : '✗'} ${label}: ${fmt(value)} / ميزانية ${fmt(budget)}${ok ? '' : ' — تجاوز!'}`,
  );
  if (!ok) process.exitCode = 1;
};

console.log('— حارس حجم الحزمة (فجوة 7) —');
console.log(
  `JS الأولي: ${initialRefs.size} ملفاً مرجعياً من index.html (خام ${fmt(initialRaw)})`,
);
row('JS الأولي (gzip)', initialGzip, BUDGETS.initialJsGzip);
console.log(`JS الكلي: خام ${fmt(totalJsRaw)}`);
row('JS الكلي (gzip)', totalJsGzip, BUDGETS.totalJsGzip);
row(`أكبر chunk منفرد (خام) — ${largest.name}`, largest.raw, BUDGETS.largestChunkRaw);
console.log(`CSS الكلي: خام ${fmt(totalCssRaw)}`);
row('CSS الكلي (gzip)', totalCssGzip, BUDGETS.totalCssGzip);

if (process.exitCode) {
  console.error(
    'كُسرت ميزانية الحزمة: راجع docs/PHASE2-T8-PERF-A11Y.md §١ قبل رفع أي ميزانية — الرفع قرار موثق لا إسكات.',
  );
} else {
  console.log('كل الميزانيات سليمة.');
}
