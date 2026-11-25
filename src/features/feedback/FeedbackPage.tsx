import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Lock, MessageSquarePlus } from 'lucide-react'
import { t } from '../../i18n'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Chip, ChipRow, Field, TextArea } from '../../components/ui/form'
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
import { useAuth } from '../../lib/useAuth'
import type { FeedbackKind, FeedbackStatus, TeacherFeedbackRow } from '../../types/database'
import { formatDateLabel } from '../schedule/api'
import { FEEDBACK, useFeedbackList, useSetFeedbackStatus, useSubmitFeedback } from './hooks'

const KIND_OPTIONS: { id: FeedbackKind; label: string }[] = [
  { id: 'suggestion', label: t('feedback.kindSuggestion') },
  { id: 'problem', label: t('feedback.kindProblem') },
  { id: 'praise', label: t('feedback.kindPraise') },
  { id: 'other', label: t('feedback.kindOther') },
]

const KIND_LABELS: Record<FeedbackKind, string> = {
  suggestion: t('feedback.kindSuggestion'),
  problem: t('feedback.kindProblem'),
  praise: t('feedback.kindPraise'),
  other: t('feedback.kindOther'),
}

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: t('feedback.statusNew'),
  read: t('feedback.statusRead'),
  closed: t('feedback.statusClosed'),
}

const STATUS_BADGE: Record<FeedbackStatus, string> = {
  new: 'bg-warn/15 text-warn-text',
  read: 'bg-soft text-muted',
  closed: 'bg-ok-soft text-ok-text',
}

/**
 * قناة ملاحظات المدرس (مهمة 11 — 0052): إرسال من أي مستخدم في الحساب
 * (مالك أو مساعد) عبر RPC وحده، وقائمة الحساب وحالاتها للمالك فقط —
 * للمساعد تظهر بطاقة الإرسال وحدها مع تنبيه صريح أن القائمة للمالك،
 * فلا تُعرض له قائمة فارغة كاذبة (RLS تمنع قراءته أصلاً).
 */
export function FeedbackPage() {
  const teacher = useCurrentTeacher()
  const { user } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [kind, setKind] = useState<FeedbackKind>('suggestion')
  const [body, setBody] = useState('')
  const [bodyError, setBodyError] = useState<string | null>(null)

  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined
  const isOwner = teacher.status === 'ready' && teacher.role === 'owner'

  const listQ = useFeedbackList(teacherId, isOwner)
  const submit = useSubmitFeedback(teacherId ?? '')
  const setStatus = useSetFeedbackStatus()

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const onSend = () => {
    const text = body.trim()
    if (!text) {
      setBodyError(t('feedback.bodyRequired'))
      return
    }
    setBodyError(null)
    submit.mutate(
      { kind, body: text },
      {
        onSuccess: () => {
          setBody('')
          toast(t('feedback.sentToast'))
        },
        onError: () => toast(t('feedback.sendError')),
      },
    )
  }

  const onSetStatus = (row: TeacherFeedbackRow, status: FeedbackStatus) => {
    setStatus.mutate(
      { id: row.id, status },
      { onError: () => toast(t('feedback.statusError')) },
    )
  }

  const items = listQ.data ?? []

  return (
    <PullToRefresh onRefresh={() => invalidatePrefixes(qc, [FEEDBACK])}>
      <div>
        <p className="text-muted text-[13.5px] leading-[1.8] mb-3 mt-0 rise-in">
          {t('feedback.intro')}
        </p>

        <Card className="rise-in mb-4" style={{ animationDelay: '35ms' }}>
          <h2 className="text-[15px] font-bold mt-0 mb-3 flex items-center gap-2">
            <MessageSquarePlus size={19} className="text-primary" />
            {t('feedback.composeTitle')}
          </h2>
          <ChipRow>
            {KIND_OPTIONS.map((k) => (
              <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
              </Chip>
            ))}
          </ChipRow>
          <Field label={t('feedback.bodyLabel')} error={bodyError}>
            <TextArea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('feedback.bodyPlaceholder')}
              maxLength={4000}
              rows={4}
            />
          </Field>
          <div className="flex">
            <Button onClick={onSend} disabled={submit.isPending}>
              {t('feedback.send')}
            </Button>
          </div>
        </Card>

        {isOwner ? (
          <>
            <h2 className="text-[15px] font-bold mb-3">{t('feedback.listTitle')}</h2>
            {listQ.isPending ? (
              <LoadingState />
            ) : listQ.error ? (
              <ErrorState
                message={
                  listQ.error instanceof Error ? listQ.error.message : t('common.unknownError')
                }
                onRetry={() => void invalidatePrefixes(qc, [FEEDBACK])}
              />
            ) : items.length === 0 ? (
              <Card>
                <EmptyState
                  icon={MessageSquarePlus}
                  title={t('feedback.emptyTitle')}
                  hint={t('feedback.emptyHint')}
                />
              </Card>
            ) : (
              items.map((row, i) => {
                const busy = setStatus.isPending && setStatus.variables?.id === row.id
                return (
                  <Card
                    key={row.id}
                    className="rise-in mb-3"
                    style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[13px] font-bold bg-soft text-text rounded-full px-2.5 py-0.5">
                        {KIND_LABELS[row.kind]}
                      </span>
                      <span
                        className={`text-[13px] font-bold rounded-full px-2.5 py-0.5 ${STATUS_BADGE[row.status]}`}
                      >
                        {STATUS_LABELS[row.status]}
                      </span>
                      <span className="flex-1" />
                      <span className="text-[12.5px] text-muted">
                        {formatDateLabel(row.created_at.slice(0, 10))}
                      </span>
                    </div>
                    <p className="text-[14.5px] leading-[1.8] whitespace-pre-wrap mt-0 mb-2">
                      {row.body}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[12.5px] text-muted">
                        {row.author_user_id === user?.id
                          ? t('feedback.authorYou')
                          : t('feedback.authorMember')}
                      </span>
                      <span className="flex-1" />
                      {row.status === 'new' ? (
                        <Button
                          size="sm"
                          variant="soft"
                          disabled={busy}
                          onClick={() => onSetStatus(row, 'read')}
                        >
                          <CheckCheck size={16} />
                          {t('feedback.markRead')}
                        </Button>
                      ) : null}
                      {row.status !== 'closed' ? (
                        <Button
                          size="sm"
                          variant="soft"
                          disabled={busy}
                          onClick={() => onSetStatus(row, 'closed')}
                        >
                          <Lock size={16} />
                          {t('feedback.closeItem')}
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                )
              })
            )}
          </>
        ) : (
          <p className="text-muted text-[13.5px] leading-[1.8] rise-in">
            {t('feedback.listOwnerOnly')}
          </p>
        )}
      </div>
    </PullToRefresh>
  )
}
