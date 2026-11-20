import { supabase } from '../../lib/supabase'
import type {
  EnrollmentRow,
  GroupInput,
  GroupRow,
  GroupWaitlistRow,
  WaitlistInput,
} from '../../types/database'

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

const GROUP_COLS =
  'id, teacher_id, name, billing_type, price, days, start_time, duration_minutes, room, capacity, assistant_name, links, created_at, updated_at'
const ENROLLMENT_COLS = 'id, teacher_id, student_id, group_id, price_override, prepaid_sessions, created_at'
const WAITLIST_COLS = 'id, teacher_id, group_id, name, phone, note, created_at'

export async function fetchGroups(teacherId: string): Promise<GroupRow[]> {
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as GroupRow[]
}

export async function fetchGroup(teacherId: string, groupId: string): Promise<GroupRow | null> {
  const { data, error } = await db()
    .from('groups')
    .select(GROUP_COLS)
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as GroupRow | null) ?? null
}

export async function createGroup(teacherId: string, input: GroupInput): Promise<GroupRow> {
  const { data, error } = await db()
    .from('groups')
    .insert({ teacher_id: teacherId, ...input })
    .select(GROUP_COLS)
    .single()
  if (error) throw error
  return data as unknown as GroupRow
}

export async function updateGroup(
  teacherId: string,
  groupId: string,
  input: GroupInput,
): Promise<GroupRow> {
  const { data, error } = await db()
    .from('groups')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', groupId)
    .select(GROUP_COLS)
    .single()
  if (error) throw error
  return data as unknown as GroupRow
}

/** قائمة طلاب مجموعة (roster): تسجيلات المجموعة مرتبطة ببيانات الطلاب */
export async function fetchGroupRoster(
  teacherId: string,
  groupId: string,
): Promise<(EnrollmentRow & { student_name: string; student_code: string; student_paused: boolean })[]> {
  const { data, error } = await db()
    .from('enrollments')
    .select(`${ENROLLMENT_COLS}, students(name, public_code, paused)`)
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const st = (row.students ?? {}) as { name?: string; public_code?: string; paused?: boolean }
    return {
      ...(row as unknown as EnrollmentRow),
      student_name: st.name ?? '—',
      student_code: st.public_code ?? '',
      student_paused: Boolean(st.paused),
    }
  })
}

export async function fetchWaitlist(teacherId: string, groupId: string): Promise<GroupWaitlistRow[]> {
  const { data, error } = await db()
    .from('group_waitlist')
    .select(WAITLIST_COLS)
    .eq('teacher_id', teacherId)
    .eq('group_id', groupId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as GroupWaitlistRow[]
}

export async function addWaitlistEntry(
  teacherId: string,
  groupId: string,
  input: WaitlistInput,
): Promise<GroupWaitlistRow> {
  const { data, error } = await db()
    .from('group_waitlist')
    .insert({ teacher_id: teacherId, group_id: groupId, ...input })
    .select(WAITLIST_COLS)
    .single()
  if (error) throw error
  return data as unknown as GroupWaitlistRow
}

/** عدّاد طلاب كل مجموعة (لبطاقات القائمة وشريط السعة) */
export function countByGroup(enrollments: EnrollmentRow[]): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of enrollments) map.set(e.group_id, (map.get(e.group_id) ?? 0) + 1)
  return map
}
