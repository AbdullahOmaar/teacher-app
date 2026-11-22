import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlarmClock,
  CheckCircle2,
  ClipboardList,
  Link2Off,
  RotateCcw,
  Send,
  Timer,
  Trophy,
  XCircle,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, TextInput } from '../../components/ui/form'
import { SkeletonCards } from '../../components/ui/states'
import { PublicPageShell } from '../../components/PublicPageShell'
import { t } from '../../i18n'
import { fmtScore } from '../grades/api'
import {
  examErrorInfo,
  type ExamBrand,
  type ExamStartResult,
  type ExamSubmitResult,
} from './api'
import { useExamInfo, useStartExamAttempt, useSubmitExamAttempt } from './hooks'

/**
 * صفحة الامتحان الإلكتروني العامة — Phase 3 خطوة 4 (migration ‏0010).
 *
 * صفحة عامة بلا جلسة وبلا AppShell: الاعتماد هو رابط الامتحان الموقّع
 * (/exam?t=<rawToken>) + كود الطالب (public_code) عند الدخول. كل
 * التواصل عبر RPC ‏security definer بالتوكن فقط — لا قراءة مباشرة لأي
 * جدول. الأسئلة تصل في لقطة عرض مخلوطة لكل محاولة بلا أي إجابة صحيحة،
 * والتصحيح خادمي بالكامل عند التسليم، فالنتيجة المعروضة هنا هي ما
 * حسبه الخادم ورحّله لدرجات الطالب.
 *
 * المؤقّت: العدّاد من deadline_at الذي يحسبه الخادم من وقت البدء،
 * وعند صفره يُسلَّم تلقائياً — والخادم يتحقق من الوقت بنفسه أيضاً
 * (سماحية 60 ثانية) فتلاعب ساعة الجهاز لا يمدّ المهلة.
 */

function ExamShell({
  children,
  brand,
  title,
}: {
  children: React.ReactNode
  brand?: ExamBrand | null
  title?: string
}) {
  // (COD-5: الصدفة نفسها مشتركة في PublicPageShell — الفروق المحفوظة
  // هنا: العنوان الفرعي هو عنوان الامتحان نفسه (يُقصّ truncate) وبلا دُفّي.)
  return (
    <PublicPageShell
      brand={brand}
      logoAlt={t('exams.pageLogoAlt')}
      fallbackTitle={t('exams.pageShellFallbackTitle')}
      subtitle={title ?? null}
      subtitleTruncate
    >
      {children}
    </PublicPageShell>
  )
}

function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

function answersStorageKey(attemptId: string): string {
  return `teacher-app-exam-answers-${attemptId}`
}

