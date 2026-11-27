import { describe, expect, it } from 'vitest'
import {
  parseAnnouncements,
  parseSupportTicket,
  parseSupportTickets,
  parseTicketThread,
  statusAfterReply,
} from './api'

/**
 * اختبارات الدعم الفني + إعلانات المنصة (مهمة 17/23 — 0065): عقد
 * المحلّلات النقية + آلة حالات الرد — بلا أي نداء شبكة.
 */

describe('statusAfterReply — آلة حالات التذكرة', () => {
  it('رد الأدمن ينقل التذكرة إلى بانتظار رد المدرس', () => {
    expect(statusAfterReply('admin', 'new')).toBe('waiting_teacher')
    expect(statusAfterReply('admin', 'in_progress')).toBe('waiting_teacher')
  })

  it('رد المدرس ينقل التذكرة إلى قيد المعالجة', () => {
    expect(statusAfterReply('teacher', 'new')).toBe('in_progress')
    expect(statusAfterReply('teacher', 'waiting_teacher')).toBe('in_progress')
  })

  it('المغلقة لا تقبل أي رد', () => {
    expect(statusAfterReply('admin', 'closed')).toBeNull()
    expect(statusAfterReply('teacher', 'closed')).toBeNull()
  })
})

describe('parseAnnouncements — صفوف آمنة وتخطي المشوّه', () => {
  it('يحوّل الصفوف الصالحة ويسقط ما بلا id', () => {
    const rows = parseAnnouncements([
      {
        id: 'a1',
        title: 'تحديث',
        body: 'نص',
        kind: 'update',
        scheduled_at: null,
        published_at: '2026-11-27T00:00:00Z',
        created_at: '2026-11-27T00:00:00Z',
      },
      { title: 'بلا id' },
      {
        id: 'a2',
        title: 'صيانة',
        body: 'نص ٢',
        kind: 'bogus-kind',
        scheduled_at: '2026-11-28T00:00:00Z',
        published_at: '2026-11-27T00:00:00Z',
        created_at: '2026-11-27T00:00:00Z',
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].kind).toBe('update')
    // نوع غير معروف يسقط إلى general لا يكسر الصفحة
    expect(rows[1].kind).toBe('general')
    expect(rows[1].scheduledAt).toBe('2026-11-28T00:00:00Z')
  })

  it('غير المصفوفة ترجع قائمة فارغة', () => {
    expect(parseAnnouncements(null)).toEqual([])
    expect(parseAnnouncements({})).toEqual([])
  })
})

describe('parseSupportTicket(s) — حالة غير معروفة تسقط إلى جديدة', () => {
  it('يحوّل صف التذكرة مع العدّادات', () => {
    const row = parseSupportTicket({
      id: 't1',
      subject: 'مشكلة',
      status: 'waiting_teacher',
      message_count: 3,
      last_message_at: '2026-11-27T01:00:00Z',
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-27T01:00:00Z',
    })
    expect(row?.status).toBe('waiting_teacher')
    expect(row?.messageCount).toBe(3)
    expect(parseSupportTickets([row, { subject: 'بلا id' }])).toHaveLength(1)
  })

  it('حالة غير معروفة تسقط إلى new', () => {
    expect(parseSupportTicket({ id: 't2', status: 'weird' })?.status).toBe(
      'new',
    )
  })
})

describe('parseTicketThread — رسائل آمنة ودور الأدمن محفوظ', () => {
  it('يحوّل الخيط برسائله ويسقط الرسائل المشوّهة', () => {
    const thread = parseTicketThread({
      id: 't1',
      teacher_id: 'teacher-1',
      subject: 'مشكلة',
      status: 'in_progress',
      created_at: '2026-11-26T00:00:00Z',
      updated_at: '2026-11-27T00:00:00Z',
      messages: [
        {
          id: 'm1',
          author_kind: 'teacher',
          body: 'أول رسالة',
          created_at: '2026-11-26T00:00:00Z',
        },
        {
          id: 'm2',
          author_kind: 'admin',
          body: 'رد الإدارة',
          created_at: '2026-11-27T00:00:00Z',
        },
        { body: 'بلا id' },
      ],
    })
    expect(thread?.messages).toHaveLength(2)
    expect(thread?.messages[1].authorKind).toBe('admin')
    expect(thread?.status).toBe('in_progress')
  })

  it('خيط بلا id يرجع null', () => {
    expect(parseTicketThread({ subject: 'x' })).toBeNull()
    expect(parseTicketThread(null)).toBeNull()
  })
})
