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
  soft_deleted: true,
  deleted_at: '2026-11-28T00:00:00.000Z',
  purge_after: '2026-12-28T00:00:00.000Z',
  centres_marked: 1,
}

const fakeDeps = (over: Partial<DeleteAccountDeps> = {}): DeleteAccountDeps & {
  calls: string[]
  rpcConfirmations: string[]
} => {
  const calls: string[] = []
  const rpcConfirmations: string[] = []
  const deps: DeleteAccountDeps & { calls: string[]; rpcConfirmations: string[] } = {
    calls,
    rpcConfirmations,
    getUserEmail: async () => {
      calls.push('email')
      return 'owner@example.com'
    },
    reauthenticate: async () => {
      calls.push('reauth')
    },
    callDeleteRpc: async (confirmation: string) => {
      calls.push('rpc')
      rpcConfirmations.push(confirmation)
      return validReport
    },
    signOutLocal: async () => {
      calls.push('signout')
    },
    ...over,
  }
  return deps
}

describe('parseDeleteReport — شكل تقرير الحذف الناعم من RPC (0075)', () => {
  it('تقرير صالح يُقبل كما هو', () => {
    expect(parseDeleteReport(validReport)).toEqual(validReport)
  })

  it('حقول ناقصة أو أنواع خاطئة تُرفض', () => {
    expect(parseDeleteReport(null)).toBeNull()
    expect(parseDeleteReport([])).toBeNull()
    expect(parseDeleteReport({ ...validReport, teacher_id: '' })).toBeNull()
    expect(parseDeleteReport({ ...validReport, soft_deleted: false })).toBeNull()
    expect(parseDeleteReport({ ...validReport, deleted_at: 42 })).toBeNull()
    expect(parseDeleteReport({ ...validReport, purge_after: null })).toBeNull()
    expect(parseDeleteReport({ ...validReport, centres_marked: '1' })).toBeNull()
  })

  it('شكل التقرير القديم (حذف نهائي 0046) يُرفض — لا توافق صامت', () => {
    expect(
      parseDeleteReport({
        teacher_id: 't-1',
        deleted_tables: { students: 3 },
        storage_objects_orphaned: 2,
      }),
    ).toBeNull()
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

  it('عدم تطابق التأكيد برسالة عربية واضحة (F1)', () => {
    expect(deleteAccountErrorMessage(new Error('confirmation mismatch'))).toBe(
      t('settings.deleteAccountMismatch'),
    )
  })

  it('حذف مكرر برسالة عربية واضحة', () => {
    expect(deleteAccountErrorMessage(new Error('account already deleted'))).toBe(
      t('settings.deleteAccountAlreadyDeleted'),
    )
  })

  it('F6: خطأ PostgREST خام (يكشف اسم دالة) لا يصل للمستخدم أبداً', () => {
    const raw = new Error(
      'Could not find the function public.delete_my_teacher_account(p_confirmation) in the schema cache',
    )
    expect(deleteAccountErrorMessage(raw)).toBe(t('settings.deleteAccountFailed'))
    expect(deleteAccountErrorMessage(raw)).not.toContain('delete_my_teacher_account')
  })
})

describe('deleteMyAccount — ترتيب الخطوات وحارس التأكيد', () => {
  it('نجاح: بريد ← إعادة مصادقة ← RPC (بالبريد تأكيداً) ← خروج محلي', async () => {
    const deps = fakeDeps()
    const report = await deleteMyAccount('correct-horse', 'owner@example.com', deps)
    expect(report).toEqual(validReport)
    expect(deps.calls).toEqual(['email', 'reauth', 'rpc', 'signout'])
    expect(deps.rpcConfirmations).toEqual(['owner@example.com'])
  })

  it('التأكيد يُطابَق بلا حساسية لحالة الأحرف والمسافات', async () => {
    const deps = fakeDeps()
    await deleteMyAccount('correct-horse', '  Owner@Example.COM ', deps)
    expect(deps.calls).toContain('rpc')
  })

  it('تأكيد غير مطابق: يتوقف قبل إعادة المصادقة والـ RPC (F1)', async () => {
    const deps = fakeDeps()
    await expect(deleteMyAccount('correct-horse', 'someone-else@example.com', deps)).rejects.toThrow(
      t('settings.deleteAccountMismatch'),
    )
    expect(deps.calls).not.toContain('reauth')
    expect(deps.calls).not.toContain('rpc')
    expect(deps.calls).not.toContain('signout')
  })

  it('كلمة سر خاطئة: يتوقف قبل RPC ولا يخرج', async () => {
    const deps = fakeDeps({
      reauthenticate: async () => {
        throw new Error('Invalid login credentials')
      },
    })
    await expect(deleteMyAccount('wrong', 'owner@example.com', deps)).rejects.toThrow()
    expect(deps.calls).not.toContain('rpc')
    expect(deps.calls).not.toContain('signout')
  })

  it('تقرير مشوّه من الخادم: خطأ صريح ولا خروج', async () => {
    const deps = fakeDeps({ callDeleteRpc: async () => ({ nonsense: true }) })
    await expect(deleteMyAccount('correct-horse', 'owner@example.com', deps)).rejects.toThrow(
      t('settings.deleteAccountBadReport'),
    )
    expect(deps.calls).not.toContain('signout')
  })

  it('بلا جلسة: خطأ مصادقة قبل أي خطوة', async () => {
    const deps = fakeDeps({ getUserEmail: async () => null })
    await expect(deleteMyAccount('x', 'owner@example.com', deps)).rejects.toThrow(
      t('settings.deleteAccountNotAuthenticated'),
    )
    expect(deps.calls).not.toContain('rpc')
  })
})
