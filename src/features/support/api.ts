import { db } from '../../lib/supabase'
import { t } from '../../i18n'
import { isMissingRpcFunction } from '../auth/api'

// ---------------------------------------------------------------------------
// الدعم الفني + إعلانات المنصة — سطح المدرس (مهمة 17/23 — 0065، الخطوة 8)
// • الإعلانات: قراءة عبر platform_announcements_for_me وحده — الجدول
//   لا يُقرأ مباشرة من جلسة مدرس إطلاقاً.
// • التذاكر: إنشاء/قراءة/رد عبر RPCs؛ الدور (مدرس/أدمن) يُشتق خادمياً
//   من الجلسة لا من المدخل، وآلة الحالات تعيش في reply_support_ticket.
// • قاعدة التسامح (دروس الخطوات 1–7): أي دالة غائبة قبل تطبيق 0065
//   عند بوابة التجميد ترجع null هنا فتعرض الصفحات «قريباً» مصممة —
//   لا خطأ خام أبداً (قاعدة مالك 2026-11-26).
// ---------------------------------------------------------------------------

export type AnnouncementKind = 'update' | 'maintenance' | 'general'

export interface PlatformAnnouncement {
  id: string
  title: string
  body: string
  kind: AnnouncementKind
  scheduledAt: string | null
  publishedAt: string
  createdAt: string
}

export type TicketStatus = 'new' | 'in_progress' | 'waiting_teacher' | 'closed'

export interface TicketMessage {
  id: string
  authorKind: 'teacher' | 'admin'
  body: string
  createdAt: string
}

export interface SupportTicket {
  id: string
  subject: string
  status: TicketStatus
  messageCount: number
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SupportTicketThread {
  id: string
  teacherId: string
  subject: string
  status: TicketStatus
  createdAt: string
  updatedAt: string
  messages: TicketMessage[]
}

/**
 * الحالة بعد ردّ على تذكرة — دالة نقية قابلة للاختبار (مرآة آلة
 * الحالات الخادمية في reply_support_ticket): رد الأدمن →
 * waiting_teacher، رد المدرس → in_progress؛ المغلقة لا تقبل رداً.
 */
export function statusAfterReply(
  authorKind: 'teacher' | 'admin',
  currentStatus: TicketStatus,
): TicketStatus | null {
  if (currentStatus === 'closed') return null
  return authorKind === 'admin' ? 'waiting_teacher' : 'in_progress'
}

/** اسم عرض نوع الإعلان — مفاتيح i18n حرفية في كل فرع */
export function announcementKindLabel(kind: string): string {
  switch (kind) {
    case 'update':
      return t('support.announcementKindUpdate')
    case 'maintenance':
      return t('support.announcementKindMaintenance')
    default:
      return t('support.announcementKindGeneral')
  }
}

/** اسم عرض حالة التذكرة — مفاتيح i18n حرفية في كل فرع */
export function ticketStatusLabel(status: string): string {
  switch (status) {
    case 'new':
      return t('support.ticketStatusNew')
    case 'in_progress':
      return t('support.ticketStatusInProgress')
    case 'waiting_teacher':
      return t('support.ticketStatusWaitingTeacher')
    case 'closed':
      return t('support.ticketStatusClosed')
    default:
      return t('support.ticketStatusNew')
  }
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0
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

export function parseSupportTicket(row: unknown): SupportTicket | null {
  const r = (row ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') return null
  return {
    id: r.id,
    subject: asText(r.subject),
    status: asTicketStatus(r.status),
    messageCount: asCount(r.message_count),
    lastMessageAt:
      typeof r.last_message_at === 'string' ? r.last_message_at : null,
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
  }
}

export function parseSupportTickets(data: unknown): SupportTicket[] {
  if (!Array.isArray(data)) return []
  const out: SupportTicket[] = []
  for (const row of data) {
    const parsed = parseSupportTicket(row)
    if (parsed) out.push(parsed)
  }
  return out
}

export function parseTicketThread(data: unknown): SupportTicketThread | null {
  const r = (data ?? {}) as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id === '') return null
  const rawMessages = Array.isArray(r.messages) ? r.messages : []
  const messages: TicketMessage[] = []
  for (const m of rawMessages) {
    const row = (m ?? {}) as Record<string, unknown>
    if (typeof row.id !== 'string' || row.id === '') continue
    messages.push({
      id: row.id,
      authorKind: row.author_kind === 'admin' ? 'admin' : 'teacher',
      body: asText(row.body),
      createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    })
  }
  return {
    id: r.id,
    teacherId: typeof r.teacher_id === 'string' ? r.teacher_id : '',
    subject: asText(r.subject),
    status: asTicketStatus(r.status),
    createdAt: typeof r.created_at === 'string' ? r.created_at : '',
    updatedAt: typeof r.updated_at === 'string' ? r.updated_at : '',
    messages,
  }
}

/** إعلانات المنصة المنشورة لحساب المدرس — null عند غياب الدالة */
export async function fetchMyAnnouncements(): Promise<
  PlatformAnnouncement[] | null
> {
  const { data, error } = await db().rpc('platform_announcements_for_me')
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseAnnouncements(data)
}

/** فتح تذكرة دعم جديدة — يرجع id التذكرة وحالتها */
export async function submitSupportTicket(
  teacherId: string,
  subject: string,
  body: string,
): Promise<{ id: string; status: TicketStatus }> {
  const { data, error } = await db().rpc('submit_support_ticket', {
    p_teacher_id: teacherId,
    p_subject: subject,
    p_body: body,
  })
  if (error) throw error
  const row = data as { id?: unknown; status?: unknown } | null
  return {
    id: typeof row?.id === 'string' ? row.id : '',
    status: asTicketStatus(row?.status),
  }
}

/** قائمة تذاكر الحساب — الأحدث أولاً */
export async function fetchMyTickets(
  teacherId: string,
): Promise<SupportTicket[] | null> {
  const { data, error } = await db().rpc('my_support_tickets', {
    p_teacher_id: teacherId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseSupportTickets(data)
}

/** خيط تذكرة واحدة برسائلها */
export async function fetchTicketThread(
  ticketId: string,
): Promise<SupportTicketThread | null> {
  const { data, error } = await db().rpc('support_ticket_thread', {
    p_ticket_id: ticketId,
  })
  if (error) {
    if (isMissingRpcFunction(error)) return null
    throw error
  }
  return parseTicketThread(data)
}

/**
 * الرد على تذكرة — الدور والحالة الجديدة يُشتقان خادمياً من الجلسة؛
 * الرد على مغلقة يرفضه الخادم بخطأ صريح.
 */
export async function replyToTicket(
  ticketId: string,
  body: string,
): Promise<{ status: TicketStatus; authorKind: 'teacher' | 'admin' }> {
  const { data, error } = await db().rpc('reply_support_ticket', {
    p_ticket_id: ticketId,
    p_body: body,
  })
  if (error) throw error
  const row = data as {
    status?: unknown
    author_kind?: unknown
  } | null
  return {
    status: asTicketStatus(row?.status),
    authorKind: row?.author_kind === 'admin' ? 'admin' : 'teacher',
  }
}
