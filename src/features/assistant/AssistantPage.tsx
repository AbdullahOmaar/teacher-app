import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, KeyRound, Send, Sparkles, Square, X } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { TextInput } from '../../components/ui/form'
import { LoadingState, NoTeacherProfile, SignInRequired } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateTimeAr, formatMoney, formatTime12 } from '../../lib/format'
import { INVALIDATION_SETS, invalidatePrefixes } from '../../lib/invalidate'
import { t, type I18nKey } from '../../i18n'
import {
  AssistantError,
  confirmAssistantProposal,
  fetchAssistantStatus,
  fetchGroupName,
  fetchSessionLabel,
  fetchStudentName,
  sendAssistantMessage,
  statusErrorKind,
  stopAssistantRun,
  type AssistantReply,
  type ChatHistoryTurn,
} from './apiAssistant'

// ============================================================================
// شاشة محادثة المساعد الذكي (Phase 2 T6 — ق5 ‏BYOK)
// ----------------------------------------------------------------------------
// حالات صادقة بلا تمثيل: علم المنصة مطفأ ← الشاشة تشرح وتخفي الإدخال؛
// بلا مفتاح مدرّس ← توجيه للإعدادات والإرسال معطّل. القراءات تُعرض من
// نتيجتها المنظمة كما رجعت من الدالة، والكتابات لا تظهر إلا كبطاقة
// اقتراح بمعاينة حرفية (أسماء محلولة من قاعدة البيانات) وزرّي تأكيد/
// إلغاء — وزر إيقاف أثناء التشغيل وعلى البطاقة المعلّقة.
// ============================================================================

type ProposalState = 'pending' | 'executed' | 'cancelled' | 'stopped' | 'failed'

interface ProposalLine {
  label: string
  value: string
}

type ChatMessage =
  | { id: number; role: 'user'; text: string }
  | { id: number; role: 'assistant'; kind: 'text'; text: string }
  | { id: number; role: 'assistant'; kind: 'read'; tool: string; result: Record<string, unknown> }
  | {
      id: number
      role: 'assistant'
      kind: 'proposal'
      tool: string
      runId: string
      payloadHash: string
      expiresAt: string
      title: string
      lines: ProposalLine[]
      state: ProposalState
    }
  | { id: number; role: 'assistant'; kind: 'error'; text: string }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function recs(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter(isRecord) : []
}

const METHOD_KEYS: Record<string, I18nKey> = {
  cash: 'assistant.methodCash',
  instapay: 'assistant.methodInstapay',
  wallet: 'assistant.methodWallet',
  card: 'assistant.methodCard',
}

