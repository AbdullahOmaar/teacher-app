/**
 * تنظيف بقايا التخزين المحلي عند تسجيل الخروج (SEC-L5 — POST-WAVE-REVIEW،
 * وُسّع في 3A-383 بعد الجرد الكامل أدناه).
 *
 * الجرد الموثق لمفاتيح localStorage في التطبيق وتصنيفها:
 * - `teacher-app-active-teacher` (lib/activeTeacher): اختيار مساحة العمل —
 *   جلسة/مستخدم ⇒ يُحذف دائماً.
 * - `teacher-app-show-mascot` (components/mascot/useMascotVisible):
 *   مرآة إعداد «إظهار دُفّي» الخاص بالمدرس، يقرؤها سكربت إقلاع index.html
 *   قبل أول رسم — حالة مشتقة من مستخدم ⇒ تُحذف (تُعاد كتابتها من قاعدة
 *   البيانات عند حلّ إعدادات الدخول التالي، وغيابها يعني الافتراضي).
 * - `start-here-dismissed:<teacherId>` و`doffy-welcome:<teacherId>`
 *   (features/home/HomePage) و`teacher-app-star-cheer:<teacherId>:<groupId>`
 *   (features/groups/starCheer): حالة واجهة لكل مدرس ⇒ تُحذف مفاتيح المدرس
 *   النشط فقط (مفاتيح مدرسين آخرين على نفس الجهاز ليست لنا).
 * - `teacher-app-attendance-queue-v1` (features/attendance/offlineQueue):
 *   طابور حضور غير مُزامَن = بيانات مستخدم ⇒ لا يُحذف أبداً وهو غير فارغ
 *   (مقيد بـ teacher_id ولا يُزامَن إلا في جلسة صاحبه)؛ يُحذف المفتاح فقط
 *   إن كان الطابور فارغاً فعلاً، وقيمة فاسدة لا نفهمها تُترك كما هي.
 * - `teacher-app-theme` (hooks/useTheme): تفضيل جهاز ⇒ يبقى.
 * - مسودات إجابات الامتحانات العامة (features/exams/ExamPage بمفتاح
 *   محاولة): سطح عام بلا جلسة مدرس، تُنظّف نفسها عند التسليم — خارج نطاق
 *   خروج المدرس عمداً.
 * - توكنا جلسة البوابة العامة `portal.session.guardian` /
 *   `portal.session.student` (features/portal/accounts، أُضيفا في 3A-385
 *   بعد كتابة هذا الجرد): سطح عام آخر له دورة حياة مستقلة (خروج البوابة
 *   نفسه + إبطال المدرس خادمياً) — خارج نطاق خروج المدرس عمداً، وتوثيقهما
 *   هنا ليبقى الجرد كاملاً لا ليُحذفا من هنا.
 * - مفاتيح جلسة Supabase نفسها (`sb-…-auth-token`): يحذفها
 *   `supabase.auth.signOut()` ذاته.
 */

const ACTIVE_TEACHER_KEY = 'teacher-app-active-teacher'
const MASCOT_MIRROR_KEY = 'teacher-app-show-mascot'
const QUEUE_KEY = 'teacher-app-attendance-queue-v1'

/** الحد الأدنى من واجهة Storage الذي تحتاجه الدالة (قابل للاختبار بذاكرة). */
export interface StorageLike {
  getItem(key: string): string | null
  removeItem(key: string): void
  key(index: number): string | null
  readonly length: number
}

export function clearUserLocalData(storage: StorageLike): void {
  const activeTeacherId = storage.getItem(ACTIVE_TEACHER_KEY)
  storage.removeItem(ACTIVE_TEACHER_KEY)
  storage.removeItem(MASCOT_MIRROR_KEY)

  if (activeTeacherId) {
    storage.removeItem(`start-here-dismissed:${activeTeacherId}`)
    storage.removeItem(`doffy-welcome:${activeTeacherId}`)
    const cheerPrefix = `teacher-app-star-cheer:${activeTeacherId}:`
    // الجمع قبل الحذف: الحذف أثناء التصفح يزيح الفهارس
    const doomed: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i)
      if (k && k.startsWith(cheerPrefix)) doomed.push(k)
    }
    for (const k of doomed) storage.removeItem(k)
  }

  const rawQueue = storage.getItem(QUEUE_KEY)
  if (rawQueue) {
    try {
      const parsed: unknown = JSON.parse(rawQueue)
      if (Array.isArray(parsed) && parsed.length === 0) {
        storage.removeItem(QUEUE_KEY)
      }
    } catch {
      // قيمة فاسدة: تُترك كما هي — لا حذف لبيانات لا نفهمها
    }
  }
}
