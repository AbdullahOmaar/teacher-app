// بوابة اللوكلايزيشن (W7 — R-6): تمنع رجوع نص عربي ثابت في ملفات .tsx
// خارج src/i18n بعد ترحيل الملف، وقائمة السماح (i18n-allowlist.txt)
// لا يُسمح لها إلا بالانكماش: ملف مسموح لم يعد فيه نص عربي = خطأ
// (احذفه من القائمة) — فتتقدم الترحيلة ولا تتراجع أبداً.
// التعليقات العربية في الكود ليست نصاً ظاهراً وتُستثنى من الفحص.
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'

const repoRoot = new URL('../', import.meta.url).pathname
const srcRoot = join(repoRoot, 'src')
const ARABIC = /[\u0600-\u06FF]/
const allow = new Set(
  readFileSync(join(repoRoot, 'scripts/i18n-allowlist.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
)

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.tsx') && !e.name.endsWith('.test.tsx')) out.push(p)
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
      if (/['"`«]/.test(code) || />[^<]*[\u0600-\u06FF]/.test(code)) hits.push(i + 1)
    })
  return hits
}

let failed = false
for (const file of walk(srcRoot)) {
  const rel = relative(repoRoot, file)
  if (rel.startsWith('src/i18n/')) continue
  const hits = flaggedLines(file)
  if (hits.length > 0 && !allow.has(rel)) {
    console.error(`x ${rel}: نص عربي خارج القاموس في أسطر ${hits.slice(0, 8).join(', ')}`)
    failed = true
  }
  if (hits.length === 0 && allow.has(rel)) {
    console.error(`x ${rel}: في قائمة السماح لكن لم يعد فيه نص عربي — احذفه من القائمة`)
    failed = true
  }
}
if (failed) process.exit(1)
console.log('OK بوابة i18n: لا نص عربي خارج القاموس إلا في ملفات قائمة السماح الموثقة')
