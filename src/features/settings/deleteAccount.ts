/**
 * حذف الحساب — حذف ناعم بحجة تأكيد (F1 من اختبار سند الأمني؛ كان
 * حذفاً نهائياً فورياً في 0046، صار ناعماً في مهاجرة 0075).
 *
 * التدفق (4 خطوات):
 * 1) تأكيد مكتوب صريح في الواجهة: المالك يكتب بريد حسابه نفسه.
 * 2) إعادة إدخال كلمة السر (signInWithPassword) — إثبات حيازة الحساب.
 * 3) RPC ‏delete_my_teacher_account(p_confirmation) (مهاجرة 0075):
 *    الخادم نفسه يطابق حجة التأكيد ببريد الحساب، ثم يعلّم كل السناتر
 *    بـ deleted_at (لا حذف فعلي)، يقطع الجلسات، يحظر الدخول، ويعطّل
 *    حسابات البوابات — داخل نافذة سماح 30 يوماً قبل أي تصفية نهائية
 *    (متابعة موثقة في docs/SECURITY-F1-F6.md).
 * 4) مسح التخزين المحلي + تسجيل الخروج محلياً (الجلسة مقطوعة خادمياً
 *    أصلاً بحذف auth.sessions في نفس المعاملة).
 *
 * الاعتماديات قابلة للحقن (DeleteAccountDeps) حتى يُختبر التدفق بعميل
 * مزيف دون لمس قاعدة البيانات — الافتراضي هو العميل الحقيقي.
 */
import { db } from '../../lib/supabase'
import { clearUserLocalData } from '../../lib/logoutCleanup'
import { t } from '../../i18n'
import { signInWithEmail } from '../auth/api'

export interface DeleteAccountReport {
  teacher_id: string
  soft_deleted: true
  deleted_at: string
  purge_after: string
  centres_marked: number
}

/** تحقق صارم من شكل تقرير الحذف الناعم المُرجع من RPC (Json غير مُدقَّق نوعياً). */
export function parseDeleteReport(data: unknown): DeleteAccountReport | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (typeof d.teacher_id !== 'string' || d.teacher_id === '') return null
  if (d.soft_deleted !== true) return null
  if (typeof d.deleted_at !== 'string' || d.deleted_at === '') return null
  if (typeof d.purge_after !== 'string' || d.purge_after === '') return null
  if (typeof d.centres_marked !== 'number') return null
  return {
    teacher_id: d.teacher_id,
    soft_deleted: true,
    deleted_at: d.deleted_at,
    purge_after: d.purge_after,
    centres_marked: d.centres_marked,
  }
}

export interface DeleteAccountDeps {
  getUserEmail: () => Promise<string | null>
  reauthenticate: (email: string, password: string) => Promise<void>
  callDeleteRpc: (confirmation: string) => Promise<unknown>
  signOutLocal: () => Promise<void>
}

export const realDeleteAccountDeps: DeleteAccountDeps = {
  async getUserEmail() {
    const { data, error } = await db().auth.getUser()
    if (error || !data.user?.email) return null
    return data.user.email
  },
  async reauthenticate(email, password) {
    await signInWithEmail(email, password)
  },
  async callDeleteRpc(confirmation) {
    const { data, error } = await db().rpc('delete_my_teacher_account', {
      p_confirmation: confirmation,
    })
    if (error) throw error
    return data
  },
  async signOutLocal() {
    clearUserLocalData(localStorage)
    try {
      await db().auth.signOut()
    } catch {
      // الجلسة مقطوعة خادمياً أصلاً (حذف auth.sessions في 0075) —
      // تنظيف التخزين المحلي هو المطلوب، وفشل نداء الخروج لا يغيّر شيئاً.
    }
  },
}

/**
 * ترجمة رسائل خطأ الخادم المعروفة من RPC إلى عربية واضحة.
 * F6: لا سقوط أبداً لنص الخادم الخام (رسائل PostgREST تكشف أسماء
 * الدوال/الأعمدة) — أي خطأ غير معروف يرجع للرسالة العامة المصممة.
 */
export function deleteAccountErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  if (raw.includes('demo account cannot be deleted')) {
    return t('settings.deleteAccountDemoBlocked')
  }
  if (raw.includes('confirmation mismatch')) {
    return t('settings.deleteAccountMismatch')
  }
  if (raw.includes('account already deleted')) {
    return t('settings.deleteAccountAlreadyDeleted')
  }
  if (raw.includes('no teacher profile')) {
    return t('settings.deleteAccountNoProfile')
  }
  if (raw.includes('not authenticated')) {
    return t('settings.deleteAccountNotAuthenticated')
  }
  return t('settings.deleteAccountFailed')
}

/**
 * حذف الحساب ناعماً: تأكيد مكتوب ← إعادة مصادقة ← RPC الحذف الناعم
 * ← خروج محلي. يرمي برسالة عربية جاهزة للعرض عند أي فشل؛ عندها لا
 * شيء يتغيّر (الـ RPC معاملة ذرية: إما الكل أو لا شيء).
 * التأكيد يُفحص محلياً أولاً (نفس مطابقة الخادم: trim + بلا حساسية
 * لحالة الأحرف) حتى لا تُستهلك إعادة المصادقة على خطأ كتابة واضح.
 */
export async function deleteMyAccount(
  password: string,
  confirmation: string,
  deps: DeleteAccountDeps = realDeleteAccountDeps,
): Promise<DeleteAccountReport> {
  const email = await deps.getUserEmail()
  if (!email) throw new Error(t('settings.deleteAccountNotAuthenticated'))
  if (confirmation.trim().toLowerCase() !== email.trim().toLowerCase()) {
    throw new Error(t('settings.deleteAccountMismatch'))
  }
  // إعادة المصادقة خارج غلاف ترجمة أخطاء الـ RPC: رسائلها عربية
  // مصممة أصلاً من translateAuthError (كلمة سر خاطئة…) فتمرّ كما هي.
  await deps.reauthenticate(email, password)
  try {
    const raw = await deps.callDeleteRpc(email)
    const report = parseDeleteReport(raw)
    if (!report) throw new Error(t('settings.deleteAccountBadReport'))
    await deps.signOutLocal()
    return report
  } catch (e) {
    if (e instanceof Error && e.message === t('settings.deleteAccountBadReport')) {
      throw e
    }
    throw new Error(deleteAccountErrorMessage(e))
  }
}
