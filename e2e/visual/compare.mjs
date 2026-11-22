#!/usr/bin/env node
/**
 * مقارنة الانحدار البصري (3A-326): يلتقط مجموعة جديدة (أو يقرأ مجموعة
 * جاهزة بـ --from) ويقارن كل لقطة بخط الأساس المعتمد في
 * e2e/visual/baseline/ عبر pixelmatch، ويُنتج تقريراً قابلاً للفتح
 * (report.html + summary.json + صور الفرق) في e2e/visual/reports/<time>/.
 *
 * دلالات الخروج (وظيفة CI معلوماتية — نمط المعايير الحية v1.3):
 * - فروقات بصرية = بيانات تُبلَّغ (سطور تحذير + التقرير)، لا فشل صامت
 *   ولا كسر للوظيفة: الخروج 0 ما دامت الآلية سليمة.
 * - فشل الآلية نفسها (لقطات صفر/أقل من خط الأساس، أساس مفقود) = خروج 1
 *   بصوت عالٍ — «حارس العدّاد»: جوب فارغ لا يمرّ كأنه نظيف أبداً.
 * - --fail-on-diff: يحوّل أي فرق فوق السماحية إلى خروج 1 (مسار الترقية
 *   المستقبلي لوظيفة حاجبة — قرار لاحق).
 *
 * الاستخدام:
 *   node e2e/visual/compare.mjs [--from <capture-dir>] [--out <report-dir>]
 *        [--base <url>] [--fail-on-diff]
 * بلا --from يلتقط طازجاً من الإنتاج عبر capture.mjs كعملية ابنة.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { SCREENS } from './screens.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.join(HERE, 'baseline');
const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const FROM = arg('from', null);
const FAIL_ON_DIFF = args.includes('--fail-on-diff');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const REPORT_DIR = arg('out', path.join(HERE, 'reports', stamp));

function readPng(file) {
  return PNG.sync.read(fs.readFileSync(file));
}

/** يطبع صورتين على قماش مشترك (الأكبر) بخلفية بيضاء؛ الفرق خارج التداخل يُحسب كاملاً. */
function align(a, b) {
  const w = Math.max(a.width, b.width);
  const h = Math.max(a.height, b.height);
  const mk = (src) => {
    const out = new PNG({ width: w, height: h });
    out.data.fill(255);
    PNG.bitblt(src, out, 0, 0, src.width, src.height, 0, 0);
    return out;
  };
  return { a: mk(a), b: mk(b), w, h, overlap: Math.min(a.width, b.width) * Math.min(a.height, b.height), total: w * h };
}