function ReadResult({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  if (tool === 'assistant_answer') {
    return <p className="mt-0 mb-0 text-[14.5px] whitespace-pre-wrap">{str(result.text)}</p>
  }
  if (tool === 'unpaid_students') {
    const lines = recs(result.students)
    return (
      <div>
        <p className="mt-0 mb-2 font-semibold text-[14.5px]">{t('assistant.readUnpaidTitle')}</p>
        <p className="mt-0 mb-2 text-[13.5px] text-muted">
          {t('assistant.readUnpaidTotal', {
            amount: formatMoney(num(result.total_balance)),
            count: num(result.count),
          })}
        </p>
        <ul className="list-none mt-0 mb-0 grid gap-1 ps-0">
          {lines.map((line, i) => (
            <li key={i} className="text-[13.5px]">
              {t('assistant.readUnpaidLine', {
                name: str(line.name) || str(line.student_id),
                amount: formatMoney(num(line.balance)),
              })}
              {num(line.overdue_balance) > 0 &&
                t('assistant.readUnpaidOverdue', {
                  amount: formatMoney(num(line.overdue_balance)),
                })}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (tool === 'absence_summary') {
    const lines = recs(result.students)
    return (
      <div>
        <p className="mt-0 mb-2 font-semibold text-[14.5px]">{t('assistant.readAbsenceTitle')}</p>
        {lines.length === 0 ? (
          <p className="mt-0 mb-0 text-[13.5px]">{t('assistant.readAbsenceEmpty')}</p>
        ) : (
          <>
            <p className="mt-0 mb-2 text-[13.5px] text-muted">
              {t('assistant.readAbsenceTotal', { count: num(result.total_absences) })}
            </p>
            <ul className="list-none mt-0 mb-0 grid gap-1 ps-0">
              {lines.map((line, i) => (
                <li key={i} className="text-[13.5px]">
                  {t('assistant.readAbsenceLine', {
                    name: str(line.name) || str(line.student_id),
                    count: num(line.absences),
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }
  if (tool === 'collection_summary') {
    const byMethod = isRecord(result.by_method) ? result.by_method : {}
    return (
      <div>
        <p className="mt-0 mb-2 font-semibold text-[14.5px]">
          {t('assistant.readCollectionTitle')}
        </p>
        <p className="mt-0 mb-2 text-[13.5px]">
          {t('assistant.readCollectionTotal', {
            amount: formatMoney(num(result.total)),
            count: num(result.count),
          })}
        </p>
        <ul className="list-none mt-0 mb-0 grid gap-1 ps-0">
          {Object.entries(byMethod).map(([method, amount]) => (
            <li key={method} className="text-[13.5px] text-muted">
              {t('assistant.readCollectionMethod', {
                method: t(METHOD_KEYS[method] ?? 'assistant.methodOther'),
                amount: formatMoney(num(amount)),
              })}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  if (tool === 'homework_summary') {
    const session = isRecord(result.session) ? result.session : null
    if (!session) {
      return <p className="mt-0 mb-0 text-[14px]">{t('assistant.readHomeworkNoSession')}</p>
    }
    const pendingNames = recs(result.pending_students)
      .map((s) => str(s.name) || str(s.student_id))
      .join(t('settings.joinSeparator'))
    return (
      <div>
        <p className="mt-0 mb-2 font-semibold text-[14.5px]">
          {t('assistant.readHomeworkTitle', { date: str(session.session_date) })}
        </p>
        <p className="mt-0 mb-0 text-[13.5px]">
          {t('assistant.readHomeworkSummary', {
            attended: num(result.attended),
            submitted: num(result.submitted),
            pending: num(result.pending),
          })}
        </p>
        {pendingNames && (
          <p className="mt-1 mb-0 text-[13.5px] text-muted">
            {t('assistant.readHomeworkPending', { names: pendingNames })}
          </p>
        )}
      </div>
    )
  }
  if (tool === 'sessions_overview') {
    const lines = recs(result.sessions)
    return (
      <div>
        <p className="mt-0 mb-2 font-semibold text-[14.5px]">
          {t('assistant.readSessionsTitle', { month: str(result.month) })}
        </p>
        <p className="mt-0 mb-2 text-[13.5px]">
          {t('assistant.readSessionsCount', { count: num(result.count) })}
        </p>
        <ul className="list-none mt-0 mb-0 grid gap-1 ps-0">
          {lines.map((line, i) => (
            <li key={i} className="text-[13.5px] text-muted">
              {t('assistant.readSessionsLine', {
                date: str(line.session_date),
                time: formatTime12(str(line.start_time)),
              })}
            </li>
          ))}
        </ul>
      </div>
    )
  }
  return (
    <pre dir="ltr" className="mt-0 mb-0 text-[12px] overflow-x-auto">
      {JSON.stringify(result, null, 2)}
    </pre>
  )
}

/** معاينة حرفية للاقتراح: أسماء المجموعة/الطالب/الحصة محلولة من البيانات */
async function resolveProposal(
  teacherId: string,
  reply: Extract<AssistantReply, { kind: 'proposed' }>,
): Promise<{ title: string; lines: ProposalLine[] }> {
  const p = reply.payload
  if (reply.tool === 'add_student') {
    const groupName = await fetchGroupName(teacherId, str(p.group_id))
    const lines: ProposalLine[] = [
      { label: t('assistant.fieldName'), value: str(p.name) },
      { label: t('assistant.fieldGroup'), value: groupName ?? str(p.group_id) },
    ]
    if (str(p.phone)) lines.push({ label: t('assistant.fieldPhone'), value: str(p.phone) })
    if (str(p.grade)) lines.push({ label: t('assistant.fieldGrade'), value: str(p.grade) })
    return { title: t('assistant.proposalAddStudent'), lines }
  }
  if (reply.tool === 'set_homework') {
    const [studentName, session] = await Promise.all([
      fetchStudentName(teacherId, str(p.student_id)),
      fetchSessionLabel(teacherId, str(p.session_id)),
    ])
    return {
      title:
        p.done === true
          ? t('assistant.proposalSetHomeworkDone')
          : t('assistant.proposalSetHomeworkMissing'),
      lines: [
        { label: t('assistant.fieldStudent'), value: studentName ?? str(p.student_id) },
        { label: t('assistant.fieldSession'), value: session?.date ?? str(p.session_id) },
      ],
    }
  }
  if (reply.tool === 'generate_sessions') {
    const groupName = await fetchGroupName(teacherId, str(p.group_id))
    return {
      title: t('assistant.proposalGenerateSessions', { month: str(p.month) }),
      lines: [
        { label: t('assistant.fieldGroup'), value: groupName ?? str(p.group_id) },
        { label: t('assistant.fieldMonth'), value: str(p.month) },
      ],
    }
  }
  return {
    title: reply.tool,
    lines: Object.entries(p).map(([k, v]) => ({ label: k, value: String(v) })),
  }
}

export function AssistantPage() {
  const teacher = useCurrentTeacher()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : ''

  const statusQ = useQuery({
    queryKey: ['assistant-status', teacherId],
    queryFn: () => fetchAssistantStatus(teacherId),
    enabled: Boolean(teacherId),
    retry: false,
  })

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const idRef = useRef(0)
  const stopRequestedRef = useRef(false)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const nextId = () => ++idRef.current
  const push = (msg: ChatMessage) => setMessages((prev) => [...prev, msg])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length, busy])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />

  const status = statusQ.data ?? null
  const chatReady = Boolean(status?.enabled && status?.has_key)
  // تصنيف خطأ الحالة مرة واحدة للعرض: 503 → بطاقة «مطفأ» الصريحة،
  // فشل وصول (بلا سياق) → رسالة شبكة، غيرهما → الرسالة العامة.
  const statusErrKind = statusQ.isError ? statusErrorKind(statusQ.error) : null

  const buildHistory = (): ChatHistoryTurn[] => {
    const turns: ChatHistoryTurn[] = []
    for (const m of messages) {
      if (m.role === 'user') turns.push({ role: 'user', text: m.text })
      else if (m.kind === 'text') turns.push({ role: 'assistant', text: m.text })
    }
    return turns.slice(-10)
  }

  const handleSend = async () => {
    const text = input.trim()
    if (!text || busy || !chatReady) return
    setInput('')
    push({ id: nextId(), role: 'user', text })
    setBusy(true)
    stopRequestedRef.current = false
    try {
      const reply = await sendAssistantMessage(teacherId, text, buildHistory())
      if (stopRequestedRef.current) {
        // الإيقاف أثناء التشغيل: أي اقتراح وصل يُوقَف خادمياً فوراً
        if (reply.kind === 'proposed') {
          await stopAssistantRun(teacherId, reply.runId, 'stop').catch(() => {})
        }
        push({ id: nextId(), role: 'assistant', kind: 'text', text: t('assistant.stoppedMsg') })
        return
      }
      if (reply.kind === 'answered') {
        if (reply.tool === 'assistant_answer') {
          push({
            id: nextId(),
            role: 'assistant',
            kind: 'text',
            text: str(reply.result.text),
          })
        } else {
          push({
            id: nextId(),
            role: 'assistant',
            kind: 'read',
            tool: reply.tool,
            result: reply.result,
          })
        }
      } else {
        const preview = await resolveProposal(teacherId, reply)
        push({
          id: nextId(),
          role: 'assistant',
          kind: 'proposal',
          tool: reply.tool,
          runId: reply.runId,
          payloadHash: reply.payloadHash,
          expiresAt: reply.expiresAt,
          title: preview.title,
          lines: preview.lines,
          state: 'pending',
        })
      }
    } catch (err) {
      push({
        id: nextId(),
        role: 'assistant',
        kind: 'error',
        text: err instanceof Error ? err.message : t('assistant.errGeneric'),
      })
    } finally {
      setBusy(false)
    }
  }

  const setProposalState = (id: number, state: ProposalState) =>
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id && m.role === 'assistant' && m.kind === 'proposal'
          ? { ...m, state }
          : m,
      ),
    )

  const handleConfirm = async (msg: Extract<ChatMessage, { kind: 'proposal' }>) => {
    setConfirmingId(msg.id)
    try {
      const { result } = await confirmAssistantProposal(teacherId, msg.runId, msg.payloadHash)
      setProposalState(msg.id, 'executed')
      if (msg.tool === 'add_student') {
        await invalidatePrefixes(qc, [
          ...INVALIDATION_SETS.students,
          ...INVALIDATION_SETS.groups,
        ])
        push({ id: nextId(), role: 'assistant', kind: 'text', text: t('assistant.executedMsg') })
      } else if (msg.tool === 'set_homework') {
        await invalidatePrefixes(qc, [...INVALIDATION_SETS.attendance])
        push({ id: nextId(), role: 'assistant', kind: 'text', text: t('assistant.executedMsg') })
      } else if (msg.tool === 'generate_sessions') {
        await invalidatePrefixes(qc, [...INVALIDATION_SETS.schedule])
        push({
          id: nextId(),
          role: 'assistant',
          kind: 'text',
          text: t('assistant.executedCreated', { count: num(result.created) }),
        })
      } else {
        push({ id: nextId(), role: 'assistant', kind: 'text', text: t('assistant.executedMsg') })
      }
    } catch (err) {
      setProposalState(msg.id, 'failed')
      push({
        id: nextId(),
        role: 'assistant',
        kind: 'error',
        text:
          err instanceof AssistantError && err.status === 409
            ? t('assistant.errConflict')
            : t('assistant.failedMsg'),
      })
    } finally {
      setConfirmingId(null)
    }
  }

  const handleCancelProposal = async (
    msg: Extract<ChatMessage, { kind: 'proposal' }>,
    mode: 'stop' | 'cancel',
  ) => {
    try {
      await stopAssistantRun(teacherId, msg.runId, mode)
    } catch {
      // البطاقة تُقفل محلياً على أي حال — الخادم يرفض تأكيدها بعد انتهائها
    }
    setProposalState(msg.id, mode === 'stop' ? 'stopped' : 'cancelled')
    push({
      id: nextId(),
      role: 'assistant',
      kind: 'text',
      text: mode === 'stop' ? t('assistant.stoppedMsg') : t('assistant.cancelledMsg'),
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <h2 className="type-section mt-0 mb-2 flex items-center gap-2">
          <Sparkles size={22} className="text-primary" /> {t('assistant.title')}
        </h2>
        <p className="text-muted text-[13.5px] mt-0 mb-0">{t('assistant.intro')}</p>
      </Card>

      {statusQ.isLoading && (
        <p className="text-muted text-[13.5px]">{t('assistant.loadingStatus')}</p>
      )}
      {statusQ.isError &&
        (statusErrKind === 'disabled' ? (
          <Card>
            <p className="mt-0 mb-1 font-semibold text-[15px]">{t('assistant.disabledTitle')}</p>
            <p className="text-muted text-[13.5px] mt-0 mb-0">{t('assistant.disabledBody')}</p>
          </Card>
        ) : (
          <p className="text-[13.5px] bg-soft rounded-xl px-3 py-2" role="alert">
            {statusErrKind === 'network'
              ? t('assistant.errNetwork')
              : t('assistant.errGeneric')}
          </p>
        ))}
      {status && !status.enabled && (
        <Card>
          <p className="mt-0 mb-1 font-semibold text-[15px]">{t('assistant.disabledTitle')}</p>
          <p className="text-muted text-[13.5px] mt-0 mb-0">{t('assistant.disabledBody')}</p>
        </Card>
      )}
      {status?.enabled && !status.has_key && (
        <Card>
          <p className="mt-0 mb-1 font-semibold text-[15px]">{t('assistant.noKeyTitle')}</p>
          <p className="text-muted text-[13.5px] mt-0 mb-3">{t('assistant.noKeyBody')}</p>
          <Button size="sm" variant="soft" onClick={() => navigate('/settings')}>
            <KeyRound size={16} />
            {t('assistant.noKeyCta')}
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-2">
        {messages.length === 0 && chatReady && (
          <p className="text-muted text-[13.5px] bg-soft rounded-xl px-3 py-2">
            {t('assistant.emptyState')}
          </p>
        )}
        {messages.map((m) => {
          if (m.role === 'user') {
            return (
              <div
                key={m.id}
                className="self-start max-w-[92%] bg-soft rounded-2xl px-3 py-2 text-[14.5px]"
              >
                <span className="block text-[11.5px] text-muted mb-0.5">
                  {t('assistant.youLabel')}
                </span>
                {m.text}
              </div>
            )
          }
          if (m.kind === 'text') {
            return (
              <div key={m.id} className="self-stretch">
                <Card>
                  <span className="block text-[11.5px] text-muted mb-1">
                    {t('assistant.assistantLabel')}
                  </span>
                  <p className="mt-0 mb-0 text-[14.5px] whitespace-pre-wrap">{m.text}</p>
                </Card>
              </div>
            )
          }
          if (m.kind === 'error') {
            return (
              <p
                key={m.id}
                className="text-[13.5px] bg-soft rounded-xl px-3 py-2 mt-0 mb-0"
                role="alert"
              >
                {m.text}
              </p>
            )
          }
          if (m.kind === 'read') {
            return (
              <Card key={m.id}>
                <span className="block text-[11.5px] text-muted mb-1">
                  {t('assistant.assistantLabel')}
                </span>
                <ReadResult tool={m.tool} result={m.result} />
              </Card>
            )
          }
          // بطاقة اقتراح كتابة
          return (
            <Card key={m.id}>
              <p className="mt-0 mb-2 font-semibold text-[14.5px] flex items-center gap-2">
                <Sparkles size={16} className="text-primary shrink-0" />
                {t('assistant.proposalTitle')}
              </p>
              <p className="mt-0 mb-2 text-[14.5px]">{m.title}</p>
              <dl className="grid gap-1 mt-0 mb-3">
                {m.lines.map((line, i) => (
                  <div key={i} className="flex gap-2 text-[13.5px]">
                    <dt className="text-muted shrink-0">{line.label}:</dt>
                    <dd className="mt-0 mb-0 font-medium">{line.value}</dd>
                  </div>
                ))}
              </dl>
              {m.state === 'pending' ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => void handleConfirm(m)}
                      disabled={confirmingId === m.id}
                    >
                      <Check size={16} />
                      {confirmingId === m.id
                        ? t('assistant.confirming')
                        : t('assistant.confirm')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCancelProposal(m, 'cancel')}
                      disabled={confirmingId === m.id}
                    >
                      <X size={16} />
                      {t('assistant.cancel')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleCancelProposal(m, 'stop')}
                      disabled={confirmingId === m.id}
                    >
                      <Square size={14} />
                      {t('assistant.stop')}
                    </Button>
                  </div>
                  {m.expiresAt && (
                    <p className="text-muted text-[12px] mt-2 mb-0">
                      {t('assistant.proposalExpires', {
                        time: formatDateTimeAr(m.expiresAt),
                      })}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-muted text-[13px] mt-0 mb-0">
                  {m.state === 'executed'
                    ? t('assistant.executedMsg')
                    : m.state === 'cancelled'
                      ? t('assistant.cancelledMsg')
                      : m.state === 'stopped'
                        ? t('assistant.stoppedMsg')
                        : t('assistant.failedMsg')}
                </p>
              )}
            </Card>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {chatReady && (
        <div className="flex items-end gap-2">
          <div className="grow">
            <TextInput
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder={t('assistant.inputPlaceholder')}
              aria-label={t('assistant.inputPlaceholder')}
            />
          </div>
          {busy ? (
            <Button
              variant="danger"
              onClick={() => {
                stopRequestedRef.current = true
              }}
            >
              <Square size={16} />
              {t('assistant.stop')}
            </Button>
          ) : (
            <Button onClick={() => void handleSend()} disabled={!input.trim()}>
              <Send size={18} />
              {t('assistant.send')}
            </Button>
          )}
        </div>
      )}
      {busy && (
        <p className="text-muted text-[12.5px] mt-0 mb-0">{t('assistant.sending')}</p>
      )}
    </div>
  )
}
