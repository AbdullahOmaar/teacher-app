import { db, supabase } from '../../lib/supabase'
import { t } from '../../i18n'
import type {
  ActivityActorRole,
  ActivityEventType,
  ActivityLogRow,
  Json,
  Tables,
} from '../../types/database'

// ===========================================================================
// سجل النشاط (Phase 3 — الخطوة 2، migration ‏0009)
//
// التسجيل يعيش هنا في طبقة البيانات حصراً: دوال الكتابة الجوهرية في وحدات
// الفواتير/الحضور/الفريق/الإثباتات/الطلاب/المجموعات/الخزنة تستدعي
// logActivity بعد نجاح عمليتها، والواجهات لا تسجّل شيئاً بنفسها.
//
// عقدان حاكمان:
// 1) Fail-safe مطلق: logActivity لا ترمي أبداً — أي فشل (لا جلسة، RLS،
//    شبكة) يُبتلع بصمت، فخطأ السجل لا يكسر الحفظ الأصلي إطلاقاً. لهذا
//    تُستدعى بصيغة `void logActivity(...)` (fire-and-forget) أو await
//    داخل try ضمني — النتيجتان سواء لأنها لا ترفض وعدها أبداً.
// 2) الفاعل من الجلسة فقط: actor_id/الدور/الاسم يُحلّون من جلسة Supabase
//    الحالية وقت الحدث (لا معاملات من المستدعي)، وسياسات RLS تفرض
//    actor_id = auth.uid() قاعدياً — لا تزوير باسم غير الفاعل.
//    الدور داخل النطاق: المالك إن كان actor هو teacher_id نفسه، وإلا
//    مساعد. الاسم لقطة: display_name من teachers إن وُجد لصاحب الجلسة،
//    وإلا بريده — ويُخزَّن مؤقتاً لكل جلسة حتى لا يتكرر الاستعلام.
// ===========================================================================

export interface ActivityEventInput {
  event_type: ActivityEventType
  entity_type?: string | null
  entity_id?: string | null
  entity_label?: string | null
  details?: Record<string, Json | undefined>
}

interface ActorSnapshot {
  id: string
  role: ActivityActorRole
  name: string | null
}

/** كاش لقطة الفاعل لكل (مستخدم، نطاق) داخل جلسة التطبيق — الاسم نادر التغير */
const actorCache = new Map<string, ActorSnapshot>()

async function resolveActor(teacherId: string): Promise<ActorSnapshot | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null
  const cacheKey = `${user.id}|${teacherId}`
  const cached = actorCache.get(cacheKey)
  if (cached) return cached

  const role: ActivityActorRole = user.id === teacherId ? 'owner' : 'assistant'
  let name: string | null =
    (typeof user.user_metadata?.display_name === 'string' && user.user_metadata.display_name) ||
    user.email ||
    null
  // اسم العرض الرسمي من ملف المدرس إن وُجد لحساب الجلسة (للمالك دائماً،
  // وللمساعد إن كان له ملف مدرس خاص به) — RLS تسمح بقراءة صفه فقط.
  try {
    const { data: row } = await supabase
      .from('teachers')
      .select('display_name')
      .eq('id', user.id)
      .maybeSingle()
    const display = row?.display_name
    if (display) name = display
  } catch {
    // الاسم التخميني (بريد/بيانات الجلسة) يكفي — التسجيل لا يفشل لاسم
  }
  const snapshot: ActorSnapshot = { id: user.id, role, name }
  actorCache.set(cacheKey, snapshot)
  return snapshot
}

/**
 * تسجيل حدث واحد — لا ترمي أبداً (انظر العقد أعلاه). تُستدعى بعد نجاح
 * العملية الأصلية فقط، فالسجل لا يحمل أحداثاً لم تحدث.
 */
