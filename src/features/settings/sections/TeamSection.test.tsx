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
  const setConfirmCancelId = vi.fn()
  const setConfirmRemoveId = vi.fn()
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
  return { cancelMutate, removeMutate, setConfirmCancelId, setConfirmRemoveId }
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
