import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, MessageSquareText } from 'lucide-react'
import { t } from '../../i18n'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Field, TextArea, TextInput } from '../../components/ui/form'
import { PullToRefresh } from '../../components/ui/PullToRefresh'
import {
  ErrorState,
  LoadingState,
  NoTeacherProfile,
  SignInRequired,
} from '../../components/ui/states'
import { useToast } from '../../components/ui/toast'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { invalidatePrefixes } from '../../lib/invalidate'
import { formatDateLabel } from '../schedule/api'
import { ticketStatusLabel, type TicketStatus } from './api'
import {
  SUPPORT,
  useMyTickets,
  useReplyToTicket,
  useSubmitSupportTicket,
  useTicketThread,
} from './hooks'
import { FeatureIntro } from '../newFeatures/FeatureIntro'

const STATUS_BADGE: Record<TicketStatus, string> = {
  new: 'bg-warn/15 text-warn-text',
  in_progress: 'bg-soft text-muted',
  waiting_teacher: 'bg-warn/15 text-warn-text',
  closed: 'bg-ok-soft text-ok-text',
}

/**
 * الدعم الفني لطرف المدرس (مهمة 23 — 0065): فتح تذكرة + قائمة
 * تذاكر الحساب + خيط الردود مع إدارة المنصة. حتى تطبيق 0065 تعرض
 * «قريباً» مصممة (لا خطأ خام — قاعدة مالك 2026-11-26).
 */
