import { useCallback, useSyncExternalStore } from 'react'

export type ThemeMode = 'auto' | 'light' | 'dark'

const STORAGE_KEY = 'teacher-app-theme'

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = resolveDark(mode) ? 'dark' : 'light'
}

function readStoredMode(): ThemeMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'light' || saved === 'dark' || saved === 'auto' ? saved : 'auto'
  } catch {
    // تخزين محظور (WebView مقيّد/وضع خاص): الافتراضي الآمن ولا ينهار
    // استيراد الوحدة كلها (ملاحظة مراجعة 3A-384 غير الحاجبة)
    return 'auto'
  }
}

/**
 * هل اختار المستخدم ثيماً صراحةً على هذا الجهاز؟ وجود مفتاح التخزين =
 * اختيار صريح (كل setMode يكتب المفتاح). يُستخدم في مزامنة الإعدادات:
 * اختيار الجهاز الصريح يسود دائماً على قيمة القاعدة (3A-384 ملاحظة ٧).
 */
export function hasExplicitThemeChoice(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) != null
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// مخزن ثيم مشترك واحد على مستوى الوحدة (3A-384 — ملاحظة المالك ٧:
// «التطبيق بيطلع من الدارك مود لوحده»). التنفيذ السابق كان حالة
// useState منفصلة لكل مستدعٍ: زر الشريط العلوي يكتب نسخته فقط، وصفحة
// الإعدادات عند فتحها تفرض قيمة قاعدة البيانات على نسختها فتنعكس على
// التطبيق كله. الآن كل المستدعين يقرأون ويكتبون الحالة نفسها عبر
// useSyncExternalStore فلا توجد نسخة قديمة أبداً.
// ---------------------------------------------------------------------------
let currentMode: ThemeMode = readStoredMode()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

function getSnapshot(): ThemeMode {
  return currentMode
}

function setModeInternal(next: ThemeMode) {
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // كتابة محظورة: الثيم يُطبَّق داخل الجلسة من الذاكرة ولا ينهار
    // الخطاف (ملاحظة مراجعة 3A-384 غير الحاجبة)
  }
  currentMode = next
  applyTheme(next)
  emit()
}

// تطبيق أولي + متابعة ثيم النظام عند الوضع التلقائي (مرة واحدة للوحدة)
applyTheme(currentMode)
if (typeof window !== 'undefined' && window.matchMedia) {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  mq.addEventListener?.('change', () => {
    if (currentMode === 'auto') applyTheme('auto')
  })
}

/** إدارة ثيم التطبيق: تلقائي/فاتح/داكن — يُحفظ الاختيار محلياً (كما في المرجع §6.7). */
export function useTheme() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  const setMode = useCallback((next: ThemeMode) => {
    setModeInternal(next)
  }, [])

  /** تبديل سريع فاتح/داكن من الشريط العلوي (يتجاوز التلقائي كما في المرجع). */
  const toggle = useCallback(() => {
    const isDark = document.documentElement.dataset.theme === 'dark'
    setModeInternal(isDark ? 'light' : 'dark')
  }, [])

  return { mode, setMode, toggle }
}
