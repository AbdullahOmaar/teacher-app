import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthProvider'
import { useActiveTeacherId } from '../lib/workspace'
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
      /** owner = المدرس نفسه، assistant = عضو فريق بصلاحيات */
      role: 'owner' | 'assistant'
      /** صف ملف المستخدم نفسه (المدرس المالك) إن وُجد — يبقى متاحاً للتبديل */
      ownTeacher: TeacherRow | null
      /** عضوياته الفعّالة عند مدرسين آخرين */
      memberships: TeacherMemberRow[]
    }

const TEACHER_COLS = 'id, display_name, avatar_url, phone, created_at, updated_at'
const MEMBER_COLS = 'id, teacher_id, user_id, role, permissions, status, created_at, updated_at'

/**
 * يحلّ «المدرس الحالي» من جلسة Supabase:
 * 1) صف teachers حيث id = معرّف المستخدم (المدرس المالك).
 * 2) عضويات teacher_members الفعّالة (مساعد) — تُستخدم عند اختيار مساحة
 *    عمل مدرس آخر من الإعدادات (انظر lib/workspace).
 * الافتراضي دائماً حساب المستخدم نفسه؛ الهوكس كلها تعتمد على teacherId
 * الناتج هنا — لا بيانات بلا جلسة.
 *
 * ملحوظة RLS: سياسة teachers تسمح لكل مستخدم برؤية صفه فقط، لذا صف ملف
 * المدرس المضيف لا يُقرأ عند العمل كمساعد (teacher = null) بينما يبقى
 * teacherId صالحاً لاستعلامات البيانات بفضل سياسات المساعد.
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
      memberships: TeacherMemberRow[]
    } | null> => {
      const db = supabase!
      const uid = user!.id

      const { data: own, error: ownErr } = await db
        .from('teachers')
        .select(TEACHER_COLS)
        .eq('id', uid)
        .maybeSingle()
      if (ownErr) throw ownErr
      const ownTeacher = (own as TeacherRow | null) ?? null

      const { data: memberRows, error: memErr } = await db
        .from('teacher_members')
        .select(MEMBER_COLS)
        .eq('user_id', uid)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
      if (memErr) throw memErr
      const memberships = (memberRows ?? []) as unknown as TeacherMemberRow[]

      // مساحة عمل مختارة صراحة: عضوية فعّالة عند مدرس آخر
      if (activeTeacherId && activeTeacherId !== uid) {
        const active = memberships.find((m) => m.teacher_id === activeTeacherId)
        if (active) {
          return {
            teacherId: active.teacher_id,
            teacher: null, // RLS لا تسمح بقراءة ملف المدرس المضيف
            role: 'assistant',
            ownTeacher,
            memberships,
          }
        }
      }

      if (ownTeacher) {
        return {
          teacherId: ownTeacher.id,
          teacher: ownTeacher,
          role: 'owner',
          ownTeacher,
          memberships,
        }
      }

      // لا ملف خاص: أول عضوية فعّالة إن وُجدت
      const first = memberships[0]
      if (first) {
        return {
          teacherId: first.teacher_id,
          teacher: null,
          role: 'assistant',
          ownTeacher: null,
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
