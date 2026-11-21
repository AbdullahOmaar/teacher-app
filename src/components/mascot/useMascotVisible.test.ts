import { afterEach, describe, expect, it } from 'vitest'
import { MASCOT_MIRROR_KEY, readMascotMirror } from './useMascotVisible'

// مرآة التخزين المحلي هي عقد سكربت إقلاع index.html (يقرأ المفتاح نفسه
// حرفياً قبل أول رسم) — هذه الاختبارات تثبّت قيمها الثلاث الممكنة.
describe('readMascotMirror — مرآة إظهار الماسكوت', () => {
  afterEach(() => {
    window.localStorage.removeItem(MASCOT_MIRROR_KEY)
  })

  it('غياب المفتاح = null (لا تفضيل محفوظ — الافتراضي يقرر)', () => {
    window.localStorage.removeItem(MASCOT_MIRROR_KEY)
    expect(readMascotMirror()).toBeNull()
  })

  it("القيمة '0' = المالك أوقف الماسكوت", () => {
    window.localStorage.setItem(MASCOT_MIRROR_KEY, '0')
    expect(readMascotMirror()).toBe(false)
  })

  it("القيمة '1' = الماسكوت ظاهر", () => {
    window.localStorage.setItem(MASCOT_MIRROR_KEY, '1')
    expect(readMascotMirror()).toBe(true)
  })

  it('قيمة غريبة = null لا كسر', () => {
    window.localStorage.setItem(MASCOT_MIRROR_KEY, 'yes')
    expect(readMascotMirror()).toBeNull()
  })
})