function main() {
  if (!fs.existsSync(path.join(BASELINE_DIR, 'baseline.json'))) {
    console.error('VISUAL_COMPARE FAIL — خط الأساس مفقود (e2e/visual/baseline/baseline.json). ابنِه أولاً: node e2e/visual/capture.mjs --out e2e/visual/baseline');
    process.exit(1);
  }
  const baselineMeta = JSON.parse(fs.readFileSync(path.join(BASELINE_DIR, 'baseline.json'), 'utf8'));

  let captureDir = FROM;
  let tmpDir = null;
  if (!captureDir) {
    tmpDir = fs.mkdtempSync(path.join(HERE, '.tmp-capture-'));
    const capArgs = [path.join(HERE, 'capture.mjs'), '--out', tmpDir];
    if (arg('base', null)) capArgs.push('--base', arg('base'));
    console.log('…التقاط طازج للمقارنة');
    const r = spawnSync(process.execPath, capArgs, { stdio: 'inherit' });
    if (r.status !== 0) {
      console.error('VISUAL_COMPARE FAIL — الالتقاط الطازج فشل (انظر رسائل الالتقاط أعلاه)');
      process.exit(1);
    }
    captureDir = tmpDir;
  }
  const capManifest = JSON.parse(fs.readFileSync(path.join(captureDir, 'manifest.json'), 'utf8'));

  fs.mkdirSync(path.join(REPORT_DIR, 'diff'), { recursive: true });
  const toleranceOf = new Map(SCREENS.map((s) => [s.id, s.maxDiffRatio ?? 0.002]));
  const rows = [];
  let compared = 0;
  let diffed = 0;
  let errors = 0;

  for (const width of Object.keys(baselineMeta.widths || { 390: 1, 360: 1 })) {
    const baseEntries = fs
      .readdirSync(path.join(BASELINE_DIR, width))
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.replace(/\.png$/, ''));
    for (const id of baseEntries) {
      const baseFile = path.join(BASELINE_DIR, width, id + '.png');
      const curFile = path.join(captureDir, width, id + '.png');
      const tol = toleranceOf.get(id) ?? 0.002;
      if (!fs.existsSync(curFile)) {
        errors++;
        rows.push({ id, width, status: 'missing-current', tol });
        console.log(`::error::[${width}] ${id}: اللقطة الجديدة مفقودة`);
        continue;
      }
      const base = readPng(baseFile);
      const cur = readPng(curFile);
      const { a, b, w, h, total } = align(base, cur);
      const diff = new PNG({ width: w, height: h });
      const diffPixels = pixelmatch(a.data, b.data, diff.data, w, h, { threshold: 0.1, includeAA: false });
      const ratio = diffPixels / total;
      compared++;
      const status = ratio > tol ? 'diff' : 'match';
      if (status === 'diff') {
        diffed++;
        const diffName = `${width}-${id}.diff.png`;
        fs.writeFileSync(path.join(REPORT_DIR, 'diff', diffName), PNG.sync.write(diff));
        fs.copyFileSync(curFile, path.join(REPORT_DIR, 'diff', `${width}-${id}.current.png`));
        fs.copyFileSync(baseFile, path.join(REPORT_DIR, 'diff', `${width}-${id}.baseline.png`));
        console.log(`::warning::[${width}] ${id}: فرق بصري ${(ratio * 100).toFixed(3)}% (السماحية ${(tol * 100).toFixed(2)}%)`);
      }
      rows.push({ id, width, status, diffPixels, totalPixels: total, ratio, tol, sizeChanged: base.width !== cur.width || base.height !== cur.height });
    }
  }

  /* حارس العدّاد: المقارَن لازم يغطي خط الأساس كله، والصفر فشل صريح */
  const expected = rows.length;
  if (compared === 0 || errors > 0) {
    console.error(`VISUAL_COMPARE FAIL — حارس العدّاد: قورن ${compared} من ${expected} و${errors} أخطاء. جوب ناقص لا يمرّ.`);
    process.exit(1);
  }

  const summary = {
    tool: 'visual-compare 3A-326',
    at: new Date().toISOString(),
    baselineBuiltAt: baselineMeta.builtAt,
    baselineFingerprint: baselineMeta.prodEntry,
    captureBase: capManifest.base,
    compared,
    diffed,
    rows,
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  const trs = rows
    .map(
      (r) =>
        `<tr class="${r.status}"><td>${r.id}</td><td>${r.width}</td><td>${r.status}</td>` +
        `<td>${r.ratio != null ? (r.ratio * 100).toFixed(3) + '%' : '—'}</td>` +
        `<td>${(r.tol * 100).toFixed(2)}%</td>` +
        `<td>${r.status === 'diff' ? `<a href="diff/${r.width}-${r.id}.baseline.png">أساس</a> · <a href="diff/${r.width}-${r.id}.current.png">حالي</a> · <a href="diff/${r.width}-${r.id}.diff.png">فرق</a>` : ''}</td></tr>`,
    )
    .join('\n');
  fs.writeFileSync(
    path.join(REPORT_DIR, 'report.html'),
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>تقرير الانحدار البصري</title>
<style>body{font-family:system-ui;background:#0A2342;color:#eef;margin:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #355;padding:6px 10px;text-align:right}tr.diff{background:#5a2b12}tr.match{opacity:.75}a{color:#7fd4ff}</style></head>
<body><h1>تقرير الانحدار البصري — تطبيق المدرس</h1>
<p>قورن: ${compared} · بفروقات فوق السماحية: ${diffed} · أساس بُني: ${baselineMeta.builtAt} · بصمة الإنتاج وقت الأساس: ${baselineMeta.prodEntry}</p>
<table><tr><th>الشاشة</th><th>العرض</th><th>الحالة</th><th>نسبة الفرق</th><th>السماحية</th><th>الصور</th></tr>${trs}</table>
</body></html>`,
  );
  console.log(`\nVISUAL_COMPARE OK — قورن ${compared}، فروقات فوق السماحية: ${diffed} — التقرير: ${path.join(REPORT_DIR, 'report.html')}`);
  if (FAIL_ON_DIFF && diffed > 0) process.exit(1);
}

main();
