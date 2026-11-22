import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { Handshake, KeyRound, Mail, Send, UserPlus } from 'lucide-react'
import { Button } from '../../../components/ui/Button'
import { Field, TextInput } from '../../../components/ui/form'
import { EmptyState } from '../../../components/ui/EmptyState'
import { ErrorState, LoadingState } from '../../../components/ui/states'
import type { TeacherMemberRow } from '../../../types/database'
import {
  INVITE_EMAIL_RE,
  PERMISSION_LABELS,
  normalizeInviteEmail,
} from '../../auth/api'
import type {
  useCancelTeamInvite,
  useInviteAssistant,
  useInviteAssistantByEmail,
  useRemoveTeamMember,
  useTeamMembers,
  useUpdateMemberPermissions,
} from '../../auth/hooks'
import { PermChips } from './PermChips'
import { shortId } from './helpers'
import { t } from '../../../i18n'

/** محتوى قسم «فريق العمل» — دعوات المساعدين (بريد/معرّف) + الأعضاء وصلاحياتهم */
export function TeamSection({
  teamMembers,
  pendingInvites,
  membersQ,
  inviteMsg,
  emailInviteMsg,
  assistantId,
  setAssistantId,
  inviteEmail,
  setInviteEmail,
  perms,
  setPerms,
  emailPerms,
  setEmailPerms,
  confirmRemoveId,
  setConfirmRemoveId,
  confirmCancelId,
  setConfirmCancelId,
  handleInvite,
  handleEmailInvite,
  invite,
  inviteByEmail,
  cancelInvite,
  removeMember,
  updatePerms,
  toggleMemberPerm,
}: {
  teamMembers: TeacherMemberRow[]
  pendingInvites: TeacherMemberRow[]
  membersQ: ReturnType<typeof useTeamMembers>
  inviteMsg: string | null
  emailInviteMsg: string | null
  assistantId: string
  setAssistantId: Dispatch<SetStateAction<string>>
  inviteEmail: string
  setInviteEmail: Dispatch<SetStateAction<string>>
  perms: Record<string, boolean>
  setPerms: Dispatch<SetStateAction<Record<string, boolean>>>
  emailPerms: Record<string, boolean>
  setEmailPerms: Dispatch<SetStateAction<Record<string, boolean>>>
  confirmRemoveId: string | null
  setConfirmRemoveId: Dispatch<SetStateAction<string | null>>
  confirmCancelId: string | null
  setConfirmCancelId: Dispatch<SetStateAction<string | null>>
  handleInvite: (e: FormEvent) => void
  handleEmailInvite: (e: FormEvent) => void
  invite: ReturnType<typeof useInviteAssistant>
  inviteByEmail: ReturnType<typeof useInviteAssistantByEmail>
  cancelInvite: ReturnType<typeof useCancelTeamInvite>
  removeMember: ReturnType<typeof useRemoveTeamMember>
  updatePerms: ReturnType<typeof useUpdateMemberPermissions>
  toggleMemberPerm: (member: TeacherMemberRow, key: string) => void
}) {
  return (
    <>
      <p className="text-muted text-[13.5px] mt-0 mb-3">
        {t('settings.teamIntro')}
      </p>

      {/* كل مسار إضافة في بطاقة فرعية مميزة بعنوان وأيقونة
          (3A-324): المساران كانا بلوكين متتاليين بنفس الشكل
          والتسميات فبدوا تكرار عرض مربكاً */}
      <div className="border border-border rounded-2xl p-3 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Mail size={20} className="text-primary shrink-0" />
          <span className="font-bold text-[15px]">{t('settings.emailInviteTitle')}</span>
        </div>
      <form onSubmit={handleEmailInvite}>
        <Field label={t('settings.assistantEmailLabel')}>
          <TextInput
            type="email"
            dir="ltr"
            placeholder="assistant@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
        </Field>
        {INVITE_EMAIL_RE.test(normalizeInviteEmail(inviteEmail)) && (
          <a
            className="inline-flex items-center gap-1.5 min-h-[48px] text-primary text-[13.5px] font-semibold mb-3 -mt-1"
            href={`mailto:${normalizeInviteEmail(inviteEmail)}?subject=${encodeURIComponent(
              t('settings.inviteEmailSubject'),
            )}&body=${encodeURIComponent(
              t('settings.inviteEmailBody'),
            )}`}
          >
            <Mail size={18} />
            {t('settings.notifyByEmail')}
          </a>
        )}
        <div className="mb-3">
          <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.assistantPermsLabel')}</div>
          <PermChips
            value={emailPerms}
            onToggle={(key) => setEmailPerms((p) => ({ ...p, [key]: !p[key] }))}
          />
        </div>
        {emailInviteMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{emailInviteMsg}</p>
        )}
        <Button full type="submit" disabled={inviteByEmail.isPending}>
          <Send size={18} />
          {inviteByEmail.isPending ? t('settings.creatingInvite') : t('settings.sendInvite')}
        </Button>
      </form>
      </div>

      {pendingInvites.length > 0 && (
        <div className="mb-4">
          <div className="text-[13.5px] text-muted font-semibold mb-2">
            {t('settings.pendingInvitesTitle', { count: pendingInvites.length })}
          </div>
          {pendingInvites.map((inv) => {
            const invPerms = (inv.permissions ?? {}) as Record<string, unknown>
            return (
              <div key={inv.id} className="border border-border rounded-xl p-3 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-bold text-[15px] flex-1 min-w-0 break-all" dir="ltr" style={{ textAlign: 'start' }}>
                    {inv.invited_email}
                  </span>
                  <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                    {t('settings.pendingBadge')}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {Object.keys(PERMISSION_LABELS)
                    .filter((key) => invPerms[key] === true)
                    .map((key) => (
                      <span
                        key={key}
                        className="px-2 py-1 rounded-full border border-border bg-soft text-[12px] font-semibold"
                      >
                        {PERMISSION_LABELS[key]}
                      </span>
                    ))}
                </div>
                {confirmCancelId === inv.id ? (
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      className="flex-1 min-h-[48px] text-[13.5px]"
                      disabled={cancelInvite.isPending}
                      onClick={() =>
                        cancelInvite.mutate(inv.id, {
                          onSuccess: () => setConfirmCancelId(null),
                        })
                      }
                    >
                      {t('settings.confirmCancelInvite')}
                    </Button>
                    <Button
                      variant="ghost"
                      className="flex-1 min-h-[48px] text-[13.5px]"
                      onClick={() => setConfirmCancelId(null)}
                    >
                      {t('settings.undo')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    className="min-h-[48px] text-[13.5px] text-bad-text"
                    onClick={() => setConfirmCancelId(inv.id)}
                  >
                    {t('settings.cancelInvite')}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="border border-border rounded-2xl p-3 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <KeyRound size={20} className="text-primary shrink-0" />
          <span className="font-bold text-[15px]">{t('settings.addByIdTitle')}</span>
        </div>
      <form onSubmit={handleInvite}>
        <Field label={t('settings.assistantIdLabel')}>
          <TextInput
            dir="ltr"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            value={assistantId}
            onChange={(e) => setAssistantId(e.target.value)}
            required
          />
        </Field>
        <div className="mb-3">
          <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.assistantPermsLabel')}</div>
          <PermChips
            value={perms}
            onToggle={(key) => setPerms((p) => ({ ...p, [key]: !p[key] }))}
          />
        </div>
        {inviteMsg && (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mb-3 mt-0">{inviteMsg}</p>
        )}
        <Button full type="submit" disabled={invite.isPending}>
          <UserPlus size={18} />
          {invite.isPending ? t('settings.adding') : t('settings.addAssistant')}
        </Button>
      </form>
      </div>

      <div className="text-[13.5px] text-muted font-semibold mb-2">{t('settings.teamMembersTitle')}</div>
      {membersQ.isPending ? (
        <LoadingState label={t('settings.loadingTeam')} />
      ) : membersQ.isError ? (
        <ErrorState
          message={membersQ.error instanceof Error ? membersQ.error.message : t('common.unknownError')}
          onRetry={() => void membersQ.refetch()}
        />
      ) : teamMembers.length === 0 ? (
        <EmptyState icon={Handshake} title={t('settings.teamEmptyTitle')} hint={t('settings.teamEmptyHint')} />
      ) : (
        teamMembers.map((m) => {
          const memberPerms = (m.permissions ?? {}) as Record<string, unknown>
          return (
            <div key={m.id} className="border border-border rounded-xl p-3 mb-2">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-[15px] flex-1">
                  {m.invited_email ? (
                    <>{t('settings.memberAssistantPrefix')} <span dir="ltr">{m.invited_email}</span></>
                  ) : (
                    <>{t('settings.memberAssistantPrefix')} <span dir="ltr">{shortId(m.user_id ?? '')}</span></>
                  )}
                </span>
                <span className="text-[12px] font-bold bg-soft text-primary rounded-full px-2 py-0.5">
                  {m.status === 'active' ? t('settings.statusActive') : m.status === 'invited' ? t('settings.statusInvited') : t('settings.statusSuspended')}
                </span>
              </div>
              <div className="mb-2">
                <PermChips
                  value={Object.fromEntries(
                    Object.keys(PERMISSION_LABELS).map((k) => [k, memberPerms[k] === true]),
                  )}
                  onToggle={(key) => toggleMemberPerm(m, key)}
                  disabled={updatePerms.isPending}
                  note={false}
                />
              </div>
              {confirmRemoveId === m.id ? (
                <div className="flex gap-2">
                  <Button
                    variant="danger"
                    className="flex-1 min-h-[48px] text-[13.5px]"
                    disabled={removeMember.isPending}
                    onClick={() =>
                      removeMember.mutate(m.id, {
                        onSuccess: () => setConfirmRemoveId(null),
                      })
                    }
                  >
                    {t('settings.confirmRemoveMember')}
                  </Button>
                  <Button
                    variant="ghost"
                    className="flex-1 min-h-[48px] text-[13.5px]"
                    onClick={() => setConfirmRemoveId(null)}
                  >
                    {t('settings.cancel')}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  className="min-h-[48px] text-[13.5px] text-bad-text"
                  onClick={() => setConfirmRemoveId(m.id)}
                >
                  {t('settings.removeFromTeam')}
                </Button>
              )}
            </div>
          )
        })
      )}
    </>
  )
}
