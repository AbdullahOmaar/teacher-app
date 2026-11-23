// بوابة اللوكلايزيشن (W7 — R-6، موسّعة في PAT-6/3A-297): تمنع رجوع نص
// عربي ثابت في ملفات .tsx و.ts خارج src/i18n. اكتمل ترحيل .tsx بالكامل
// (قائمة السماح القديمة حُذفت — أي نص عربي في .tsx خارج القاموس خطأ).
// ملفات .ts لها قائمة استثناءات (i18n-ts-exceptions.txt) للبيانات التي
// ليست نصوص عرض: قيم تُكتب في ملفات/تُطابَق بها، وملف مجمّد بقرار مالك.
// القائمة تنكمش فقط: ملف مستثنى لم يعد فيه نص عربي = خطأ (احذفه منها).
// التعليقات العربية في الكود ليست نصاً ظاهراً وتُستثنى من الفحص.
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('../', import.meta.url).pathname
const srcRoot = join(repoRoot, 'src')
const ARABIC = /[\u0600-\u06FF]/

function readList(path) {
  if (!existsSync(path)) return new Set()
  return new Set(
    readFileSync(path, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  )
}
const tsExceptions = readList(join(repoRoot, 'scripts/i18n-ts-exceptions.txt'))

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (
      (e.name.endsWith('.tsx') || e.name.endsWith('.ts')) &&
      !e.name.endsWith('.test.ts') &&
      !e.name.endsWith('.test.tsx')
    )
      out.push(p)
  }
  return out
}

function flaggedLines(file) {
  const hits = []
  let inBlockComment = false
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      let code = ''
      // إزالة التعليقات (سطرية وكتلية) مع تتبّع الحالة عبر الأسطر
      for (let j = 0; j < line.length; j++) {
        if (inBlockComment) {
          if (line[j] === '*' && line[j + 1] === '/') {
            inBlockComment = false
            j++
          }
          continue
        }
        if (line[j] === '/' && line[j + 1] === '*') {
          inBlockComment = true
          j++
          continue
        }
        if (line[j] === '/' && line[j + 1] === '/') break
        code += line[j]
      }
      if (!ARABIC.test(code)) return
      // نص ظاهر محتمل: داخل اقتباس/قالب أو نص JSX مباشر أو «اقتباس عربي»
      if (/['"`«]/.test(code) || />[^<]*[\u0600-\u06FF]/.test(code)) {
        hits.push(i + 1)
        return
      }
      // سطر نص JSX مستقل (بلا أي رموز كود): نص ظاهر على سطر وحده
      const trimmed = code.trim()
      if (
        trimmed.length > 0 &&
        !/[=<>{}();]/.test(trimmed) &&
        !/^(return|const|let|var|import|export|if|else|case|break|type|interface)\b/.test(trimmed)
      ) {
        hits.push(i + 1)
      }
    })
  return hits
}

let failed = false
for (const file of walk(srcRoot)) {
  const rel = relative(repoRoot, file)
  if (rel.startsWith('src/i18n/')) continue
  const hits = flaggedLines(file)
  const isTs = rel.endsWith('.ts') && !rel.endsWith('.tsx')
  if (hits.length > 0 && !(isTs && tsExceptions.has(rel))) {
    console.error(`x ${rel}: نص عربي خارج القاموس في أسطر ${hits.slice(0, 8).join(', ')}`)
    failed = true
  }
  if (hits.length === 0 && isTs && tsExceptions.has(rel)) {
    console.error(`x ${rel}: في قائمة استثناءات .ts لكن لم يعد فيه نص عربي — احذفه من القائمة`)
    failed = true
  }
}
if (failed) process.exit(1)
console.log('OK بوابة i18n: لا نص عربي خارج القاموس في .tsx/.ts إلا استثناءات .ts الموثقة')

