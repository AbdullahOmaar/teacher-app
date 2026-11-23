import { describe, expect, it } from 'vitest'
import { clearUserLocalData, type StorageLike } from './logoutCleanup'

class MemoryStorage implements StorageLike {
  private map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  get length(): number {
    return this.map.size
  }
  has(key: string): boolean {
    return this.map.has(key)
  }
}

const T1 = 'teacher-1'
const T2 = 'teacher-2'

function seeded(): MemoryStorage {
  const s = new MemoryStorage()
  s.setItem('teacher-app-active-teacher', T1)
  s.setItem('teacher-app-show-mascot', '0')
  s.setItem('teacher-app-theme', 'dark')
  s.setItem(`start-here-dismissed:${T1}`, '1')
  s.setItem(`doffy-welcome:${T1}`, '2026-11-21')
  s.setItem(`teacher-app-star-cheer:${T1}:g1`, '["s1"]')
  s.setItem(`teacher-app-star-cheer:${T1}:g2`, '["s2"]')
  s.setItem(`start-here-dismissed:${T2}`, '1')
  s.setItem(`teacher-app-star-cheer:${T2}:g1`, '["s9"]')
  return s
}

describe('clearUserLocalData (SEC-L5)', () => {
  it('يحذف مفاتيح الجلسة ومرآة الماسكوت دائماً، ويبقي تفضيل الثيم', () => {
    const s = seeded()
    clearUserLocalData(s)
    expect(s.has('teacher-app-active-teacher')).toBe(false)
    expect(s.has('teacher-app-show-mascot')).toBe(false)
    expect(s.getItem('teacher-app-theme')).toBe('dark')
  })

  it('يحذف حالة الواجهة الخاصة بالمدرس النشط فقط ويبقي مفاتيح مدرس آخر', () => {
    const s = seeded()
    clearUserLocalData(s)
    expect(s.has(`start-here-dismissed:${T1}`)).toBe(false)
    expect(s.has(`doffy-welcome:${T1}`)).toBe(false)
    expect(s.has(`teacher-app-star-cheer:${T1}:g1`)).toBe(false)
    expect(s.has(`teacher-app-star-cheer:${T1}:g2`)).toBe(false)
    expect(s.has(`start-here-dismissed:${T2}`)).toBe(true)
    expect(s.has(`teacher-app-star-cheer:${T2}:g1`)).toBe(true)
  })

  it('طابور فارغ: يُحذف مفتاحه؛ طابور غير فارغ: يبقى حرفياً (بيانات مستخدم)', () => {
    const empty = seeded()
    empty.setItem('teacher-app-attendance-queue-v1', '[]')
    clearUserLocalData(empty)
    expect(empty.has('teacher-app-attendance-queue-v1')).toBe(false)

    const pending = seeded()
    const raw = '[{"key":"a:b:c"}]'
    pending.setItem('teacher-app-attendance-queue-v1', raw)
    clearUserLocalData(pending)
    expect(pending.getItem('teacher-app-attendance-queue-v1')).toBe(raw)
  })

  it('قيمة طابور فاسدة تُترك كما هي (لا حذف لبيانات لا نفهمها)', () => {
    const s = seeded()
    s.setItem('teacher-app-attendance-queue-v1', '{oops')
    clearUserLocalData(s)
    expect(s.getItem('teacher-app-attendance-queue-v1')).toBe('{oops')
  })

  it('بلا مدرس نشط: تُحذف مفاتيح الجلسة وتبقى المفاتيح المنسوبة لمدرسين', () => {
    const s = new MemoryStorage()
    s.setItem('teacher-app-show-mascot', '1')
    s.setItem(`teacher-app-star-cheer:${T2}:g1`, '["s9"]')
    clearUserLocalData(s)
    expect(s.has('teacher-app-show-mascot')).toBe(false)
    expect(s.has(`teacher-app-star-cheer:${T2}:g1`)).toBe(true)
  })
})