export async function logActivity(teacherId: string, event: ActivityEventInput): Promise<void> {
  try {
    if (!supabase || !teacherId) return
    const actor = await resolveActor(teacherId)
    if (!actor) return
    const { error } = await supabase.from('activity_log').insert({
      teacher_id: teacherId,
      actor_id: actor.id,
      actor_role: actor.role,
      actor_name: actor.name,
      event_type: event.event_type,
      entity_type: event.entity_type ?? null,
      entity_id: event.entity_id ?? null,
      entity_label: event.entity_label ?? null,
      details: event.details ?? {},
    })
    if (error) {
      // ابتلاع مقصود وموثّق: السجل طبقة تدقيق مساعدة، لا جزء من العملية
      console.warn(t('activity.apiLogFailed'), event.event_type, error.message)
    }
  } catch {
    // ابتلاع مقصود: انظر عقد الـ fail-safe في الترويسة
  }
}

// ---------------------------------------------------------------------------
// تجميع أحداث الحضور الفردية: saveAttendance تُستدعى لكل طالب على حدة
// (نقرة لكل طالب + مزامنة الأوفلاين عنصراً عنصراً)، وتسجيل صف لكل نقرة
// كان سيغرق السجل. بدلاً من ذلك تُجمَّع لمسات نفس (المدرس، الحصة) في
// نافذة قصيرة وتُفرَّغ كحدث واحد «attendance_saved» بعدد الطلاب المميزين
// — فيبقى السجل تجميعياً لكل حصة كما هو مطلوب، مهما كان مسار الحفظ.
// الحفظ الجماعي (saveManyAttendance) يسجّل حدثه فوراً ولا يمر من هنا.
// ---------------------------------------------------------------------------

const ATTENDANCE_COALESCE_MS = 4000

interface PendingAttendance {
  students: Set<string>
  timer: ReturnType<typeof setTimeout>
}

const pendingAttendance = new Map<string, PendingAttendance>()

export function logAttendanceTouch(teacherId: string, sessionId: string, studentId: string): void {
  const key = `${teacherId}|${sessionId}`
  let pending = pendingAttendance.get(key)
  if (!pending) {
    pending = {
      students: new Set<string>(),
      timer: setTimeout(() => {
        pendingAttendance.delete(key)
        void logActivity(teacherId, {
          event_type: 'attendance_saved',
          entity_type: 'session',
          entity_id: sessionId,
          details: {
            student_count: pending!.students.size,
            coalesced: true,
          },
        })
      }, ATTENDANCE_COALESCE_MS),
    }
    pendingAttendance.set(key, pending)
  }
  pending.students.add(studentId)
}

// ---------------------------------------------------------------------------
// القراءة — شاشة سجل النشاط: أحدث أولاً، بفلاتر خادمية (النوع/الفاعل/
// المدى) وبحث نصي خفيف على اسم الكيان/الفاعل. RLS تقرر النطاق فعلياً:
// المالك يرى الكل، والمساعد يرى صفوفه فقط مهما طلبت الواجهة.
// ---------------------------------------------------------------------------

const ACTIVITY_PAGE_SIZE = 200

export interface ActivityFilters {
  eventType?: ActivityEventType | null
  actorId?: string | null
  /** 'YYYY-MM-DD' شامل */
  fromDate?: string | null
  /** 'YYYY-MM-DD' شامل (يُحوَّل لبداية اليوم التالي في الاستعلام) */
  toDate?: string | null
  search?: string | null
  limit?: number
}

const LOG_COLS =
  'id, teacher_id, actor_id, actor_role, actor_name, event_type, entity_type, entity_id, entity_label, details, created_at'

/** تنظيف مصطلح البحث من محارف PostgREST/ILIKE حتى لا يكسر بنية الاستعلام */
function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()*\\]/g, ' ').trim()
}

/**
 * صف سجل من العميل الم typed: ‏actor_role وevent_type نصان في الأنواع
 * المولّدة ومقيدان بقيود CHECK في المخطط، وdetails jsonb خريطة حرة —
 * التضييقات الموثّقة في types/database.ts تتحقق هنا في محوّل واحد.
 */
function toActivityRow(r: Tables<'activity_log'>): ActivityLogRow {
  return {
    ...r,
    actor_role: r.actor_role as ActivityActorRole,
    event_type: r.event_type as ActivityEventType,
    details: (r.details ?? {}) as Record<string, unknown>,
  }
}