// =====================================================================
// المرحلة ٢ (PAT-11 — 3A-383): سلامة القاموس نفسه —
// (أ) لا مفاتيح ميتة: كل مفتاح في القاموس مُشار إليه بحرفية نصية في src
//     (استدعاء t('…') أو ثابت مفتاح في مصفوفة/كائن — النمطان الوحيدان
//     في هذا الكود؛ لا استدعاءات قالبية t(`…`) إطلاقاً).
// (ب) اتساق الوسائط: كل {placeholder} في قيمة يجب أن يمرّره موضع
//     استدعاء واحد على الأقل بوسائط قابلة للتحليل، ومفتاح له وسائط لا
//     يُستدعى بلا وسائط أبداً — وإلا ظهر {name} خاماً للمستخدم.
// استثناءات موثقة: مفاتيح قوالب رسائل قابلة لتحرير المستخدم تُستيفى
// لاحقاً بآلية أخرى لا عبر t() — قائمتها تنكمش فقط كقائمة .ts أعلاه.
const TEMPLATE_KEYS = new Set([
  // قالب رسالة واتساب الافتراضي: يُحرَّر في الإعدادات ويُستيفى بـ
  // buildReceiptMessage (replaceAll) — وسائطه مثبّتة في WA_TEMPLATE_VARS
  'invoices.apiDefaultWaTemplate',
])

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other'])

function tokenize(src) {
  const toks = []
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++; i += 2; continue }
    if (c === "'" || c === '"') {
      const q = c; let v = ''; i++
      while (i < n && src[i] !== q) { if (src[i] === '\\') { v += src[i + 1] ?? ''; i += 2 } else { v += src[i]; i++ } }
      i++; toks.push({ type: 'str', value: v }); continue
    }
    if (c === '`') {
      let v = ''; i++; let dynamic = false
      while (i < n && src[i] !== '`') {
        if (src[i] === '$' && src[i + 1] === '{') { dynamic = true; break }
        if (src[i] === '\\') { v += src[i + 1] ?? ''; i += 2 } else { v += src[i]; i++ }
      }
      toks.push({ type: 'str', value: v, dynamic })
      if (dynamic) {
        let depth = 0
        while (i < n) {
          if (src[i] === '{') depth++
          else if (src[i] === '}') { depth--; if (depth === 0) { i++; break } }
          else if (src[i] === '`' && depth === 0) { i++; break }
          i++
        }
        while (i < n && src[i] !== '`') i++
        i++
      } else i++
      continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let v = ''
      while (i < n && /[A-Za-z0-9_$]/.test(src[i])) { v += src[i]; i++ }
      toks.push({ type: 'ident', value: v }); continue
    }
    if ('{}()[],:;.=<>+-*/%&|!?'.includes(c) || c === '-') { toks.push({ type: 'punct', value: c }); i++; continue }
    i++
  }
  return toks
}

const dict = new Map()
function peekObjectKeys(toks, pos) {
  const keys = new Set()
  let depth = 0; let j = pos; let expectKey = true
  while (j < toks.length) {
    const t = toks[j]
    if (t.type === 'punct' && t.value === '{') { depth++; j++; continue }
    if (t.type === 'punct' && t.value === '}') { depth--; j++; if (depth === 0) break; continue }
    if (depth === 1 && expectKey && (t.type === 'ident' || t.type === 'str') && toks[j + 1]?.value === ':') { keys.add(t.value); expectKey = false; j += 2; continue }
    if (depth === 1 && t.type === 'punct' && t.value === ',') expectKey = true
    j++
  }
  return keys
}
function parseDictObject(toks, pos, prefix) {
  pos++
  while (pos < toks.length) {
    const t = toks[pos]
    if (t.type === 'punct' && t.value === '}') return pos + 1
    if (t.type === 'punct' && t.value === ',') { pos++; continue }
    if (t.type !== 'ident' && t.type !== 'str') { pos++; continue }
    const name = t.value; pos++
    if (toks[pos]?.value === ':') pos++
    const key = prefix ? `${prefix}.${name}` : name
    const v = toks[pos]
    if (v?.type === 'str') { dict.set(key, v.value); pos++ }
    else if (v?.type === 'punct' && v.value === '{') {
      const peek = peekObjectKeys(toks, pos)
      if (peek.size && [...peek].every((k) => PLURAL_KEYS.has(k)) && peek.has('other')) {
        const forms = []
        let j = pos + 1
        while (j < toks.length && !(toks[j].type === 'punct' && toks[j].value === '}')) {
          if (toks[j].type === 'str') forms.push(toks[j].value)
          j++
        }
        dict.set(key, forms)
        pos = j + 1
      } else pos = parseDictObject(toks, pos, key)
    } else pos++
  }
  return pos
}
{
  const arDir = join(srcRoot, 'i18n', 'ar')
  for (const e of readdirSync(arDir)) {
    if (!e.endsWith('.ts') || e === 'index.ts') continue
    const base = e.replace('.ts', '')
    const toks = tokenize(readFileSync(join(arDir, e), 'utf8'))
    const eq = toks.findIndex((t) => t.type === 'punct' && t.value === '=')
    const brace = toks.findIndex((t, i) => i > eq && t.type === 'punct' && t.value === '{')
    if (brace >= 0) parseDictObject(toks, brace, base)
  }
}

