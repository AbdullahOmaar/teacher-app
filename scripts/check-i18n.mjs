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
