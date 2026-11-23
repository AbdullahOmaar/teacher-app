import { useEffect, useRef, useState } from 'react'
import {
  CalendarClock,
  Check,
  Copy,
  Globe,
  Link2,
  Link2Off,
  MonitorSmartphone,
  Trash2,
  X,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { Skeleton } from '../../components/ui/states'
import { t } from '../../i18n'
import type {
  AssessmentRow,
  OnlineExamInput,
  OnlineExamStatus,
} from '../../types/database'
import { fmtScore } from '../grades/api'
import { formatDateLabel } from '../schedule/api'
import { formatTime12 } from '../../lib/format'
import { ONLINE_EXAM_STATUS_LABELS, examTokenStatus } from './api'
import {
  useCreateExamLink,
  useCreateOnlineExam,
  useDeleteOnlineExam,
  useExamAttempts,
  useExamTokens,
  useOnlineExam,
  useRevokeExamToken,
  useUpdateOnlineExam,
} from './hooks'

/** ISO → قيمة input ‏datetime-local بالتوقيت المحلي */
function toLocalInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** قيمة datetime-local → ISO (أو null عند الفراغ) */
function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * هل يدعم المتصفح فتح منتقي التاريخ برمجياً (showPicker)؟ يُحسب مرة
 * واحدة: عند غيابه يرسم DateTimeField الحقل الأصلي المرئي كما كان قبل
 * 3A-384 — فلا بيئة تفقد القدرة على الضبط أبداً (شرط مراجعة B1).
 */
const SHOW_PICKER_SUPPORTED =
  typeof HTMLInputElement !== 'undefined' &&
  'showPicker' in HTMLInputElement.prototype

/**
 * حقل تاريخ+وقت بعرض عربي (3A-384 — ملاحظة المالك ٥-ط: الحقل الأصلي
 * كان يعرض «11/21/2026,» بصيغة المتصفح الأجنبية): زر يعرض القيمة
 * منسّقة عربياً (نفس نمط منتقي تاريخ الحضور) وحقل datetime-local
 * مخفي بصرياً يُفتح بـ showPicker — حالة القيمة وسلسلتها لم تتغيرا.
 * الحقلان اختياريان، فعند وجود قيمة يظهر زر مسح صغير يعيدها فارغة
 * (منتقي datetime-local الأصلي لا زر مسح فيه — شرط مراجعة B1)،
 * وعند غياب showPicker يبقى الحقل الأصلي المرئي قابلاً للتحرير.
 */
function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const openPicker = () => {
    const el = inputRef.current as
      | (HTMLInputElement & { showPicker?: () => void })
      | null
    if (!el) return
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker()
        return
      } catch {
        /* تابع للبديل */
      }
    }
    el.focus()
    el.click()
  }
  if (!SHOW_PICKER_SUPPORTED) {
    return (
      <Field label={label}>
        <TextInput
          type="datetime-local"
          dir="ltr"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </Field>
    )
  }
  const [datePart, timePart] = value ? value.split('T') : ['', '']
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={openPicker}
          aria-label={label}
          className={`w-full flex items-center gap-2 border border-border rounded-xl px-3 min-h-[52px] bg-card text-text cursor-pointer ${
            value ? 'pe-11' : ''
          }`}
        >
          <CalendarClock size={19} className="text-primary shrink-0" />
          <span
            className={`flex-1 text-start font-semibold text-[14px] ${
              value ? '' : 'text-muted'
            }`}
          >
            {value
              ? `${formatDateLabel(datePart)} · ${formatTime12(timePart || '00:00')}`
              : t('exams.panelDateTimePlaceholder')}
          </span>
        </button>
        <input
          ref={inputRef}
          type="datetime-local"
          value={value}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 w-full opacity-0 pointer-events-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={t('exams.panelClearDateTime')}
            title={t('exams.panelClearDateTime')}
            className="absolute end-1.5 top-1/2 -translate-y-1/2 w-9 h-9 flex items-center justify-center bg-transparent border-0 cursor-pointer text-muted"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </Field>
  )
}

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: t('exams.panelAttemptInProgress'),
  submitted: t('exams.panelAttemptSubmitted'),
  expired: t('exams.panelAttemptExpired'),
}

/**
 * لوحة الامتحان الإلكتروني داخل شاشة التقييم (Phase 3 خطوة 4):
 * تحويل التقييم لامتحان إلكتروني، ضبط إعداداته (النشر/المؤقّت/حد
 * المحاولات/نافذة الإتاحة/مراجعة الإجابات/الخلط)، توليد رابط الامتحان
 * ونسخه (الهاش فقط في القاعدة — الرابط الخام يظهر هنا مرة واحدة)،
 * وقائمة محاولات الطلاب ونتائجهم مع تمييز المحاولة المُرحَّلة درجتها
 * إلى scores. الأسئلة نفسها تُدار من «الأسئلة» القائمة — القابلة
 * للتصحيح التلقائي هي الاختيارية ذات الإجابة الصحيحة فقط.
 */
