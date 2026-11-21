import { describe, expect, it } from 'vitest'
import { groupItemsBySession, queueKey, type QueuedAttendanceItem } from './offlineQueue'

function item(sessionId: string, studentId: string): QueuedAttendanceItem {
  return {
    key: queueKey('t1', sessionId, studentId),
    teacherId: 't1',
    sessionId,
    studentId,
    value: { status: 'p', homework_done: false, starred: false },
    queuedAt: 1,
    attempts: 0,
    lastError: null,
    failed: false,
  }
}

describe('groupItemsBySession (وحدة المزامنة المجمّعة — 3A-296)', () => {
  it('قائمة فارغة → لا مجموعات', () => {
    expect(groupItemsBySession([])).toEqual([])
  })

  it('يجمع عناصر نفس الحصة معاً ويحفظ ترتيب الظهور الأول', () => {
    const items = [item('s2', 'a'), item('s1', 'a'), item('s2', 'b'), item('s1', 'b'), item('s2', 'c')]
    const groups = groupItemsBySession(items)
    expect(groups.map((g) => g.sessionId)).toEqual(['s2', 's1'])
    expect(groups[0].items.map((i) => i.studentId)).toEqual(['a', 'b', 'c'])
    expect(groups[1].items.map((i) => i.studentId)).toEqual(['a', 'b'])
  })

  it('حصة واحدة → مجموعة واحدة بكل العناصر', () => {
    const groups = groupItemsBySession([item('s1', 'a'), item('s1', 'b')])
    expect(groups).toHaveLength(1)
    expect(groups[0].items).toHaveLength(2)
  })
})
