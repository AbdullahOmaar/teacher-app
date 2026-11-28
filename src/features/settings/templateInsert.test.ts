import { describe, expect, it } from 'vitest'
import { insertTemplateKey } from './templateInsert'

describe('insertTemplateKey — إدراج مفتاح القالب عند المؤشر', () => {
  it('يدرج في موضع المؤشر ويضع المؤشر بعد المفتاح مباشرة', () => {
    const r = insertTemplateKey('أهلاً ، تم الدفع', '{name}', 6, 6)
    expect(r.value).toBe('أهلاً {name}، تم الدفع')
    expect(r.caret).toBe(6 + '{name}'.length)
  })

  it('يستبدل التحديد الحالي بالمفتاح', () => {
    const r = insertTemplateKey('المتبقي XXX جنيه', '{balance}', 8, 11)
    expect(r.value).toBe('المتبقي {balance} جنيه')
    expect(r.caret).toBe(8 + '{balance}'.length)
  })

  it('بلا تحديد (null) يلحق في آخر النص', () => {
    const r = insertTemplateKey('أهلاً ', '{guardian}', null, null)
    expect(r.value).toBe('أهلاً {guardian}')
    expect(r.caret).toBe(r.value.length)
  })

  it('تحديد فاسد (سالب أو معكوس) يسقط للإلحاق بدل الكسر', () => {
    expect(insertTemplateKey('نص', '{paid}', -1, 2).value).toBe('نص{paid}')
    expect(insertTemplateKey('نص', '{paid}', 2, 1).value).toBe('نص{paid}')
  })

  it('إدراج في أول النص وفي آخره', () => {
    expect(insertTemplateKey('تم', '{total}', 0, 0).value).toBe('{total}تم')
    expect(insertTemplateKey('تم', '{total}', 2, 2).value).toBe('تم{total}')
  })
})