export function OnlineExamPanel({
  teacherId,
  assessment,
  gradableCount,
  questionsTotal,
}: {
  teacherId: string
  assessment: AssessmentRow
  /** عدد الأسئلة القابلة للتصحيح التلقائي في بنك التقييم */
  gradableCount: number
  /** مجموع درجات كل أسئلة البنك (لتنبيه عدم تطابق النهائية) */
  questionsTotal: number
}) {
  const toast = useToast()
  const examQ = useOnlineExam(teacherId, assessment.id)
  const exam = examQ.data ?? null
  const createMut = useCreateOnlineExam(teacherId)

  if (examQ.isPending) return <Skeleton className="h-[92px] mb-3" />
  if (examQ.isError) return null

  if (!exam) {
    return (
      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="font-bold text-[16px] flex items-center gap-2">
              <MonitorSmartphone size={22} className="text-primary" />
              {t('exams.panelConvertTitle')}
            </div>
            <p className="text-muted text-[13.5px] mt-1 mb-0">
              {gradableCount > 0
                ? t('exams.panelConvertWithQuestions', { count: gradableCount, total: fmtScore(questionsTotal) })
                : t('exams.panelConvertNoQuestions')}
            </p>
          </div>
          <Button
            disabled={createMut.isPending || gradableCount === 0}
            onClick={() =>
              createMut.mutate(
                { assessmentId: assessment.id, groupId: assessment.group_id },
                {
                  onSuccess: () => toast(t('exams.panelCreateSuccessToast')),
                  onError: () => toast(t('exams.panelCreateErrorToast')),
                },
              )
            }
          >
            <Globe size={20} />
            {createMut.isPending ? t('exams.panelCreating') : t('exams.panelConvertAction')}
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <OnlineExamSettings
      key={exam.id + exam.updated_at}
      teacherId={teacherId}
      examId={exam.id}
      initial={{
        status: exam.status,
        duration_minutes: exam.duration_minutes,
        max_attempts: exam.max_attempts,
        starts_at: exam.starts_at,
        ends_at: exam.ends_at,
        allow_review: exam.allow_review,
        shuffle_questions: exam.shuffle_questions,
        shuffle_options: exam.shuffle_options,
      }}
      gradableCount={gradableCount}
    />
  )
}

function OnlineExamSettings({
  teacherId,
  examId,
  initial,
  gradableCount,
}: {
  teacherId: string
  examId: string
  initial: OnlineExamInput
  gradableCount: number
}) {
  const toast = useToast()
  const [status, setStatus] = useState<OnlineExamStatus>(initial.status)
  const [duration, setDuration] = useState(
    initial.duration_minutes != null ? String(initial.duration_minutes) : '',
  )
  const [maxAttempts, setMaxAttempts] = useState(String(initial.max_attempts))
  const [startsAt, setStartsAt] = useState(toLocalInput(initial.starts_at))
  const [endsAt, setEndsAt] = useState(toLocalInput(initial.ends_at))
  const [allowReview, setAllowReview] = useState(initial.allow_review)
  const [shuffleQ, setShuffleQ] = useState(initial.shuffle_questions)
  const [shuffleO, setShuffleO] = useState(initial.shuffle_options)
  const [freshLink, setFreshLink] = useState<string | null>(null)

  const updateMut = useUpdateOnlineExam(teacherId)
  const deleteMut = useDeleteOnlineExam(teacherId)
  const linkMut = useCreateExamLink(teacherId)
  const revokeMut = useRevokeExamToken(teacherId)
  const tokensQ = useExamTokens(teacherId, examId)
  const attemptsQ = useExamAttempts(teacherId, examId)

  const tokens = tokensQ.data ?? []
  const activeToken = tokens.find((t) => examTokenStatus(t) === 'active')
  const attempts = attemptsQ.data ?? []
  const submitted = attempts.filter((a) => a.status === 'submitted')

  const durationNum = duration.trim() === '' ? null : parseInt(duration, 10)
  const attemptsNum = parseInt(maxAttempts, 10)
  const valid =
    (durationNum == null || (Number.isFinite(durationNum) && durationNum > 0)) &&
    Number.isFinite(attemptsNum) &&
    attemptsNum >= 1 &&
    (!startsAt || !endsAt || endsAt > startsAt)

  // إعادة جلب المحاولات دورياً خفيفاً أثناء فتح الشاشة (نتائج حية تقريباً)
  // (3A-377) refetch مقصود لاستعلام واحد: إبطال بادئة 'exams' كل 30 ثانية
  // كان سيعيد جلب تفاصيل الامتحان والتوكنات أيضاً بلا فائدة.
  useEffect(() => {
    const t = setInterval(() => void attemptsQ.refetch(), 30_000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const buildInput = (): OnlineExamInput => ({
    status,
    duration_minutes: durationNum,
    max_attempts: attemptsNum,
    starts_at: fromLocalInput(startsAt),
    ends_at: fromLocalInput(endsAt),
    allow_review: allowReview,
    shuffle_questions: shuffleQ,
    shuffle_options: shuffleO,
  })

  return (
    <Card>
      <div className="font-bold text-[16px] flex flex-wrap items-center gap-2 mb-1">
        <MonitorSmartphone size={22} className="text-primary" />
        {t('exams.panelSettingsTitle')}
        <span
          className={`whitespace-nowrap shrink-0 text-[12px] font-bold rounded-full px-2.5 py-1 ${
            status === 'published'
              ? 'bg-ok-soft text-ok-text border border-ok/30'
              : status === 'closed'
                ? 'bg-bad-soft text-bad-text border border-bad/30'
                : 'bg-soft text-muted border border-border'
          }`}
        >
          {ONLINE_EXAM_STATUS_LABELS[status]}
        </span>
      </div>
      <p className="text-muted text-[13.5px] mt-0">
        {t('exams.panelSettingsIntro', { count: gradableCount })}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('exams.panelStatusLabel')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value as OnlineExamStatus)}>
            {(Object.keys(ONLINE_EXAM_STATUS_LABELS) as OnlineExamStatus[]).map((s) => (
              <option key={s} value={s}>
                {ONLINE_EXAM_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('exams.panelMaxAttemptsLabel')}>
          <TextInput
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            dir="ltr"
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(e.target.value)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('exams.panelDurationLabel')}>
          <TextInput
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            dir="ltr"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={t('exams.panelDurationPlaceholder')}
          />
        </Field>
        <Field label={t('exams.panelReviewLabel')}>
          <Select value={allowReview ? 'yes' : 'no'} onChange={(e) => setAllowReview(e.target.value === 'yes')}>
            <option value="no">{t('exams.panelReviewNo')}</option>
            <option value="yes">{t('exams.panelReviewYes')}</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <DateTimeField
          label={t('exams.panelStartsAtLabel')}
          value={startsAt}
          onChange={setStartsAt}
        />
        <DateTimeField
          label={t('exams.panelEndsAtLabel')}
          value={endsAt}
          onChange={setEndsAt}
        />
      </div>
      <div className="flex gap-4 flex-wrap mb-3">
        <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer min-h-[48px]">
          <input
            type="checkbox"
            checked={shuffleQ}
            onChange={(e) => setShuffleQ(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
          {t('exams.panelShuffleQuestions')}
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer min-h-[48px]">
          <input
            type="checkbox"
            checked={shuffleO}
            onChange={(e) => setShuffleO(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
          {t('exams.panelShuffleOptions')}
        </label>
      </div>
      {startsAt && endsAt && endsAt <= startsAt && (
        <p className="text-warn-text text-[13.5px] font-semibold">
          {t('exams.panelWindowOrderWarning')}
        </p>
      )}
      {updateMut.isError && (
        <FormError
          message={updateMut.error instanceof Error ? updateMut.error.message : t('exams.panelUnexpectedError')}
        />
      )}
      <Button
        full
        disabled={updateMut.isPending || !valid}
        onClick={() =>
          updateMut.mutate(
            { examId, input: buildInput() },
            {
              onSuccess: () => toast(t('exams.panelSaveSuccessToast')),
              onError: () => toast(t('exams.panelSaveErrorToast')),
            },
          )
        }
      >
        <Check size={20} />
        {updateMut.isPending ? t('exams.panelSaving') : t('exams.panelSaveAction')}
      </Button>

      {/* رابط الامتحان */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="font-bold text-[15px] mb-1.5 flex items-center gap-2">
          <Link2 size={19} className="text-primary" />
          {t('exams.panelLinkTitle')}
        </div>
        {freshLink ? (
          <div className="bg-soft rounded-xl px-3 py-2.5 mb-2">
            <div className="text-[13.5px] font-semibold mb-1">
              {t('exams.panelFreshLinkNote')}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 min-w-0 truncate text-[12.5px]" dir="ltr">
                {freshLink}
              </code>
              <Button
                variant="soft"
                className="min-h-[48px] px-3 shrink-0"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(freshLink)
                    .then(() => toast(t('exams.panelCopyLinkToast')))
                    .catch(() => toast(t('common.copyUnavailable')))
                }
              >
                <Copy size={18} />
                {t('exams.panelCopy')}
              </Button>
            </div>
          </div>
        ) : activeToken ? (
          <p className="text-muted text-[13.5px] mt-0">
            {t('exams.panelActiveTokenPre', { created: new Date(activeToken.created_at).toLocaleDateString('ar-EG') })}
            {activeToken.last_used_at
              ? t('exams.panelTokenLastUsed', { date: new Date(activeToken.last_used_at).toLocaleString('ar-EG') })
              : t('exams.panelTokenNeverUsed')}
            {t('exams.panelActiveTokenPost')}
          </p>
        ) : (
          <p className="text-muted text-[13.5px] mt-0">
            {t('exams.panelNoLinkYet')}
          </p>
        )}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="soft"
            disabled={linkMut.isPending}
            onClick={() =>
              linkMut.mutate(
                { examId, endsAt: fromLocalInput(endsAt) },
                {
                  onSuccess: (res) => {
                    setFreshLink(res.link)
                    toast(t('exams.panelGenerateSuccessToast'))
                  },
                  onError: () => toast(t('exams.panelGenerateErrorToast')),
                },
              )
            }
          >
            <Link2 size={19} />
            {linkMut.isPending ? t('exams.panelGenerating') : activeToken || freshLink ? t('exams.panelRegenerateLink') : t('exams.panelGenerateLink')}
          </Button>
          {activeToken && !freshLink && (
            <Button
              variant="ghost"
              disabled={revokeMut.isPending}
              onClick={() => {
                if (window.confirm(t('exams.panelRevokeConfirm'))) {
                  revokeMut.mutate(activeToken.id, {
                    onSuccess: () => toast(t('exams.panelRevokeSuccessToast')),
                    onError: () => toast(t('exams.panelRevokeErrorToast')),
                  })
                }
              }}
            >
              <Link2Off size={19} />
              {t('exams.panelRevokeAction')}
            </Button>
          )}
        </div>
      </div>

      {/* نتائج ومحاولات الطلاب */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-bold text-[15px]">
            {t('exams.panelAttemptsTitle', { count: attempts.length })}
            {submitted.length > 0 ? t('exams.panelAttemptsSubmittedSuffix', { count: submitted.length }) : ''}
          </span>
          {/* (3A-377) تحديث يدوي لاستعلام المحاولات وحده — إبطال 'exams'
              كان سيعيد جلب تفاصيل الامتحان والتوكنات أيضاً. */}
          <Button
            variant="ghost"
            className="min-h-[48px] text-[13.5px] px-3"
            onClick={() => void attemptsQ.refetch()}
          >
            {t('exams.panelRefresh')}
          </Button>
        </div>
        {attemptsQ.isPending ? (
          <Skeleton className="h-[56px]" />
        ) : attempts.length === 0 ? (
          <p className="text-muted text-[13.5px] mb-0">
            {t('exams.panelNoAttempts')}
          </p>
        ) : (
          <div>
            {attempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-2 py-2 border-b border-border/60 last:border-0 flex-wrap"
              >
                <div className="flex-1 min-w-[140px]">
                  <div className="font-semibold text-[14.5px]">
                    {a.student_name}
                    <span className="text-muted text-[12px] font-bold" dir="ltr">
                      {' '}
                      {a.student_code}
                    </span>
                  </div>
                  <div className="text-muted text-[12px]">
                    {t('exams.panelAttemptLine', { no: a.attempt_no, started: new Date(a.started_at).toLocaleString('ar-EG') })}
                    {a.submitted_at
                      ? t('exams.panelAttemptSubmittedPart', { date: new Date(a.submitted_at).toLocaleString('ar-EG') })
                      : ''}
                  </div>
                </div>
                <span className="text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2.5 py-1">
                  {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                </span>
                {a.status === 'submitted' && a.score != null && (
                  <span className="text-[13.5px] font-extrabold">
                    {t('exams.panelScoreLine', { score: fmtScore(a.score), max: fmtScore(a.max_score ?? 0), pct: a.pct != null ? `${Math.round(a.pct)}%` : '' })}
                  </span>
                )}
                {a.score_posted && (
                  <span className="text-[12px] font-bold bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                    <Check size={14} />
                    {t('exams.panelScorePosted')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <Button
          full
          variant="danger"
          disabled={deleteMut.isPending}
          onClick={() => {
            if (
              window.confirm(
                t('exams.panelDeleteConfirm'),
              )
            ) {
              deleteMut.mutate(examId, {
                onSuccess: () => toast(t('exams.panelDeleteSuccessToast')),
                onError: () => toast(t('exams.panelDeleteErrorToast')),
              })
            }
          }}
        >
          <Trash2 size={20} />
          {deleteMut.isPending ? t('exams.panelDeleting') : t('exams.panelDeleteAction')}
        </Button>
      </div>
    </Card>
  )
}
