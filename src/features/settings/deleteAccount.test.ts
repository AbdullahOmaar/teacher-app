import { describe, expect, it } from 'vitest'
import {
  deleteAccountErrorMessage,
  deleteMyAccount,
  parseDeleteReport,
  type DeleteAccountDeps,
} from './deleteAccount'
import { t } from '../../i18n'

const validReport = {
  teacher_id: 't-1',
  deleted_tables: { students: 3, groups: 1 },
  storage_objects_orphaned: 2,
}

const fakeDeps = (over: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps & {
  calls: string[]
} => {
  const calls: string[] = []
  const deps: DeleteAccountDeps & { calls: string[] } = {
    calls,
    getUserEmail: async () => {
      calls.push('email')
      return 'owner@example.com'
    },
    reauthenticate: async () => {
      calls.push('reauth')
    },
    callDeleteRpc: async () => {
      calls.push('rpc')
      return validReport
    },
    signOutLocal: async () => {
      calls.push('signout')
    },
    ...over,
  }
  return deps
}

describe('parseDeleteReport — شكل تقرير الحذف من RPC', () => {
  it('تقرير صالح يُقبل كما هو', () => {
    expect(parseDeleteReport(validReport)).toEqual(validReport)
  })

  it('حقول ناقصة أو أنواع خاطئة تُرفض', () => {
    expect(parseDeleteReport(null)).toBeNull()
    expect(parseDeleteReport([])).toBeNull()
    expect(parseDeleteReport({ ...validReport, teacher_id: '' })).toBeNull()
    expect(parseDeleteReport({ ...validReport, storage_objects_orphaned: '2' })).toBeNull()
    expect(parseDeleteReport({ ...validReport, deleted_tables: null })).toBeNull()
    expect(parseDeleteReport({
      ...validReport,
      deleted_tables: { students: 'three' },
    })).toBeNull()
  })
})

describe('deleteAccountErrorMessage — ترجمة أخطاء الخادم', () => {
  it('رفض الحساب التجريبي برسالة عربية واضحة', () => {
    expect(deleteAccountErrorMessage(new Error('demo account cannot be deleted'))).toBe(
      t('settings.deleteAccountDemoBlocked'),
    )
  })

  it('غياب ملف المدرس برسالة عربية واضحة', () => {
    expect(deleteAccountErrorMessage(new Error('no teacher profile'))).toBe(
      t('settings.deleteAccountNoProfile'),
    )
  })
})

describe('deleteMyAccount — ترتيب الخطوات', () => {
  it('نجاح: إعادة مصادقة ← RPC ← خروج محلي، ويرجع التقرير', async () => {
    const deps = fakeDeps()
    const report = await deleteMyAccount('correct-horse', deps)
    expect(report).toEqual(validReport)
    expect(deps.calls).toEqual(['email', 'reauth', 'rpc', 'signout'])
  })

  it('كلمة سر خاطئة: يتوقف قبل RPC ولا يخرج', async () => {
    const deps = fakeDeps({
      reauthenticate: async () => {
        throw new Error('Invalid login credentials')
      },
    })
    await expect(deleteMyAccount('wrong', deps)).rejects.toThrow()
    expect(deps.calls).not.toContain('rpc')
    expect(deps.calls).not.toContain('signout')
  })

  it('تقرير مشوّه من الخادم: خطأ صريح ولا خروج', async () => {
    const deps = fakeDeps({ callDeleteRpc: async () => ({ nonsense: true }) })
    await expect(deleteMyAccount('correct-horse', deps)).rejects.toThrow(
      t('settings.deleteAccountBadReport'),
    )
    expect(deps.calls).not.toContain('signout')
  })

  it('بلا جلسة: خطأ مصادقة قبل أي خطوة', async () => {
    const deps = fakeDeps({ getUserEmail: async () => null })
    await expect(deleteMyAccount('x', deps)).rejects.toThrow(
      t('settings.deleteAccountNotAuthenticated'),
    )
    expect(deps.calls).not.toContain('rpc')
  })
})
