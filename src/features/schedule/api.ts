import { supabase } from '../../lib/supabase'
import { DAY_NAMES } from '../../lib/format'
import type { ExtraSessionInput, GroupRow, HolidayRow, SessionRow } from '../../types/database'
import {
  addDaysStr,
  fetchSessionsInRange,
  monthEndStr,
  monthStartStr,
  toDateStr,
  todayStr,
  type SessionWithGroup,
} from '../home/api'

export { fetchSessionsInRange, todayStr }
export type { SessionWithGroup }

function db() {
  if (!supabase) throw new Error('Supabase غير مربوط — راجع إعدادات .env')
  return supabase
}

// ---------------------------------------------------------------------------
// مساعدات التاريخ — كل التواريخ بصيغة 'YYYY-MM-DD' بالتوقيت المحلي مثل المخطط.
// ترتيب الأيام: 0 = الأحد … 6 = السبت (Date.getDay و Postgres dow و groups.days)
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`)
}

/** بداية أسبوع التاريخ (الأحد) */
export function weekStartStr(dateStr: string): string {
  const d = parseDate(dateStr)
  d.setDate(d.getDate() - d.getDay())
  return toDateStr(d)
}

/** أيام أسبوع يبدأ في التاريخ المعطى (7 تواريخ) */
export function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysStr(weekStart, i))
}

/** أول يوم في شهر آخر مزاحاً بعدد الشهور n عن شهر التاريخ المعطى */
export function addMonthsStr(dateStr: string, n: number): string {
  const [y, m] = dateStr.split('-').map(Number)
  return toDateStr(new Date(y, m - 1 + n, 1))
}

/** بدايات الشهور ('YYYY-MM-01') التي يغطيها المدى [from, to] شاملاً الطرفين */
export function monthsCovering(from: string, to: string): string[] {
  const out: string[] = []
  let cur = monthStartStr(from)
  const last = monthStartStr(to)
  while (cur <= last) {
    out.push(cur)
    cur = addMonthsStr(cur, 1)
  }
  return out
}

/** كل التواريخ من from إلى to شاملاً الطرفين (لنطاقات الإجازات) */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  let cur = from
  while (cur <= to) {
    out.push(cur)
    cur = addDaysStr(cur, 1)
  }
  return out
}

/** تسمية عربية كاملة: «السبت 15 نوفمبر 2026» */
export function formatDateLabel(dateStr: string): string {
  const d = parseDate(dateStr)
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`
}

