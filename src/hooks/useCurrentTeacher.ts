import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthProvider'
import type { TeacherRow } from '../types/database'

export type TeacherResolution =
  | { status: 'loading' }
  | { status: 'signed-out' }
  /** مسجل دخول لكن لا يوجد صف teachers مرتبط ولا عضوية فعّالة */
  | { status: 'no-teacher' }
  | {
      status: 'ready'
      teacherId: string
      teacher: TeacherRow | null
      /** owner = المدرس نفسه، assistant = عضو فريق بصلاحيات */
      role: 'owner' | 'assistant'
    }

/**
 * يحلّ «المدرس الحالي» من جلسة Supabase:
 * 1) صف teachers حيث id = معرّف المستخدم (المدرس المالك).
 * 2) وإلا عضوية teacher_members فعّالة (مساعد) → teacher_id الخاص بها.
 * الهوكس كلها تعتمد على teacherId الناتج هنا — لا بيانات بلا جلسة.
 */
export function useCurrentTeacher(): TeacherResolution {
  const { user, loading: authLoading, configured } = useAuth()

  const query = useQuery({
    queryKey: ['current-teacher', user?.id ?? null],
    enabled: Boolean(supabase && user),
    queryFn: async (): Promise<
      { teacherId: string; teacher: TeacherRow | null; role: 'owner' | 'assistant' } | null
    > => {
      const db = supabase!
      const uid = user!.id

      const { data: own, error: ownErr } = await db
        .from('teachers')
        .select('id, display_name, avatar_url, phone, created_at, updated_at')
        .eq('id', uid)
        .maybeSingle()
      if (ownErr) throw ownErr
      if (own) return { teacherId: own.id, teacher: own as TeacherRow, role: 'owner' }

      const { data: member, error: memErr } = await db
        .from('teacher_members')
        .select('teacher_id')
        .eq('user_id', uid)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (memErr) throw memErr
      if (!member) return null

      const { data: teacher } = await db
        .from('teachers')
        .select('id, display_name, avatar_url, phone, created_at, updated_at')
        .eq('id', member.teacher_id)
        .maybeSingle()
      return {
        teacherId: member.teacher_id as string,
        teacher: (teacher as TeacherRow | null) ?? null,
        role: 'assistant',
      }
    },
  })

  if (authLoading) return { status: 'loading' }
  if (!configured || !user) return { status: 'signed-out' }
  if (query.isPending) return { status: 'loading' }
  if (query.isError || !query.data) return { status: 'no-teacher' }
  return { status: 'ready', ...query.data }
}
