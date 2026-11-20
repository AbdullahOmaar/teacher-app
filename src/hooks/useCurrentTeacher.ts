import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthProvider'
import { useActiveTeacherId } from '../lib/workspace'
import { claimTeacherInvites } from '../features/auth/api'
import type { TeacherMemberRow, TeacherRow } from '../types/database'

export type TeacherResolution =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** مسجل دخول لكن لا يوجد صف teachers مرتبط ولا عضوية فعّالة — يحتاج Onboarding */
  | { status: 'no-teacher' }
  | {
      status: 'ready'
      teacherId: string
      teacher: TeacherRow | null
      /** owner = مالك السنتر النشط، assistant = عضو فريق بصلاحيات */
      role: 'owner' | 'assistant'
      /** السنتر الأساسي للمستخدم (id = uid إن وُجد، وإلا أقدم سنتر يملكه) */
      ownTeacher: TeacherRow | null
      /** كل السناتر التي يملكها المستخدم (0016) مرتبة بالأقدم — للمبدّل */
      ownTeachers: TeacherRow[]
      /** عضوياته الفعّالة عند مدرسين آخرين */
      memberships: TeacherMemberRow[]
    }

const TEACHER_COLS = 'id, owner_user_id, display_name, avatar_url, phone, created_at, updated_at'
const MEMBER_COLS =
  'id, teacher_id, user_id, invited_email, role, permissions, status, created_at, updated_at'

/**
 * مستخدمون جرت محاولة ادعاء دعواتهم في جلسة التطبيق هذه — الادعاء يُستدعى
 * مرة واحدة لكل مستخدم (الدالة نفسها آمنة التكرار، فهذا مجرد توفير
 * لطلب شبكة عند كل إعادة حلّ للهوية).
 */
const claimAttemptedFor = new Set<string>()

/**
 * يحلّ «السنتر النشط» من جلسة Supabase:
 * 0) ادعاء أي دعوات بريد معلّقة ببريد المستخدم (مرة واحدة لكل جلسة)
 *    حتى تُقرأ العضويات بعد تفعيلها مباشرة.
 * 1) كل صفوف teachers التي يملكها المستخدم (owner_user_id = uid، ‏0016) —
 *    قد تكون سنتراً واحداً (الحالة التاريخية) أو عدة سناتر.
 * 2) عضويات teacher_members الفعّالة (مساعد عند مدرسين آخرين).
 *
 * اختيار النشط: معرّف محفوظ في lib/workspace إن كان ما زال صالحاً
 * (سنتر يملكه أو عضوية فعّالة)، وإلا سقوط آمن: السنتر الأساسي
 * (id = uid) ثم أقدم سنتر مملوك ثم أول عضوية. مستخدم السنتر الواحد
 * يرى سلوك ما قبل 0016 حرفياً.
 * الهوكس كلها تعتمد على teacherId الناتج هنا — لا بيانات بلا جلسة.
 *
 * ملحوظة RLS: عند العمل كمساعد لا يُقرأ صف ملف المدرس المضيف
 * (teacher = null) بينما يبقى teacherId صالحاً لاستعلامات البيانات
 * بفضل سياسات المساعد — كما كان قبل 0016.
 */
export function useCurrentTeacher(): TeacherResolution {
  const { user, loading: authLoading, configured } = useAuth()
  const activeTeacherId = useActiveTeacherId()

  const query = useQuery({
    queryKey: ['current-teacher', user?.id ?? null, activeTeacherId],
    enabled: Boolean(supabase && user),
    queryFn: async (): Promise<{
      teacherId: string
      teacher: TeacherRow | null
      role: 'owner' | 'assistant'
      ownTeacher: TeacherRow | null
      ownTeachers: TeacherRow[]
      memberships: TeacherMemberRow[]
    } | null> => {
      const db = supabase!
      const uid = user!.id

      // ادعاء دعوات البريد المعلّقة (migration ‏0006) قبل قراءة العضويات:
      // دعوة ببريد هذا المستخدم تتحول لعضوية فعّالة هنا، فتظهر في حلّ
      // الهوية نفسه ويدخل المساعد حساب المدرس بلا أي خطوة يدوية.
      // فشل الادعاء (شبكة/خادم) لا يكسر الحلّ — نكمل بالحالة الحالية.
      if (!claimAttemptedFor.has(uid)) {
        claimAttemptedFor.add(uid)
        try {
          await claimTeacherInvites()
        } catch {
          // تجاهل متعمّد: المحاولة التالية عند دخول جديد
        }
      }

      const { data: ownRows, error: ownErr } = await db
        .from('teachers')
        .select(TEACHER_COLS)
        .eq('owner_user_id', uid)
        .order('created_at', { ascending: true })
      if (ownErr) throw ownErr
      const ownTeachers = (ownRows ?? []) as unknown as TeacherRow[]
      // السنتر الأساسي: الصف التاريخي id = uid إن وُجد، وإلا الأقدم
      const ownTeacher = ownTeachers.find((t) => t.id === uid) ?? ownTeachers[0] ?? null

      const { data: memberRows, error: memErr } = await db
        .from('teacher_members')
        .select(MEMBER_COLS)
        .eq('user_id', uid)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
      if (memErr) throw memErr
      const memberships = (memberRows ?? []) as unknown as TeacherMemberRow[]

      // مساحة عمل مختارة صراحة وما زالت صالحة
      if (activeTeacherId) {
        const ownActive = ownTeachers.find((t) => t.id === activeTeacherId)
        if (ownActive) {
          return {
            teacherId: ownActive.id,
            teacher: ownActive,
            role: 'owner',
            ownTeacher,
            ownTeachers,
            memberships,
          }
        }
        const active = memberships.find((m) => m.teacher_id === activeTeacherId)
        if (active) {
          return {
            teacherId: active.teacher_id,
            teacher: null, // RLS لا تسمح بقراءة ملف المدرس المضيف
            role: 'assistant',
            ownTeacher,
            ownTeachers,
            memberships,
          }
        }
        // اختيار محفوظ لم يعد صالحاً (سنتر حُذف/عضوية انتهت): سقوط آمن للأسفل
      }

      if (ownTeacher) {
        return {
          teacherId: ownTeacher.id,
          teacher: ownTeacher,
          role: 'owner',
          ownTeacher,
          ownTeachers,
          memberships,
        }
      }

      // لا سنتر مملوك: أول عضوية فعّالة إن وُجدت
      const first = memberships[0]
      if (first) {
        return {
          teacherId: first.teacher_id,
          teacher: null,
          role: 'assistant',
          ownTeacher: null,
          ownTeachers,
          memberships,
        }
      }

      return null
    },
  })

  if (authLoading) return { status: 'loading' }
  if (!configured || !user) return { status: 'signed-out' }
  if (query.isPending) return { status: 'loading' }
  if (query.isError || !query.data) return { status: 'no-teacher' }
  return { status: 'ready', ...query.data }
}
