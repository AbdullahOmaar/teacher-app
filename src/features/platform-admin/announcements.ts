import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { isMissingRpcFunction } from '../auth/api'
import type { TicketStatus } from '../support/api'

/** هل الخطأ سببه غياب جدول/علاقة (المهاجرة لم تُطبَّق بعد)؟ — نفس نمط panel.ts */
function isMissingRelation(error: {
  code?: string
  message?: string
} | null): boolean {
  if (!error) return false
  return (
    error.code === '42P01' ||
    error.code === 'PGRST205' ||
    (error.message ?? '').includes('does not exist') ||
    (error.message ?? '').includes('schema cache')
  )
}

// ---------------------------------------------------------------------------
// إعلانات المنصة + تذاكر الدعم — سطح الأدمن (مهمة 17/23 — 0065، الخطوة 8)
// • الإعلانات: نشر/حذف/قائمة عبر RPCs إدارية موثّقة في سجل التدقيق؛
//   القراءة للمدرس عبر platform_announcements_for_me (في support/api).
// • التذاكر: قائمة الأدمن + تغيير الحالة عبر RPCs؛ قراءة الخيط والرد
//   مشتركة مع طرف المدرس في support/api (الدور يُشتق خادمياً).
// • قاعدة التسامح (دروس الخطوات 1–7): أي دالة/جدول غائب قبل تطبيق
//   0065 عند بوابة التجميد يرجع null هنا فتعرض الأقسام «قريباً»
//   مصممة — لا خطأ خام أبداً (قاعدة مالك 2026-11-26).
// ---------------------------------------------------------------------------

export type AnnouncementKind = 'update' | 'maintenance' | 'general'

export const ANNOUNCEMENT_KINDS: AnnouncementKind[] = [
  'update',
  'maintenance',
  'general',
]

/** إعلان واحد كما يرجع من platform_announcements_list() */
export interface PlatformAnnouncement {
  id: string
  title: string
  body: string
  kind: AnnouncementKind
  scheduledAt: string | null
  publishedAt: string
  createdAt: string
}

/** تذكرة في قائمة الأدمن كما ترجع من platform_support_tickets() */
export interface AdminTicketRow {
  id: string
  teacherId: string
  teacherName: string | null
  subject: string
  status: TicketStatus
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export const TICKET_STATUSES: TicketStatus[] = [
  'new',
  'in_progress',
  'waiting_teacher',
  'closed',
]

/** اسم عرض نوع الإعلان — مفاتيح i18n حرفية في كل فرع */
export function announcementKindLabel(kind: string): string {
  switch (kind) {
    case 'update':
      return t('platformAdmin.announcementKindUpdate')
    case 'maintenance':
      return t('platformAdmin.announcementKindMaintenance')
    default:
      return t('platformAdmin.announcementKindGeneral')
  }
}

/** اسم عرض حالة التذكرة — مفاتيح i18n حرفية في كل فرع */
export function ticketStatusLabel(status: string): string {
  switch (status) {
    case 'new':
      return t('platformAdmin.ticketStatusNew')
    case 'in_progress':
      return t('platformAdmin.ticketStatusInProgress')
    case 'waiting_teacher':
      return t('platformAdmin.ticketStatusWaitingTeacher')
    case 'closed':
      return t('platformAdmin.ticketStatusClosed')
    default:
      return t('platformAdmin.ticketStatusNew')
  }
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asKind(value: unknown): AnnouncementKind {
  return value === 'update' || value === 'maintenance' ? value : 'general'
}

function asTicketStatus(value: unknown): TicketStatus {
  return value === 'in_progress' ||
    value === 'waiting_teacher' ||
    value === 'closed'
    ? value
    : 'new'
}

/**
 * تحويل حمولة إعلان خام (jsonb) إلى صف — أي قيمة غائبة/مشوّهة تسقط
 * إلى قيمة آمنة بدل كسر الصفحة؛ صف بلا id يُسقط من القائمة.
 */
export function parseAnnouncement(row: unknown): PlatformAnnouncement | null {
  const r = (row ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') return null
  return {
    id: r.id,
    title: asText(r.title),
    body: asText(r.body),
    kind: asKind(r.kind),
    scheduledAt: typeof r.scheduled_at === 'string' ? r.scheduled_at : null,
    publishedAt: typeof r.published_at === 'string' ? r.published_at : '',
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
  }
}

export function parseAnnouncements(data: unknown): PlatformAnnouncement[] {
  if (!Array.isArray(data)) return []
  const out: PlatformAnnouncement[] = []
  for (const row of data) {
    const parsed = parseAnnouncement(row)
    if (parsed) out.push(parsed)
  }
  return out
}

export function parseAdminTicketRow(row: unknown): AdminTicketRow | null {
  const r = (row ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') return null
  return {
    id: r.id,
    teacherId: typeof r.teacher_id === 'string' ? r.teacher_id : '',
    teacherName:
      typeof r.teacher_name === 'string' ? r.teacher_name : null,
    subject: asText(r.subject),
    status: asTicketStatus(r.status),
    messageCount: asCount(r.message_count),
    lastMessageAt:
      typeof r.last_message_at === 'string' ? r.last_message_at : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
  }
}

export function parseAdminTickets(data: unknown): AdminTicketRow[] {
  if (!Array.isArray(data)) return []
  const out: AdminTicketRow[] = []
  for (const row of data) {
    const parsed = parseAdminTicketRow(row)
    if (parsed) out.push(parsed)
  }
  return out
}

/** قائمة إعلانات المنصة للأدمن — null عند غياب الدالة (0065 غير مطبّقة) */
export async function fetchAnnouncementsAdmin(): Promise<
  PlatformAnnouncement[] | null
> {
  const { data, error } = await db().rpc('platform_announcements_list')
  if (error) {
    if (isMissingRpcFunction(error) || isMissingRelation(error)) return null
    throw error
  }
  return parseAnnouncements(data)
}

/** نشر إعلان جديد — يرجع id الإعلان المنشأ */
export async function publishAnnouncement(input: {
  title: string
  body: string
  kind: AnnouncementKind
  scheduledAt: string | null
}): Promise<string> {
  const { data, error } = await db().rpc('platform_announcement_publish', {
    p_title: input.title,
    p_body: input.body,
    p_kind: input.kind,
    p_scheduled_at: input.scheduledAt,
  })
  if (error) throw error
  if (typeof data !== 'string' || data === '') {
    throw new Error('announcement publish returned no id')
  }
  return data
}

/** حذف إعلان منشور */
export async function deleteAnnouncement(id: string): Promise<void> {
  const { error } = await db().rpc('platform_announcement_delete', {
    p_id: id,
  })
  if (error) throw error
}

/** قائمة تذاكر الدعم للأدمن — بمرشّح حالة اختياري */
export async function fetchAdminTickets(
  status: TicketStatus | null,
): Promise<AdminTicketRow[] | null> {
  const { data, error } = await db().rpc('platform_support_tickets', {
    p_status: status,
  })
  if (error) {
    if (isMissingRpcFunction(error) || isMissingRelation(error)) return null
    throw error
  }
  return parseAdminTickets(data)
}

/** تغيير حالة تذكرة (إغلاق/إعادة فتح) — موثّق في سجل التدقيق خادمياً */
export async function setTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<void> {
  const { error } = await db().rpc('set_ticket_status', {
    p_ticket_id: ticketId,
    p_status: status,
  })
  if (error) throw error
}
