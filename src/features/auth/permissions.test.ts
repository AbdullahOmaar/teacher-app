import { describe, expect, it } from 'vitest'
import { canReadOperational, resolveActivePermissions } from './api'
import type { TeacherMemberRow } from '../../types/database'

/**
 * صلاحيات الجلسة النشطة (0079 — عيب صلاحيات المساعد، رد سند 93):
 * حلّ نقي واحد يقرأ عضوية السنتر النشط — المالك يملك الكل ضمناً،
 * والمساعد يملك مفاتيح عضويته فقط (الغائب = false). والقراءة
 * التشغيلية (مرآة member_has_operational_permission) تمنحها أي
 * صلاحية تشغيلية واحدة؛ صلاحية المال وحدها لا تمنح قراءة تشغيلية.
 */

function member(permissions: Record<string, unknown>): TeacherMemberRow {
  return {
    id: 'member-1',
    teacher_id: 'teacher-1',
    user_id: 'user-1',
    invited_email: null,
    role: 'assistant',
    permissions,
    status: 'active',
    created_at: '2026-11-28T00:00:00.000Z',
    updated_at: '2026-11-28T00:00:00.000Z',
  }
}

describe('resolveActivePermissions', () => {
  it('owner has every permission, even with an all-false member row', () => {
    expect(
      resolveActivePermissions(
        'owner',
        member({
          can_take_attendance: false,
          can_manage_students: false,
          can_manage_groups: false,
          can_manage_grades: false,
          can_view_money: false,
        }),
      ),
    ).toEqual({
      can_take_attendance: true,
      can_manage_students: true,
      can_manage_groups: true,
      can_manage_grades: true,
      can_view_money: true,
    })
  })

  it('owner has every permission with no member row at all', () => {
    expect(resolveActivePermissions('owner', undefined)).toEqual({
      can_take_attendance: true,
      can_manage_students: true,
      can_manage_groups: true,
      can_manage_grades: true,
      can_view_money: true,
    })
  })

  it('assistant keeps exactly the stored flags (Sanad case: attendance only)', () => {
    expect(
      resolveActivePermissions(
        'assistant',
        member({
          can_view_money: false,
          can_manage_grades: false,
          can_manage_groups: false,
          can_manage_students: false,
          can_take_attendance: true,
        }),
      ),
    ).toEqual({
      can_take_attendance: true,
      can_manage_students: false,
      can_manage_groups: false,
      can_manage_grades: false,
      can_view_money: false,
    })
  })

  it('assistant with no member row has nothing', () => {
    expect(resolveActivePermissions('assistant', null)).toEqual({
      can_take_attendance: false,
      can_manage_students: false,
      can_manage_groups: false,
      can_manage_grades: false,
      can_view_money: false,
    })
  })

  it('missing keys default to false (safe default)', () => {
    expect(
      resolveActivePermissions('assistant', member({ can_take_attendance: true })),
    ).toEqual({
      can_take_attendance: true,
      can_manage_students: false,
      can_manage_groups: false,
      can_manage_grades: false,
      can_view_money: false,
    })
  })

  it('non-boolean values never grant a permission', () => {
    expect(
      resolveActivePermissions(
        'assistant',
        member({ can_manage_students: 'true', can_take_attendance: 1 }),
      ),
    ).toEqual({
      can_take_attendance: false,
      can_manage_students: false,
      can_manage_groups: false,
      can_manage_grades: false,
      can_view_money: false,
    })
  })
})

describe('canReadOperational', () => {
  it('attendance-only assistant CAN read operational tables (0079)', () => {
    expect(
      canReadOperational({
        can_take_attendance: true,
        can_manage_students: false,
        can_manage_groups: false,
        can_manage_grades: false,
        can_view_money: false,
      }),
    ).toBe(true)
  })

  it('any single operational flag grants read', () => {
    for (const key of [
      'can_manage_students',
      'can_manage_groups',
      'can_manage_grades',
    ] as const) {
      expect(
        canReadOperational({
          can_take_attendance: false,
          can_manage_students: false,
          can_manage_groups: false,
          can_manage_grades: false,
          can_view_money: false,
          [key]: true,
        }),
      ).toBe(true)
    }
  })

  it('assistant with no operational flag reads nothing', () => {
    expect(
      canReadOperational({
        can_take_attendance: false,
        can_manage_students: false,
        can_manage_groups: false,
        can_manage_grades: false,
        can_view_money: false,
      }),
    ).toBe(false)
  })

  it('money-only permission grants no operational read', () => {
    expect(
      canReadOperational({
        can_take_attendance: false,
        can_manage_students: false,
        can_manage_groups: false,
        can_manage_grades: false,
        can_view_money: true,
      }),
    ).toBe(false)
  })
})