export function SupportPage() {
  const teacher = useCurrentTeacher()
  const toast = useToast()
  const qc = useQueryClient()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [subjectError, setSubjectError] = useState<string | null>(null)
  const [bodyError, setBodyError] = useState<string | null>(null)
  const [openTicketId, setOpenTicketId] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [replyError, setReplyError] = useState<string | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const listQ = useMyTickets(teacherId, teacher.status === 'ready')
  const threadQ = useTicketThread(
    openTicketId ?? undefined,
    openTicketId !== null,
  )
  const submit = useSubmitSupportTicket(teacherId ?? '')
  const replyM = useReplyToTicket()

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const items = listQ.data ?? []
  const thread = threadQ.data

  const onSend = () => {
    const s = subject.trim()
    const b = body.trim()
    setSubjectError(s === '' ? t('support.subjectRequired') : null)
    setBodyError(b === '' ? t('support.bodyRequired') : null)
    if (s === '' || b === '') return
    submit.mutate(
      { subject: s, body: b },
      {
        onSuccess: () => {
          setSubject('')
          setBody('')
          toast(t('support.ticketSentToast'))
        },
        onError: () => toast(t('support.ticketSendError')),
      },
    )
  }

  const onReply = () => {
    if (!openTicketId) return
    const text = reply.trim()
    if (text === '') {
      setReplyError(t('support.replyRequired'))
      return
    }
    setReplyError(null)
    replyM.mutate(
      { ticketId: openTicketId, body: text },
      {
        onSuccess: () => {
          setReply('')
          toast(t('support.replySentToast'))
        },
        onError: () => toast(t('support.replyError')),
      },
    )
  }

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [SUPPORT])}>
      <div>
        <FeatureIntro featureId="support-tickets" />
        <p className="text-muted text-[13.5px] leading-[1.8] mb-3 mt-0 rise-in">
          {t('support.ticketsIntro')}
        </p>

        {listQ.data === null ? (
          <Card>
            <EmptyState
              icon={LifeBuoy}
              title={t('support.ticketsComingSoonTitle')}
              hint={t('support.ticketsComingSoonHint')}
            />
          </Card>
        ) : (
          <>
            <Card className="rise-in mb-4" style={{ animationDelay: '35ms' }}>
              <h2 className="text-[15px] font-bold mt-0 mb-3 flex items-center gap-2">
                <LifeBuoy size={19} className="text-primary" />
                {t('support.newTicketTitle')}
              </h2>
              <Field label={t('support.subjectLabel')} error={subjectError}>
                <TextInput
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder={t('support.subjectPlaceholder')}
                  maxLength={200}
                />
              </Field>
              <Field label={t('support.bodyLabel')} error={bodyError}>
                <TextArea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('support.bodyPlaceholder')}
                  maxLength={4000}
                  rows={4}
                />
              </Field>
              <div className="flex">
                <Button onClick={onSend} disabled={submit.isPending}>
                  {t('support.sendTicket')}
                </Button>
              </div>
            </Card>

            <h2 className="text-[15px] font-bold mb-3">
              {t('support.ticketsTitle')}
            </h2>
            {listQ.isPending ? (
              <LoadingState />
            ) : listQ.isError ? (
              <ErrorState
                message={t('support.ticketsLoadError')}
                onRetry={() => void listQ.refetch()}
              />
            ) : items.length === 0 ? (
              <Card>
                <EmptyState
                  icon={MessageSquareText}
                  title={t('support.ticketsEmpty')}
                  hint={t('support.ticketsEmptyHint')}
                />
              </Card>
            ) : (
              /* شبكة بطاقات عند الديسكتوب (3A-930) — items-start حتى
                 لا يشدّ فتح تذكرة جاراتها */
              <div className="lg:grid lg:grid-cols-2 lg:gap-3 lg:items-start">
              {items.map((row, i) => {
                const open = openTicketId === row.id
                return (
                  <Card
                    key={row.id}
                    className="rise-in mb-3 lg:mb-0"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenTicketId(open ? null : row.id)}
                      className="w-full bg-transparent border-0 cursor-pointer text-start p-0 text-text"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-[15px] flex-1">
                          {row.subject}
                        </span>
                        <span
                          className={`text-[12.5px] font-bold rounded-full px-2.5 py-0.5 ${STATUS_BADGE[row.status]}`}
                        >
                          {ticketStatusLabel(row.status)}
                        </span>
                      </div>
                      <div className="text-muted text-[12.5px]">
                        {t('support.messagesCount', { count: row.messageCount })}
                        {row.lastMessageAt
                          ? ` — ${t('support.lastReplyLabel')}: ${formatDateLabel(row.lastMessageAt)}`
                          : ''}
                      </div>
                    </button>

                    {open && (
                      <div className="mt-3 pt-3 border-t border-border space-y-3">
                        {threadQ.isPending ? (
                          <LoadingState />
                        ) : threadQ.isError || !thread ? (
                          <ErrorState
                            message={t('support.ticketsLoadError')}
                            onRetry={() => void threadQ.refetch()}
                          />
                        ) : (
                          <>
                            {thread.messages.length === 0 ? (
                              <p className="text-muted type-secondary mb-0">
                                {t('support.ticketsEmpty')}
                              </p>
                            ) : (
                              thread.messages.map((m) => (
                                <div
                                  key={m.id}
                                  className={`rounded-xl px-3 py-2 text-[14px] leading-[1.8] ${
                                    m.authorKind === 'admin'
                                      ? 'bg-soft'
                                      : 'bg-ok-soft'
                                  }`}
                                >
                                  <div className="text-[12.5px] font-bold mb-1">
                                    {m.authorKind === 'admin'
                                      ? t('support.authorAdmin')
                                      : t('support.authorYou')}{' '}
                                    <span className="text-muted font-normal">
                                      — {formatDateLabel(m.createdAt)}
                                    </span>
                                  </div>
                                  <div className="whitespace-pre-wrap">{m.body}</div>
                                </div>
                              ))
                            )}
                            {thread.status === 'closed' ? (
                              <p className="text-muted type-secondary mb-0">
                                {t('support.ticketClosedNote')}
                              </p>
                            ) : (
                              <>
                                <Field
                                  label={t('support.replyLabel')}
                                  error={replyError}
                                >
                                  <TextArea
                                    value={reply}
                                    onChange={(e) => setReply(e.target.value)}
                                    placeholder={t('support.replyPlaceholder')}
                                    maxLength={4000}
                                    rows={3}
                                  />
                                </Field>
                                <div className="flex">
                                  <Button
                                    size="sm"
                                    onClick={onReply}
                                    disabled={replyM.isPending}
                                  >
                                    {t('support.sendReply')}
                                  </Button>
                                </div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
              </div>
            )}
          </>
        )}
      </div>
    </PullToRefresh>
  )
}
