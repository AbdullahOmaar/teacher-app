import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../../i18n'
import { ToastProvider } from '../../../components/ui/Toast'
import type { TeacherMemberRow } from '../../../types/database'
import { TeamSection } from './TeamSection'

/**
 * PAT-2 (3A-377): تغذية راجعة لإلغاء الدعوة وإزالة العضو — كانتا
 * صامتتين عند الفشل (onSuccess فقط). الاختبار يثبّت أن onError
 * المعطاة لـ mutate تعرض توست خطأ (متغير 'error') بالنص الصحيح،
 * وأن onSuccess ما زالت تُغلق وضع التأكيد.
 */

function memberStub(overrides: Partial<TeacherMemberRow>): TeacherMemberRow {
  return {
    id: 'm-1',
    teacher_id: 't-1',
    user_id: '11111111-2222-3333-4444-555555555555',
    member_user_id: '11111111-2222-3333-4444-555555555555',
    invited_email: 'assistant@example.com',
    status: 'active',
    permissions: {},
    created_at: '2026-11-22T00:00:00Z',
    ...overrides,
  } as unknown as TeacherMemberRow
}

function renderTeam(overrides: Record<string, unknown> = {}) {
  const cancelMutate = vi.fn()
  const removeMutate = vi.fn()
  const suspendMutate = vi.fn()
  const reactivateMutate = vi.fn()
  const setConfirmCancelId = vi.fn()
  const setConfirmRemoveId = vi.fn()
  const setConfirmSuspendId = vi.fn()
  const stubMutation = (mutate: ReturnType<typeof vi.fn>) =>
    ({ mutate, isPending: false }) as unknown as never
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TeamSection
        teamMembers={[memberStub({})]}
        pendingInvites={[memberStub({ id: 'inv-1', status: 'invited' })]}
        membersQ={{ isPending: false, isError: false } as never}
        inviteMsg={null}
        emailInviteMsg={null}
        assistantId=""
        setAssistantId={vi.fn()}
        inviteEmail=""
        setInviteEmail={vi.fn()}
        perms={{}}
        setPerms={vi.fn()}
        emailPerms={{}}
        setEmailPerms={vi.fn()}
        confirmRemoveId={null}
        setConfirmRemoveId={setConfirmRemoveId}
        confirmCancelId={null}
        setConfirmCancelId={setConfirmCancelId}
        confirmSuspendId={null}
        setConfirmSuspendId={setConfirmSuspendId}
        teamLimit={null}
        suspendMember={stubMutation(suspendMutate)}
        reactivateMember={stubMutation(reactivateMutate)}
        handleInvite={vi.fn()}
        handleEmailInvite={vi.fn()}
        invite={stubMutation(vi.fn())}
        inviteByEmail={stubMutation(vi.fn())}
        cancelInvite={stubMutation(cancelMutate)}
        removeMember={stubMutation(removeMutate)}
        updatePerms={stubMutation(vi.fn())}
        toggleMemberPerm={vi.fn()}
        {...(overrides as Record<string, never>)}
        />
      </ToastProvider>
    </QueryClientProvider>,
  )
  return { cancelMutate, removeMutate, suspendMutate, reactivateMutate, setConfirmCancelId, setConfirmRemoveId, setConfirmSuspendId }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('TeamSection — تغذية راجعة للطفرات (PAT-2)', () => {
  it('فشل إلغاء الدعوة يعرض توست خطأ بالنص الصحيح', () => {
    const { cancelMutate } = renderTeam({ confirmCancelId: 'inv-1' })
    fireEvent.click(screen.getByText(t('settings.confirmCancelInvite')))
    expect(cancelMutate).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    const onError = cancelMutate.mock.calls[0][1].onError as () => void
    act(() => {
      onError()
    })
    const toastText = screen.getByText(t('settings.cancelInviteFailedToast'))
    expect(toastText).toBeInTheDocument()
    expect(toastText.closest('div')).toHaveClass('bg-bad')
  })

  it('نجاح إلغاء الدعوة يغلق وضع التأكيد', () => {
    const { cancelMutate, setConfirmCancelId } = renderTeam({ confirmCancelId: 'inv-1' })
    fireEvent.click(screen.getByText(t('settings.confirmCancelInvite')))
    const onSuccess = cancelMutate.mock.calls[0][1].onSuccess as () => void
    act(() => {
      onSuccess()
    })
    expect(setConfirmCancelId).toHaveBeenCalledWith(null)
  })

  it('فشل إزالة العضو يعرض توست خطأ بالنص الصحيح', () => {
    const { removeMutate } = renderTeam({ confirmRemoveId: 'm-1' })
    fireEvent.click(screen.getByText(t('settings.confirmRemoveMember')))
    expect(removeMutate).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
    const onError = removeMutate.mock.calls[0][1].onError as () => void
    act(() => {
      onError()
    })
    const toastText = screen.getByText(t('settings.removeMemberFailedToast'))
    expect(toastText).toBeInTheDocument()
    expect(toastText.closest('div')).toHaveClass('bg-bad')
  })

  it('نجاح إزالة العضو يغلق وضع التأكيد', () => {
    const { removeMutate, setConfirmRemoveId } = renderTeam({ confirmRemoveId: 'm-1' })
    fireEvent.click(screen.getByText(t('settings.confirmRemoveMember')))
    const onSuccess = removeMutate.mock.calls[0][1].onSuccess as () => void
    act(() => {
      onSuccess()
    })
    expect(setConfirmRemoveId).toHaveBeenCalledWith(null)
  })
})

