import { describe, expect, it } from 'vitest'
import {
  parseAdminTickets,
  parseAnnouncement,
  parseAnnouncements,
} from './announcements'

/**
 * اختبارات سطح الأدمن للإعلانات والتذاكر (مهمة 17/23 — 0065): عقد
 * المحلّلات النقية — بلا أي نداء شبكة.
 */

describe('parseAnnouncement — صف إعلان آمن', () => {
  it('يحوّل الصف الصالح كاملاً', () => {
    const row = parseAnnouncement({
      id: 'a1',
      title: 'صيانة مجدولة',
      body: 'تفاصيل',
      kind: 'maintenance',
      scheduled_at: '2026-11-28T02:00:00Z',
      published_at: '2026-11-27T00:00:00Z',
      created_at: '2026-11-27T00:00:00Z',
    })
    expect(row?.kind).toBe('maintenance')
    expect(row?.scheduledAt).toBe('2026-11-28T02:00:00Z')
  })

  it('صف بلا id أو بنوع غير معروف يُسقط/يُعمَّم بأمان', () => {
    expect(parseAnnouncement({ title: 'x' })).toBeNull()
    expect(parseAnnouncement({ id: 'a2', kind: 'weird' })?.kind).toBe(
      'general',
    )
    expect(parseAnnouncements(null)).toEqual([])
  })
})

describe('parseAdminTickets — صفوف تذاكر الأدمن', () => {
  it('يحوّل الصفوف مع اسم المدرس والعدّادات', () => {
    const rows = parseAdminTickets([
      {
        id: 't1',
        teacher_id: 'teacher-1',
        teacher_name: 'أستاذ أحمد',
        subject: 'مشكلة',
        status: 'new',
        message_count: 1,
        last_message_at: '2026-11-27T01:00:00Z',
        created_at: '2026-11-26T00:00:00Z',
        updated_at: '2026-11-27T01:00:00Z',
      },
      { id: '', subject: 'فارغ' },
      {
        id: 't2',
        teacher_id: 'teacher-2',
        teacher_name: null,
        subject: 'سؤال',
        status: 'closed',
        message_count: 0,
        last_message_at: null,
        created_at: '2026-11-26T00:00:00Z',
        updated_at: '2026-11-26T00:00:00Z',
      },
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0].teacherName).toBe('أستاذ أحمد')
    expect(rows[1].teacherName).toBeNull()
    expect(rows[1].status).toBe('closed')
    expect(rows[1].messageCount).toBe(0)
  })

  it('حالة غير معروفة تسقط إلى new', () => {
    const rows = parseAdminTickets([{ id: 't3', status: 'weird' }])
    expect(rows[0].status).toBe('new')
  })
})
