import { db } from './supabase'
import type { ErrorReportKind } from '../types/database'

// ---------------------------------------------------------------------------
// مُرسِل سجل أخطاء الإنتاج الداخلي (مهمة 11 — 0053 / فجوة QA 21)
// ---------------------------------------------------------------------------
// قرار المدير 2026-11-25: قياس أخطاء داخلي في قاعدة بياناتنا — لا
// Sentry ولا أي خدمة خارجية. المُرسِل هنا يجمع من ثلاثة مصادر:
// حدّ الخطأ (render)، ونافذة الخطأ العام (unhandled)، والوعود
// المرفوضة (rejection)، ويرسل عبر RPC ‏report_client_error وحده.
//
// تجريد الحمولة (قاعدة صلبة): الرسالة والأثر يُنظَّفان قبل أي إرسال —
// تُحذف رسائل البريد والروابط والسلاسل الشبيهة بالتوكنات، والمسار
// يُرسل pathname فقط (بلا أي معطيات بحث)، والأطوال تُقصّ هنا وفي
// الـ RPC قسراً. لا قيم مدخلات مستخدم ولا بيانات طلاب في أي حقل.
//
// مصير الفشل (واضح وموثق): الإبلاغ نفسه لا يكسر التطبيق أبداً — أي
// فشل (لا اتصال بقاعدة البيانات، الجدول غير مطبّق بعد حتى بوابة
// التجميد، رفض خادمي) يسقط البلاغ بصمت مع أثر في وحدة التحكم فقط.
// ---------------------------------------------------------------------------

/**
 * عتبة تنبيه الأخطاء الافتراضية: 10 أخطاء في اليوم لحساب المدرس —
 * عند بلوغها تعرض بطاقة الإعدادات تنبيهاً أحمر. اختيار موثق للمهمة
 * 11 (قرار المدير: أرقام الوثيقة الافتراضية) — تُراجع بعد أول بايلوت
 * بأرقام حقيقية، لا تُخترع أرقام ميدانية قبلها.
 */
export const ERROR_ALERT_THRESHOLD = 10

const MESSAGE_CAP = 2000
const STACK_CAP = 8000
const DEDUPE_WINDOW_MS = 30_000
const MAX_REPORTS_PER_SESSION = 50

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g
const URL_RE = /https?:\/\/\S+/g
const TOKEN_RE = /[A-Za-z0-9+/=_-]{24,}/g

/** تنظيف نص حر قبل الإرسال: حذف بريد/روابط/شبيهات توكن + قصّ الطول */
export function sanitizeErrorText(raw: string, cap: number): string {
  const cleaned = raw
    .replace(EMAIL_RE, '[email]')
    .replace(URL_RE, '[url]')
    .replace(TOKEN_RE, '[token]')
    .trim()
  return cleaned.length > cap ? cleaned.slice(0, cap) : cleaned
}

/** رسالة خطأ مقروءة من أي قيمة مرمية — بلا أي بيانات إضافية */
export function errorMessageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error'
  if (typeof error === 'string') return error
  if (error == null) return 'unknown error'
  return 'unknown error'
}

/** أثر المكدّس المُجرّد (من الخطأ نفسه + أثر مكوّنات React عند وجوده) */
export function errorStackOf(error: unknown, componentStack?: string | null): string | null {
  const parts: string[] = []
  if (error instanceof Error && error.stack) parts.push(error.stack)
  if (componentStack) parts.push(componentStack)
  if (parts.length === 0) return null
  return sanitizeErrorText(parts.join('\n'), STACK_CAP)
}

/**
 * بوابة منع التكرار/الإغراق: نفس (النوع + الرسالة) مرة واحدة كل
 * 30 ثانية، وبحد أقصى لعدد بلاغات الجلسة — حتى لا يتحول خطأ متكرر
 * في حلقة تصيير إلى آلاف الصفوف. دالة نقية قابلة للاختبار.
 */
export function createDedupeGate(windowMs: number, maxPerSession: number) {
  const lastSentAt = new Map<string, number>()
  let sent = 0
  return (key: string, now: number): boolean => {
    if (sent >= maxPerSession) return false
    const last = lastSentAt.get(key)
    if (last !== undefined && now - last < windowMs) return false
    lastSentAt.set(key, now)
    sent += 1
    return true
  }
}

const gate = createDedupeGate(DEDUPE_WINDOW_MS, MAX_REPORTS_PER_SESSION)

let teacherContext: string | null = null

/** سياق المدرس الحالي للبلاغات — يضبطه جسر صغير في App عند حلّ الهوية */
export function setErrorReporterTeacher(teacherId: string | null): void {
  teacherContext = teacherId
}

function currentRoute(): string | null {
  try {
    return window.location.pathname.slice(0, 300)
  } catch {
    return null
  }
}

function currentAppVersion(): string | null {
  try {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : null
  } catch {
    return null
  }
}

/**
 * إرسال بلاغ خطأ واحد — لا يرمي أبداً. الفشل مصيره الموثق: إسقاط
 * البلاغ مع أثر وحدة تحكم فقط (الإبلاغ لا يكسر التطبيق).
 */
export function reportClientError(
  kind: ErrorReportKind,
  error: unknown,
  componentStack?: string | null,
): void {
  try {
    const message = sanitizeErrorText(errorMessageOf(error), MESSAGE_CAP)
    if (!message) return
    if (!gate(`${kind}:${message}`, Date.now())) return
    void Promise.resolve(
      db().rpc('report_client_error', {
        p_teacher_id: teacherContext,
        p_kind: kind,
        p_message: message,
        p_stack: errorStackOf(error, componentStack),
        p_route: currentRoute(),
        p_app_version: currentAppVersion(),
      }),
    ).then(
      ({ error: rpcError }) => {
        if (rpcError) {
          // مصير واضح: البلاغ سقط (غالباً الجدول غير مطبّق بعد) —
          // أثر تحكم فقط، ولا إعادة محاولة ولا إزعاج للمستخدم
          console.warn('[error-reporter] report dropped:', rpcError.message)
        }
      },
      (sendError: unknown) => {
        // رفض شبكي من المُرسِل نفسه — لا يتحول لبلاغ جديد (لا حلقة)
        console.warn('[error-reporter] report dropped:', errorMessageOf(sendError))
      },
    )
  } catch (sendError) {
    // قاعدة البيانات غير مهيأة في هذه البيئة — نفس المصير الموثق
    console.warn('[error-reporter] report dropped:', errorMessageOf(sendError))
  }
}

let handlersInstalled = false

/** تركيب ملتقطي النافذة العامين مرة واحدة (يستدعيه main.tsx) */
export function installGlobalErrorHandlers(): void {
  if (handlersInstalled || typeof window === 'undefined') return
  handlersInstalled = true
  window.addEventListener('error', (event) => {
    reportClientError('unhandled', event.error ?? event.message)
  })
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError('rejection', event.reason)
  })
}