export async function fetchActivityLog(
  teacherId: string,
  filters: ActivityFilters = {},
): Promise<ActivityLogRow[]> {
  let q = db()
    .from('activity_log')
    .select(LOG_COLS)
    .eq('teacher_id', teacherId)
    .order('created_at', { ascending: false })
    .limit(filters.limit ?? ACTIVITY_PAGE_SIZE)
  if (filters.eventType) q = q.eq('event_type', filters.eventType)
  if (filters.actorId) q = q.eq('actor_id', filters.actorId)
  if (filters.fromDate) q = q.gte('created_at', `${filters.fromDate}T00:00:00`)
  if (filters.toDate) q = q.lt('created_at', `${nextDayStr(filters.toDate)}T00:00:00`)
  const term = filters.search ? sanitizeSearch(filters.search) : ''
  if (term) {
    q = q.or(`entity_label.ilike.%${term}%,actor_name.ilike.%${term}%`)
  }
  const { data, error } = await q
  if (error) throw error
  return (data ?? []).map(toActivityRow)
}

function nextDayStr(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + 1)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export interface ActivityActorOption {
  id: string
  name: string
  role: ActivityActorRole
}

/**
 * قائمة الفاعلين لفلتر «مين عمل؟» — تُشتق من أحدث صفوف النطاق المرئية
 * للمستخدم الحالي (المالك: كل الفاعلين؛ المساعد: نفسه فقط بفعل RLS).
 */
export async function fetchActivityActors(teacherId: string): Promise<ActivityActorOption[]> {
  const { data, error } = await db()
    .from('activity_log')
    .select('actor_id, actor_name, actor_role')
    .eq('teacher_id', teacherId)
    .not('actor_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) throw error
  const seen = new Map<string, ActivityActorOption>()
  for (const row of data ?? []) {
    if (!row.actor_id) continue
    if (!seen.has(row.actor_id)) {
      seen.set(row.actor_id, {
        id: row.actor_id,
        name: row.actor_name ?? t('activity.page.userFallback'),
        // actor_role مقيد بقيد CHECK في المخطط لقيمتي ActivityActorRole
        role: row.actor_role as ActivityActorRole,
      })
    }
  }
  return [...seen.values()]
}

// ---------------------------------------------------------------------------
// أسماء الأحداث العربية — مصدر العرض الوحيد (الشاشة + أي سطح لاحق)
// ---------------------------------------------------------------------------

export const EVENT_TYPE_LABELS: Record<ActivityEventType, string> = {
  payment_created: t('activity.event.payment_created'),
  payment_voided: t('activity.event.payment_voided'),
  invoice_created: t('activity.event.invoice_created'),
  invoices_generated: t('activity.event.invoices_generated'),
  attendance_saved: t('activity.event.attendance_saved'),
  member_invited: t('activity.event.member_invited'),
  member_joined: t('activity.event.member_joined'),
  member_removed: t('activity.event.member_removed'),
  member_invite_cancelled: t('activity.event.member_invite_cancelled'),
  member_permissions_updated: t('activity.event.member_permissions_updated'),
  proof_approved: t('activity.event.proof_approved'),
  proof_rejected: t('activity.event.proof_rejected'),
  student_deleted: t('activity.event.student_deleted'),
  student_archived: t('activity.event.student_archived'),
  student_unarchived: t('activity.event.student_unarchived'),
  group_deleted: t('activity.event.group_deleted'),
  group_archived: t('activity.event.group_archived'),
  group_unarchived: t('activity.event.group_unarchived'),
  cashbox_closed: t('activity.event.cashbox_closed'),
}

export const EVENT_TYPE_OPTIONS: { code: ActivityEventType; label: string }[] = (
  Object.keys(EVENT_TYPE_LABELS) as ActivityEventType[]
).map((code) => ({ code, label: EVENT_TYPE_LABELS[code] }))

export const ACTOR_ROLE_LABELS: Record<ActivityActorRole, string> = {
  owner: t('activity.role.owner'),
  assistant: t('activity.role.assistant'),
}
