// فحص اكتمال ARB — الملحق أ (أ-3/L2): كل مفتاح جديد باللغتين في نفس الدفعة.
// يفشل إن اختلفت مفاتيح app_ar.arb وapp_en.arb أو placeholders بينهما.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'l10n');
const ar = JSON.parse(readFileSync(join(dir, 'app_ar.arb'), 'utf8'));
const en = JSON.parse(readFileSync(join(dir, 'app_en.arb'), 'utf8'));

const keys = (o) => Object.keys(o).filter((k) => !k.startsWith('@'));
const arKeys = new Set(keys(ar));
const enKeys = new Set(keys(en));
const missing = [...arKeys].filter((k) => !enKeys.has(k));
const extra = [...enKeys].filter((k) => !arKeys.has(k));

const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const phDiffs = [];
for (const k of arKeys) {
  if (enKeys.has(k) && placeholders(ar[k]) !== placeholders(en[k])) phDiffs.push(k);
}

if (missing.length || extra.length || phDiffs.length) {
  if (missing.length) console.error('Missing in EN:', missing.join(', '));
  if (extra.length) console.error('Missing in AR:', extra.join(', '));
  if (phDiffs.length) console.error('Placeholder mismatch:', phDiffs.join(', '));
  process.exit(1);
}
console.log(`ARB parity OK: ${arKeys.size} keys, placeholders match.`);