const literalRefs = new Set()
const callParams = new Map()
const callsNoParams = new Set()
for (const file of walk(srcRoot)) {
  const rel = relative(repoRoot, file)
  if (rel.startsWith('src/i18n/')) continue
  const toks = tokenize(readFileSync(file, 'utf8'))
  for (let i = 0; i < toks.length; i++) {
    const tk = toks[i]
    if (tk.type === 'str') literalRefs.add(tk.value)
    if (tk.type === 'ident' && tk.value === 't' && toks[i + 1]?.value === '(') {
      const a0 = toks[i + 2]
      if (a0?.type === 'str' && !a0.dynamic) {
        const key = a0.value
        let j = i + 3
        if (toks[j]?.value === ',') {
          j++
          if (toks[j]?.type === 'punct' && toks[j].value === '{') {
            const set = callParams.get(key) ?? new Set()
            let depth = 0
            for (let k = j; k < toks.length; k++) {
              const t2 = toks[k]
              if (t2.type === 'punct' && t2.value === '{') depth++
              else if (t2.type === 'punct' && t2.value === '}') { depth--; if (depth === 0) break }
              else if (depth === 1 && t2.type === 'ident' && (toks[k + 1]?.value === ':' || toks[k + 1]?.value === ',' || toks[k + 1]?.value === '}')) set.add(t2.value)
            }
            callParams.set(key, set)
          }
        } else if (toks[j]?.value === ')') callsNoParams.add(key)
      }
    }
  }
}

let failed2 = false
const allLiterals = [...literalRefs]
for (const k of dict.keys()) {
  if (literalRefs.has(k)) continue
  const dynamic = allLiterals.some((lit) => lit && lit.length >= 4 && k.startsWith(lit))
  if (!dynamic) {
    console.error(`x مفتاح قاموس غير مستخدم: ${k}`)
    failed2 = true
  }
}
for (const [k, v] of dict) {
  if (TEMPLATE_KEYS.has(k)) continue
  const texts = typeof v === 'string' ? [v] : v
  const ph = new Set()
  for (const s of texts) for (const m of s.matchAll(/\{(\w+)\}/g)) ph.add(m[1])
  if (!ph.size) continue
  const provided = callParams.get(k)
  if (provided) {
    const missing = [...ph].filter((p) => !provided.has(p))
    if (missing.length) {
      console.error(`x وسائط ناقصة لـ ${k}: {${missing.join('}, {')}} لا يمرّرها أي موضع استدعاء`)
      failed2 = true
    }
  } else if (callsNoParams.has(k)) {
    console.error(`x ${k} له وسائط {${[...ph].join('}, {')}} لكنه يُستدعى بلا وسائط`)
    failed2 = true
  }
}
for (const k of TEMPLATE_KEYS) {
  if (!dict.has(k)) {
    console.error(`x استثناء قوالب لم يعد موجوداً في القاموس: ${k} — احذفه من TEMPLATE_KEYS`)
    failed2 = true
  }
}
if (failed2) process.exit(1)
console.log(`OK بوابة i18n/٢: ${dict.size} مفتاحاً — لا مفاتيح ميتة ووسائط {…} متسقة`)