describe('TeamSection — حدّ الفريق والإيقاف/التفعيل (T21)', () => {
  it('سطر الحدّ يظهر المستخدم/الحد عندما يكون معروفاً', () => {
    renderTeam({ teamLimit: { used: 2, limit: 3, atLimit: false } })
    expect(
      screen.getByText(t('settings.teamLimitLine', { used: 2, limit: 3 })),
    ).toBeInTheDocument()
  })

  it('عند بلوغ الحدّ يظهر التحذير وتُعطَّل زرارا الدعوة', () => {
    renderTeam({ teamLimit: { used: 3, limit: 3, atLimit: true } })
    expect(
      screen.getByText(t('settings.teamLimitReached', { limit: 3 })),
    ).toBeInTheDocument()
    expect(screen.getByText(t('settings.sendInvite')).closest('button')).toBeDisabled()
    expect(screen.getByText(t('settings.addAssistant')).closest('button')).toBeDisabled()
  })

  it('بلا حدّ معروف (null) لا يظهر سطر الحدّ ولا تحذير', () => {
    renderTeam({ teamLimit: null })
    expect(screen.queryByText(/أعضاء الفريق: /)).not.toBeInTheDocument()
  })

  it('الضغط على «إيقاف العضو» يفتح وضع التأكيد بمعرّف العضو', () => {
    const { setConfirmSuspendId } = renderTeam()
    fireEvent.click(screen.getByText(t('settings.suspendMember')))
    expect(setConfirmSuspendId).toHaveBeenCalledWith('m-1')
  })

  it('تأكيد الإيقاف يستدعي الطفرة بمعرّف العضو', () => {
    const { suspendMutate } = renderTeam({ confirmSuspendId: 'm-1' })
    fireEvent.click(screen.getByText(t('settings.confirmSuspendMember')))
    expect(suspendMutate).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('فشل الإيقاف يعرض توست خطأ بالنص الصحيح', () => {
    const { suspendMutate } = renderTeam({ confirmSuspendId: 'm-1' })
    fireEvent.click(screen.getByText(t('settings.confirmSuspendMember')))
    const onError = suspendMutate.mock.calls[0][1].onError as () => void
    act(() => {
      onError()
    })
    const toastText = screen.getByText(t('settings.suspendMemberFailedToast'))
    expect(toastText).toBeInTheDocument()
    expect(toastText.closest('div')).toHaveClass('bg-bad')
  })

  it('العضو الموقوف يظهر زر إعادة تفعيل بدل زر الإيقاف', () => {
    const suspended = {
      id: 'm-1',
      teacher_id: 't-1',
      user_id: '11111111-2222-3333-4444-555555555555',
      member_user_id: '11111111-2222-3333-4444-555555555555',
      invited_email: 'assistant@example.com',
      status: 'suspended',
      permissions: {},
      created_at: '2026-11-22T00:00:00Z',
    } as unknown as TeacherMemberRow
    const { reactivateMutate } = renderTeam({ teamMembers: [suspended] })
    expect(screen.queryByText(t('settings.suspendMember'))).not.toBeInTheDocument()
    fireEvent.click(screen.getByText(t('settings.reactivateMember')))
    expect(reactivateMutate).toHaveBeenCalledWith(
      'm-1',
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })
})
