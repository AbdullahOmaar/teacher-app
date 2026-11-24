/**
 * حذف الحساب من أوله لآخره (فجوة 32 من تقييم الـ45 — مهمة Phase 2 رقم 3).
 *
 * التدفق (3 خطوات، كلها في العميل + استدعاء RPC واحد):
 * 1) إعادة إدخال كلمة السر (signInWithPassword) — إثبات حيازة الحساب.
 * 2) RPC ‏delete_my_teacher_account (هجرة 0046): معاملة ذرية واحدة تحذف
 *    صفوف التخزين ← صف المدرس (يتتابع لـ 40 جدولاً) ← مستخدم Auth.
 *    الحارس الحقيقي ضد حذف الحساب التجريبي العام في الدالة نفسها.
 * 3) مسح التخزين المحلي + تسجيل الخروج محلياً (الجلسة ميتة خادمياً أصلاً).
 *
 * الاعتماديات قابلة للحقن (DeleteAccountDeps) حتى يُختبر التدفق بعميل
 * مزيف دون لمس قاعدة البيانات — الافتراضي هو العميل الحقيقي.
 */
import { db } from '../../lib/supabase'
import { clearUserLocalData } from '../../lib/logoutCleanup'
import { errText } from '../../lib/supabaseErrors'
import { t } from '../../i18n'
import { signInWithEmail } from '../auth/api'

export interface DeleteAccountReport {
  teacher_id: string
  deleted_tables: Record<string, number>
  storage_objects_orphaned: number
}

/** تحقق صارم من شكل تقرير الحذف المُرجع من RPC (Json غير مُدقَّق نوعياً). */
export function parseDeleteReport(data: unknown): DeleteAccountReport | null {
  if (typeof data !== 'object' || data === null) return null
  const d = data as Record<string, unknown>
  if (typeof d.teacher_id !== 'string' || d.teacher_id === '') return null
  if (typeof d.storage_objects_orphaned !== 'number') return null
  if (typeof d.deleted_tables !== 'object' || d.deleted_tables === null) return null
  const tables: Record<string, number> = {}
  for (const [k, v] of Object.entries(d.deleted_tables as Record<string, unknown>)) {
    if (typeof v !== 'number') return null
    tables[k] = v
  }
  return {
    teacher_id: d.teacher_id,
    deleted_tables: tables,
    storage_objects_orphaned: d.storage_objects_orphaned,
  }
}

export interface DeleteAccountDeps {
  getUserEmail: () => Promise<string | null>
  reauthenticate: (email: string, password: string) => Promise<void>
  callDeleteRpc: () => Promise<unknown>
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
  async callDeleteRpc() {
    const { data, error } = await db().rpc('delete_my_teacher_account')
    if (error) throw error
    return data
  },
  async signOutLocal() {
    clearUserLocalData(localStorage)
    try {
      await db().auth.signOut()
    } catch {
      // الجلسة ميتة خادمياً أصلاً (حُذف المستخدم) — تنظيف التخزين المحلي
      // هو المطلوب، وفشل نداء الخروج لا يغيّر شيئاً.
    }
  },
}

/** ترجمة رسائل خطأ الخادم المعروفة من RPC إلى عربية واضحة. */
export function deleteAccountErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? '')
  if (raw.includes('demo account cannot be deleted')) {
    return t('settings.deleteAccountDemoBlocked')
  }
  if (raw.includes('no teacher profile')) {
    return t('settings.deleteAccountNoProfile')
  }
  if (raw.includes('not authenticated')) {
    return t('settings.deleteAccountNotAuthenticated')
  }
  return errText(e)
}

/**
 * حذف الحساب كاملاً: إعادة مصادقة ← RPC الحذف ← خروج محلي.
 * يرمي برسالة عربية جاهزة للعرض عند أي فشل؛ عندها لا شيء يُحذف جزئياً
 * (RPC معاملة ذرية: إما الكل أو لا شيء).
 */
export async function deleteMyAccount(
  password: string,
  deps: DeleteAccountDeps = realDeleteAccountDeps,
): Promise<DeleteAccountReport> {
  const email = await deps.getUserEmail()
  if (!email) throw new Error(t('settings.deleteAccountNotAuthenticated'))
  try {
    await deps.reauthenticate(email, password)
    const raw = await deps.callDeleteRpc()
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