function loadSavedAnswers(attemptId: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(answersStorageKey(attemptId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, string>
  } catch {
    return {}
  }
}

export function ExamPage() {
  const [searchParams] = useSearchParams()
  const rawToken = searchParams.get('t') ?? searchParams.get('token')

  const infoQ = useExamInfo(rawToken)
  const startMut = useStartExamAttempt(rawToken)
  const submitMut = useSubmitExamAttempt(rawToken)

  const [code, setCode] = useState('')
  const [attempt, setAttempt] = useState<ExamStartResult | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<ExamSubmitResult | null>(null)
  // فشل التسليم التلقائي عند انتهاء الوقت (PAT-2): يحتاج لافتة بارزة
  // أعلى الشاشة — خطأ أسفل صفحة طويلة لا يراه الطالب والمؤقّت صفر
  const [autoSubmitFailed, setAutoSubmitFailed] = useState(false)
  const [nowMs, setNowMs] = useState(() => Date.now())
  const autoSubmittedRef = useRef<string | null>(null)

  const deadlineMs = attempt?.deadline_at ? new Date(attempt.deadline_at).getTime() : null
  const remainingMs = deadlineMs != null ? deadlineMs - nowMs : null

  // عدّاد المؤقّت — يحدّث كل ثانية أثناء المحاولة فقط
  useEffect(() => {
    if (!attempt || result || deadlineMs == null) return
    const t = setInterval(() => setNowMs(Date.now()), 500)
    return () => clearInterval(t)
  }, [attempt, result, deadlineMs])

  const doSubmit = (auto: boolean) => {
    if (!attempt || submitMut.isPending) return
    if (!auto) {
      const unanswered = attempt.presentation.filter((q) => !answers[q.id]).length
      const msg =
        unanswered > 0
          ? t('exams.pageConfirmUnanswered', { count: unanswered })
          : t('exams.pageConfirmSubmit')
      if (!window.confirm(msg)) return
    }
    submitMut.mutate(
      { attemptId: attempt.attempt_id, answers },
      {
        onError: () => {
          // الإجابات محفوظة محلياً فلا ضياع؛ التسليم اليدوي يظل متاحاً
          // كإعادة محاولة، والتلقائي الفاشل يرفع لافتة بارزة (PAT-2)
          if (auto) setAutoSubmitFailed(true)
        },
        onSuccess: (res) => {
          setAutoSubmitFailed(false)
          setResult(res)
          try {
            localStorage.removeItem(answersStorageKey(attempt.attempt_id))
          } catch {
            // تجاهل: التخزين المحلي غير متاح
          }
        },
      },
    )
  }

  // تسليم تلقائي عند انتهاء المؤقّت (مرة واحدة لكل محاولة)
  useEffect(() => {
    if (!attempt || result || remainingMs == null) return
    if (remainingMs > 0) return
    if (autoSubmittedRef.current === attempt.attempt_id) return
    autoSubmittedRef.current = attempt.attempt_id
    doSubmit(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingMs, attempt, result])

  const beginWithCode = (studentCode: string) => {
    startMut.mutate(studentCode.trim(), {
      onSuccess: (res) => {
        setAttempt(res)
        setResult(null)
        autoSubmittedRef.current = null
        // استئناف محاولة جارية يستعيد إجابات هذا الجهاز إن وُجدت
        setAnswers(loadSavedAnswers(res.attempt_id))
        setNowMs(Date.now())
      },
    })
  }

  const answeredCount = useMemo(
    () => (attempt ? attempt.presentation.filter((q) => answers[q.id]).length : 0),
    [attempt, answers],
  )

  if (!rawToken) {
    return (
      <ExamShell>
        <Card className="text-center py-8">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
            <Link2Off size={28} />
          </div>
          <div className="type-section mb-1">{t('exams.pageIncompleteLinkTitle')}</div>
          <p className="text-muted type-secondary mb-0">
            {t('exams.pageIncompleteLinkHint')}
          </p>
        </Card>
      </ExamShell>
    )
  }

  if (infoQ.isPending) {
    return (
      <ExamShell>
        <SkeletonCards cards={2} />
      </ExamShell>
    )
  }

  if (infoQ.isError || !infoQ.data) {
    const info = examErrorInfo(infoQ.error)
    return (
      <ExamShell>
        <Card className="text-center py-8">
          <div className="mx-auto mb-3 w-14 h-14 rounded-full bg-soft text-primary flex items-center justify-center">
            <Link2Off size={28} />
          </div>
          <div className="type-section mb-1">{info.title}</div>
          <p className="text-muted type-secondary mb-0">{info.hint}</p>
        </Card>
      </ExamShell>
    )
  }

  const info = infoQ.data
  const brand = info.brand

  // ------------------------------------------------------------------
  // شاشة النتيجة
  // ------------------------------------------------------------------
  if (result && attempt) {
    const reviewByQ = new Map((result.review ?? []).map((r) => [r.question_id, r]))
    return (
      <ExamShell brand={brand} title={info.title}>
        <Card className="rise-in text-center py-6">
          <div
            className={`mx-auto mb-3 w-16 h-16 rounded-full flex items-center justify-center ${
              result.passed ? 'bg-ok-soft text-ok-text' : 'bg-bad-soft text-bad-text'
            }`}
          >
            {result.passed ? <Trophy size={32} /> : <ClipboardList size={32} />}
          </div>
          <div className="text-[19px] font-extrabold mb-1">
            {result.passed ? t('exams.pageResultPassed') : t('exams.pageResultDone')}
          </div>
          <p className="text-muted text-[13.5px] mt-0">
            {t('exams.pageResultAttemptLine', { name: attempt.student_name, no: result.attempt_no })}
            {result.already_submitted ? t('exams.pageResultAlreadySuffix') : ''}
          </p>
          <div className="text-[34px] font-extrabold leading-[1.3]" dir="ltr">
            {fmtScore(result.score)} / {fmtScore(result.max_score)}
          </div>
          <div
            className={`inline-block text-[15px] font-extrabold rounded-full px-3.5 py-1.5 text-white ${
              result.passed ? 'bg-ok-text' : 'bg-bad-text'
            }`}
          >
            {Math.round(result.pct)}%
          </div>
          <p className="text-muted text-[13.5px] mt-3 mb-0">
            {t('exams.pageResultRecordedNote')}
          </p>
          {result.attempts_left > 0 && (
            <Button
              full
              className="mt-4"
              disabled={startMut.isPending}
              onClick={() => beginWithCode(code)}
            >
              <RotateCcw size={18} />
              {startMut.isPending
                ? t('exams.pageStarting')
                : t('exams.pageRetryAttempt', { left: result.attempts_left, max: info.max_attempts })}
            </Button>
          )}
          {startMut.isError && (
            <FormError
              message={examErrorInfo(startMut.error).hint}
            />
          )}
        </Card>

        {result.review && result.review.length > 0 && (
          <>
            <h3 className="type-section mt-5 mb-2">{t('exams.pageReviewTitle')}</h3>
            <Card className="rise-in p-0 overflow-hidden" style={{ animationDelay: '50ms' }}>
              {attempt.presentation.map((q, i) => {
                const rev = reviewByQ.get(q.id)
                if (!rev) return null
                return (
                  <div
                    key={q.id}
                    className={`px-[14px] py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                  >
                    <div className="font-bold text-[15px]">
                      {t('exams.pageQuestionLine', { num: i + 1, text: q.text })}
                    </div>
                    <div className="text-[13.5px] mt-1.5 flex flex-col gap-1">
                      <span
                        className={`inline-flex items-center gap-1.5 font-semibold ${
                          rev.is_correct ? 'text-ok-text' : 'text-bad-text'
                        }`}
                      >
                        {rev.is_correct ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                        {t('exams.pageYourAnswer', { answer: rev.chosen ?? t('exams.pageNoAnswer') })}
                      </span>
                      {!rev.is_correct && rev.correct_answer && (
                        <span className="text-ok-text font-semibold">
                          {t('exams.pageCorrectAnswer', { answer: rev.correct_answer })}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </Card>
          </>
        )}
      </ExamShell>
    )
  }

  // ------------------------------------------------------------------
  // شاشة حل الامتحان
  // ------------------------------------------------------------------
  if (attempt) {
    const total = attempt.presentation.length
    const lowTime = remainingMs != null && remainingMs <= 60_000
    return (
      <ExamShell brand={brand} title={attempt.exam_title}>
        <div className="sticky top-[52px] z-10 -mx-4 px-4 py-2 bg-bg/95 backdrop-blur border-b border-border mb-3">
          <div className="max-w-[640px] mx-auto flex items-center justify-between gap-2">
            <span className="flex-1 min-w-0 text-[13.5px] font-bold truncate">
              {t('exams.pageAttemptHeader', { name: attempt.student_name, no: attempt.attempt_no })}
            </span>
            {remainingMs != null ? (
              <span
                className={`shrink-0 inline-flex items-center gap-1.5 text-[15px] font-extrabold rounded-full px-3 py-1 ${
                  lowTime ? 'bg-bad text-white' : 'bg-soft text-primary'
                }`}
                dir="ltr"
              >
                <Timer size={18} />
                {fmtCountdown(remainingMs)}
              </span>
            ) : (
              <span className="shrink-0 text-[12px] font-bold bg-soft text-muted rounded-full px-2.5 py-1">
                {t('exams.pageNoTimer')}
              </span>
            )}
          </div>
          <div className="max-w-[640px] mx-auto flex items-center gap-2 mt-2">
            <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${total > 0 ? Math.round((answeredCount / total) * 100) : 0}%` }}
              />
            </div>
            <span className="text-[12px] font-bold text-muted">
              {t('exams.pageAnsweredProgress', { answered: answeredCount, total })}
            </span>
          </div>
        </div>

        {autoSubmitFailed && (
          <p
            role="alert"
            className="flex items-start gap-2 bg-bad-soft text-bad-text text-[13.5px] font-bold rounded-xl px-3 py-2.5 mb-3 mt-0"
          >
            <XCircle size={18} className="shrink-0 mt-0.5" />
            <span>{t('exams.pageAutoSubmitFailed')}</span>
          </p>
        )}

        {attempt.resumed && (
          <p className="flex items-start gap-2 bg-warn-soft text-warn-text text-[13.5px] font-semibold rounded-xl px-3 py-2.5 mb-3 mt-0">
            <AlarmClock size={18} className="shrink-0 mt-0.5" />
            <span>{t('exams.pageResumedNote')}</span>
          </p>
        )}

        {attempt.presentation.map((q, i) => (
          <Card key={q.id} className="rise-in" style={{ animationDelay: `${Math.min(i, 4) * 50}ms` }}>
            <div className="font-bold text-[16px] leading-[1.7]">
              {t('exams.pageQuestionLine', { num: i + 1, text: q.text })}
              <span className="text-muted text-[12px] font-bold"> {t('exams.pageQuestionPoints', { points: fmtScore(q.points) })}</span>
            </div>
            <div className="flex flex-col gap-2 mt-3">
              {q.options.map((opt) => {
                const selected = answers[q.id] === opt
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      const next = { ...answers, [q.id]: opt }
                      setAnswers(next)
                      try {
                        localStorage.setItem(
                          answersStorageKey(attempt.attempt_id),
                          JSON.stringify(next),
                        )
                      } catch {
                        // تجاهل: التخزين المحلي غير متاح
                      }
                    }}
                    className={`min-h-[52px] text-start rounded-xl border px-3.5 py-2.5 text-[15px] font-semibold cursor-pointer transition-colors ${
                      selected
                        ? 'bg-primary text-white border-primary'
                        : 'bg-card text-text border-border hover:border-primary'
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
          </Card>
        ))}

        {submitMut.isError && (
          <FormError message={examErrorInfo(submitMut.error).hint} />
        )}
        <Button full disabled={submitMut.isPending} onClick={() => doSubmit(false)}>
          <Send size={20} />
          {submitMut.isPending ? t('exams.pageSubmitting') : t('exams.pageSubmitExam')}
        </Button>
        <p className="text-center text-muted text-[12px] mt-3 mb-0">
          {t('exams.pageSubmitFooter')}
        </p>
      </ExamShell>
    )
  }

  // ------------------------------------------------------------------
  // شاشة الدخول: وصف الامتحان + كود الطالب
  // ------------------------------------------------------------------
  const windowNote =
    info.status !== 'published'
      ? t('exams.pageNotPublished')
      : info.starts_at && new Date(info.starts_at).getTime() > Date.now()
        ? t('exams.pageStartsAt', { date: new Date(info.starts_at).toLocaleString('ar-EG') })
        : info.ends_at && new Date(info.ends_at).getTime() <= Date.now()
          ? t('exams.pageWindowClosed')
          : null

  return (
    <ExamShell brand={brand} title={info.title}>
      <Card className="rise-in">
        <div className="text-[19px] font-extrabold leading-[1.7]">{info.title}</div>
        <div className="text-muted text-[13.5px] mt-0.5">
          {info.group_name ? t('exams.pageGroupPrefix', { name: info.group_name }) : ''}
          {t('exams.pageQuestionsSummary', { count: info.questions_count, total: fmtScore(info.total_points) })}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2.5 py-1">
            {info.duration_minutes
              ? t('exams.pageDurationChip', { duration: info.duration_minutes })
              : t('exams.pageNoTimeLimit')}
          </span>
          <span className="text-[12px] font-bold bg-soft text-primary border border-primary/30 rounded-full px-2.5 py-1">
            {t('exams.pageAttemptsChip', { count: info.max_attempts })}
          </span>
          {info.ends_at && (
            <span className="text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2.5 py-1">
              {t('exams.pageDeadlineChip', { date: new Date(info.ends_at).toLocaleString('ar-EG') })}
            </span>
          )}
        </div>
        <p className="text-muted text-[13.5px] mt-3 mb-0">
          {t('exams.pageIntroNote')}
        </p>
      </Card>

      <Card>
        {windowNote ? (
          <p className="flex items-start gap-2 bg-warn-soft text-warn-text text-[14px] font-semibold rounded-xl px-3 py-2.5 mb-0 mt-0">
            <AlarmClock size={19} className="shrink-0 mt-0.5" />
            <span>{windowNote}</span>
          </p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (code.trim()) beginWithCode(code)
            }}
          >
            <Field label={t('exams.pageCodeLabel')}>
              <TextInput
                dir="ltr"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder={t('exams.pageCodePlaceholder')}
                autoComplete="off"
                className="text-center tracking-widest font-bold"
              />
            </Field>
            {startMut.isError && (
              <FormError message={examErrorInfo(startMut.error).hint} />
            )}
            <Button full type="submit" disabled={startMut.isPending || !code.trim()}>
              <ClipboardList size={20} />
              {startMut.isPending ? t('exams.pageStarting') : t('exams.pageStartExam')}
            </Button>
          </form>
        )}
      </Card>

      <p className="text-center text-muted text-[12px] mt-5 mb-0">
        {t('exams.pageFooterNote')}
      </p>
    </ExamShell>
  )
}
