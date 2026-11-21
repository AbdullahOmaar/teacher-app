import { ar } from './ar'
import type { I18nKey, Msg, Params } from './dict'

const pluralRules = new Intl.PluralRules('ar-EG')

function lookup(key: string): Msg | undefined {
  let node: unknown = ar
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined
    // اجتياز بالخصائص الذاتية فقط (تصليب 3A-302 — نتيجة Semgrep
    // ‏prototype-pollution-loop على سطر الاجتياز): بلا hasOwn كان جزء مثل
    // «__proto__» أو «constructor» يُقرأ من سلسلة البروتوتايب لا من القاموس
    // نفسه. المفاتيح ثوابت مكتوبة في الكود أصلاً فلا مسار استغلال فعلياً،
    // لكن الاجتياز الذاتي أصحّ دلالياً — وبلا أي تغيير سلوك لأي مفتاح
    // حقيقي في القاموس.
    if (!Object.hasOwn(node, part)) return undefined
    // كتم موضعي مبرر (لا إضعاف للبوابة): قاعدة Semgrep نمطية وتظل تُطلق
    // على أي فهرسة داخل حلقة رغم الحارس. الإيجابية كاذبة هنا بالإثبات:
    // الدالة قراءة فقط (لا إسناد لأي خاصية في أي مسار)، الاجتياز مقيد
    // بالخصائص الذاتية بالحارس أعلاه، والمفاتيح ثوابت I18nKey من الكود
    // لا مدخلات مستخدم. الاختبار «أجزاء بروتوتايب لا تتسرب» يثبّت ذلك.
    // nosemgrep: javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop
    node = (node as Record<string, unknown>)[part]
  }
  return typeof node === 'string' || (typeof node === 'object' && node !== null)
    ? (node as Msg)
    : undefined
}

/**
 * ترجمة مفتاح من القاموس (W7 — R-5): استيفاء {name} من الوسائط،
 * واختيار صيغة الجمع بفئة CLDR عند وجود count رقمي وقيمة جمعية.
 * مفتاح مفقود يعيد نفسه (يظهر في التطوير بدل فراغ صامت).
 */
export function t(key: I18nKey, params?: Params): string {
  const raw = lookup(key)
  if (raw === undefined) return key
  let str: string
  if (typeof raw === 'string') {
    str = raw
  } else {
    const count = params?.count
    const category =
      typeof count === 'number' ? pluralRules.select(count) : 'other'
    str = raw[category] ?? raw.other
  }
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (match, name: string) =>
      params[name] !== undefined ? String(params[name]) : match,
    )
  }
  return str
}

/**
 * خطاف المكوّنات (R-5): يعيد t نفسها اليوم — اللغة ثابتة «ar»، وهذا
 * هو خط التماس الذي ستعلَّق عليه سياقة لغة مستقبلية دون لمس الشاشات.
 */
export function useT(): typeof t {
  return t
}