/** تسمية مختصرة: «15 نوفمبر» */
export function formatDayMonth(dateStr: string): string {
  const d = parseDate(dateStr)
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]}`
}

// ---------------------------------------------------------------------------
// توليد الحصص — الدالة الجاهزة في المخطط public.generate_group_sessions
// (0001_init.sql): تولّد حصص شهر كامل لمجموعة من أيامها الأسبوعية
// (groups.days/start_time/duration_minutes)، آمنة التكرار
// (on conflict do nothing مدعوماً بالقيد الفريد الجزئي
// sessions_regular_unique على (group_id, session_date) حيث kind='regular')،
// وحصة يوم الإجازة تُنشأ بحالة cancelled لا تُتخطى.
//
// نافذة التوليد: 3 شهور حول اليوم — الشهر الماضي + الحالي + القادم —
// بما يخدم الرئيسية (اليوم/غداً) والحضور والفوترة الشهرية، وتتوسع تلقائياً
// لأي شهر يتنقّل إليه المستخدم في شاشة الجدول. مفاتيح (مدرس، مجموعة، شهر)
// التي اكتمل توليدها تُحفظ في ذاكرة الجلسة فلا تتكرر استدعاءات RPC،
// وزر «تحديث الحصص» في الشاشة يمسح الذاكرة ويعيد التوليد.
// ---------------------------------------------------------------------------

/** نافذة التوليد الافتراضية حول مرساة (اليوم): الماضي + الحالي + القادم */
export function generationWindowMonths(anchor: string = todayStr()): string[] {
  const cur = monthStartStr(anchor)
  return [addMonthsStr(cur, -1), cur, addMonthsStr(cur, 1)]
}

const ensuredKeys = new Set<string>()

/** يمسح ذاكرة التوليد — يستخدمه زر التحديث اليدوي لإعادة التوليد الكاملة */
export function resetGenerationCache() {
  ensuredKeys.clear()
}

/**
 * يضمن توليد حصص المجموعات المعطاة لشهور البدايات المعطاة عبر RPC المخطط.
 * Idempotent تماماً: لا حصص مكررة أبداً (قيد المخطط + on conflict)، وإعادة
 * الاستدعاء لنفس (مجموعة، شهر) داخل نفس جلسة التطبيق لا تستدعي RPC أصلاً.
 * مجموعة بلا أيام جدول لا تُستدعى لها الدالة (لن تولّد شيئاً).
 */
export async function ensureSessionsGenerated(
  teacherId: string,
  groups: GroupRow[],
  monthStarts: string[],
): Promise<void> {
  const jobs: Promise<void>[] = []
  for (const g of groups) {
    if (!g.days || g.days.length === 0) continue
    // مجموعة مؤرشفة لا تولّد حصصاً جديدة (خطوة 10) — والـ RPC نفسه يرفضها أيضاً (0007)
    if (g.archived_at != null) continue
    for (const month of monthStarts) {
      const key = `${teacherId}|${g.id}|${month}`
      if (ensuredKeys.has(key)) continue
      ensuredKeys.add(key)
      jobs.push(
        (async () => {
          const { error } = await db().rpc('generate_group_sessions', {
            p_teacher_id: teacherId,
            p_group_id: g.id,
            p_month: month,
          })
          if (error) {
            // فشل هذا الشهر لا يمنع إعادة المحاولة لاحقاً
            ensuredKeys.delete(key)
            throw error
          }
        })(),
      )
    }
  }
  await Promise.all(jobs)
}

// ---------------------------------------------------------------------------
// الإجازات — holidays صف لكل يوم (holiday_date) بقيد فريد (teacher_id, date).
// نطاق إجازة من الواجهة = صف لكل يوم في النطاق.
// إنشاء إجازة يُعلّم حصص أيامها القائمة كـ cancelled (لا حذف — المرجع §5.5
// والمخطط يولّد حصة يوم الإجازة cancelled أصلاً)، وحذف إجازة يوم يعيد حصص
// ذلك اليوم الملغاة إلى scheduled. ملحوظة موثّقة: حصة أُلغيت يدوياً في نفس
// يوم إجازة ثم حُذفت الإجازة ستُستعاد أيضاً — لا يوجد حقل «سبب إلغاء» في
// المخطط يميّز الحالتين.
// ---------------------------------------------------------------------------

const HOLIDAY_COLS = 'id, teacher_id, holiday_date, name, created_at'

export async function fetchHolidays(teacherId: string): Promise<HolidayRow[]> {
  const { data, error } = await db()
    .from('holidays')
    .select(HOLIDAY_COLS)
    .eq('teacher_id', teacherId)
    .order('holiday_date', { ascending: true })
  if (error) throw error
  return (data ?? []) as unknown as HolidayRow[]
}

/** يضيف أيام إجازة (يتجاهل الأيام الموجودة) ويُلغي حصصها القائمة */
export async function addHolidayDates(
  teacherId: string,
  dates: string[],
  name: string | null,
): Promise<void> {
  if (dates.length === 0) return
  const { error } = await db()
    .from('holidays')
    .upsert(
      dates.map((d) => ({ teacher_id: teacherId, holiday_date: d, name })),
      { onConflict: 'teacher_id,holiday_date', ignoreDuplicates: true },
    )
  if (error) throw error
  const { error: sessErr } = await db()
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('teacher_id', teacherId)
    .in('session_date', dates)
    .eq('status', 'scheduled')
  if (sessErr) throw sessErr
}

/** يحذف إجازة يوم واحد ويستعيد حصص ذلك اليوم الملغاة إلى scheduled */
export async function deleteHoliday(teacherId: string, holiday: HolidayRow): Promise<void> {
  const { error } = await db()
    .from('holidays')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', holiday.id)
  if (error) throw error
  const { error: sessErr } = await db()
    .from('sessions')
    .update({ status: 'scheduled' })
    .eq('teacher_id', teacherId)
    .eq('session_date', holiday.holiday_date)
    .eq('status', 'cancelled')
  if (sessErr) throw sessErr
}

// ---------------------------------------------------------------------------
// الحصص الاستثنائية — النموذج المصمم له المخطط (sessions.kind +
// origin_session_id + status):
// • إضافية: صف جديد kind='extra' لمرة واحدة دون تغيير الجدول الثابت (§4/8).
// • منقولة: الأصلية (regular) تُعلَّم cancelled ويُنشأ صف جديد kind='moved'
//   بنفس المدة و origin_session_id يشير للأصلية (§5.5: نقل = إلغاء + نسخة).
//   أما نقل حصة extra/moved أصلاً فيُعدَّل صفّها نفسه (لا سلسلة نسخ).
// • حصة تُنشأ/تُنقل إلى يوم إجازة تُنشأ بحالة cancelled اتساقاً مع دالة
//   التوليد في المخطط.
// ---------------------------------------------------------------------------

const SESSION_COLS =
  'id, teacher_id, group_id, session_date, start_time, duration_minutes, kind, status, origin_session_id, note, created_at, updated_at'

async function isHolidayDate(teacherId: string, date: string): Promise<boolean> {
  const { data, error } = await db()
    .from('holidays')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('holiday_date', date)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

export async function createExtraSession(
  teacherId: string,
  input: ExtraSessionInput,
): Promise<SessionRow> {
  const holiday = await isHolidayDate(teacherId, input.session_date)
  const { data, error } = await db()
    .from('sessions')
    .insert({
      teacher_id: teacherId,
      group_id: input.group_id,
      session_date: input.session_date,
      start_time: input.start_time,
      duration_minutes: input.duration_minutes,
      kind: 'extra',
      status: holiday ? 'cancelled' : 'scheduled',
      note: input.note,
    })
    .select(SESSION_COLS)
    .single()
  if (error) throw error
  return data as unknown as SessionRow
}

export async function moveSession(
  teacherId: string,
  session: SessionRow,
  newDate: string,
  newTime: string,
): Promise<void> {
  const holiday = await isHolidayDate(teacherId, newDate)
  const targetStatus = holiday ? 'cancelled' : 'scheduled'

  if (session.kind !== 'regular') {
    // extra / moved: تعديل الصف نفسه — لا نسخ ولا تغيير للنوع أو الأصل
    const { error } = await db()
      .from('sessions')
      .update({ session_date: newDate, start_time: newTime })
      .eq('teacher_id', teacherId)
      .eq('id', session.id)
    if (error) throw error
    return
  }

  // regular: إنشاء النسخة المنقولة أولاً ثم إلغاء الأصلية (مع تعويض عند الفشل)
  const { data, error } = await db()
    .from('sessions')
    .insert({
      teacher_id: teacherId,
      group_id: session.group_id,
      session_date: newDate,
      start_time: newTime,
      duration_minutes: session.duration_minutes,
      kind: 'moved',
      status: targetStatus,
      origin_session_id: session.id,
      note: session.note,
    })
    .select('id')
    .single()
  if (error) throw error
  const newId = (data as unknown as { id: string }).id

  const { error: cancelErr } = await db()
    .from('sessions')
    .update({ status: 'cancelled' })
    .eq('teacher_id', teacherId)
    .eq('id', session.id)
  if (cancelErr) {
    // تعويض: احذف النسخة المنشأة حتى لا تبقى حصتان نشطتان لنفس الموعد الأصلي
    await db().from('sessions').delete().eq('teacher_id', teacherId).eq('id', newId)
    throw cancelErr
  }
}

/** إلغاء / استرجاع حصة — تبديل status فقط، بلا حذف أبداً */
export async function setSessionStatus(
  teacherId: string,
  sessionId: string,
  status: 'scheduled' | 'cancelled',
): Promise<void> {
  const { error } = await db()
    .from('sessions')
    .update({ status })
    .eq('teacher_id', teacherId)
    .eq('id', sessionId)
  if (error) throw error
}

export { monthEndStr, monthStartStr }
