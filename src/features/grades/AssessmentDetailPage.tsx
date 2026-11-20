import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Card } from '../../components/ui/Card'
import { useToast } from '../../components/ui/toast'
import { Button } from '../../components/ui/Button'
import {
  AlertTriangle,
  Check,
  ListChecks,
  MessageCircle,
  NotebookPen,
  Pencil,
  Printer,
  Save,
  Trophy,
  Users,
} from 'lucide-react'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState, LoadingState, NoTeacherProfile, SignInRequired, Skeleton } from '../../components/ui/states'
import { useCurrentTeacher } from '../../hooks/useCurrentTeacher'
import { formatDateLabel } from '../schedule/api'
import { useGuardianContacts, useSessionRoster } from '../attendance/hooks'
import { useGroups } from '../groups/hooks'
import {
  ASSESSMENT_TYPE_LABELS,
  TONE_BADGE,
  fmtScore,
  pctOf,
  pctTone,
  scoreWaUrl,
  type ScoreEntry,
} from './api'
import {
  useAssessment,
  useAssessmentScores,
  useQuestions,
  useSaveScores,
  useSyncAssessmentMax,
} from './hooks'
import { AssessmentFormSheet, ExamBuilderSheet, ExamSheetSheet } from './sheets'
import { OnlineExamPanel } from '../exams/OnlineExamPanel'

/** شارة رتبة لوحة الشرف: دائرة مرقّمة (الأول بلون اللهجة الكهرمانية) بدل ميداليات الإيموجي */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[13.5px] font-extrabold shrink-0 ${
        rank === 1 ? 'bg-accent text-white' : 'bg-soft text-primary'
      }`}
    >
      {rank}
    </span>
  )
}

/**
 * تفاصيل الامتحان (المواصفات §3.11): شريط ملخص (المجموعة والتاريخ وعدّاد
 * التقدّم وشارتا الناجحين وأقل من 50%)، تنبيه عدم تطابق مجموع درجات
 * الأسئلة مع النهائية وزر المزامنة (§5.7)، إدخال درجات سريع لطلاب
 * المجموعة المسجلين النشطين — الحقل يُحفظ عند مغادرته أو بـ Enter الذي
 * ينقل للحقل التالي، وزر «حفظ كل الدرجات» يحفظ جماعياً بـ upsert على
 * مفتاح scores الأساسي (assessment_id, student_id) — مع شارة نسبة فورية
 * لكل طالب، ورابط إرسال الدرجة لولي الأمر (§5.6)، ولوحة شرف لأعلى 3.
 */
export function AssessmentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const teacher = useCurrentTeacher()
  const teacherId = teacher.status === 'ready' ? teacher.teacherId : undefined

  const toast = useToast()
  const [editOpen, setEditOpen] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  const assessmentQ = useAssessment(teacherId, id)
  const assessment = assessmentQ.data ?? null
  const rosterQ = useSessionRoster(teacherId, assessment?.group_id)
  const roster = useMemo(() => rosterQ.data ?? [], [rosterQ.data])
  const studentIds = useMemo(() => roster.map((s) => s.id), [roster])
  const contactsQ = useGuardianContacts(teacherId, studentIds)
  const scoresQ = useAssessmentScores(teacherId, id)
  const questionsQ = useQuestions(teacherId, id)
  const questions = useMemo(() => questionsQ.data ?? [], [questionsQ.data])
  const groupsQ = useGroups(teacherId)

  const saveMut = useSaveScores(teacherId ?? '')
  const syncMut = useSyncAssessmentMax(teacherId ?? '')

  // مسودات الإدخال المحلية لهذا التقييم فقط: النص الخام لكل طالب كما كتبه
  // المدرس؛ القيمة الفعّالة = المسودة إن وُجدت وإلا درجة القاعدة.
  const [draftState, setDraftState] = useState<{
    assessmentId: string
    values: Map<string, string>
  } | null>(null)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const serverMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const row of scoresQ.data ?? []) m.set(row.student_id, row.score)
    return m
  }, [scoresQ.data])

  if (teacher.status === 'loading') return <LoadingState />
  if (teacher.status === 'signed-out') return <SignInRequired />
  if (teacher.status === 'no-teacher') return <NoTeacherProfile />
  if (assessmentQ.isPending) return <LoadingState label="بنحمّل تفاصيل الامتحان…" />
  if (assessmentQ.isError) {
    return (
      <ErrorState
        message={assessmentQ.error instanceof Error ? assessmentQ.error.message : 'خطأ غير معروف'}
        onRetry={() => void assessmentQ.refetch()}
      />
    )
  }
  if (!assessment) {
    return (
      <EmptyState icon={NotebookPen} title="التقييم غير موجود" hint="ممكن يكون اتحذف أو الرابط غير صحيح" />
    )
  }

  const drafts =
    draftState && draftState.assessmentId === assessment.id
      ? draftState.values
      : new Map<string, string>()

  const rawOf = (studentId: string): string =>
    drafts.get(studentId) ?? (serverMap.has(studentId) ? String(serverMap.get(studentId)) : '')

  /** تحليل خام الحقل: '' = لا درجة، رقم ≥ 0 = درجة، غير ذلك = غير صالح */
  const parseRaw = (raw: string): { score: number | null; valid: boolean } => {
    const t = raw.trim()
    if (t === '') return { score: null, valid: true }
    const n = Number(t)
    return Number.isFinite(n) && n >= 0 ? { score: n, valid: true } : { score: null, valid: false }
  }

  const setDraft = (studentId: string, raw: string) => {
    setDraftState((prev) => {
      const values =
        prev && prev.assessmentId === assessment.id
          ? new Map(prev.values)
          : new Map<string, string>()
      values.set(studentId, raw)
      return { assessmentId: assessment.id, values }
    })
  }

  const changedEntries = (): ScoreEntry[] => {
    const entries: ScoreEntry[] = []
    for (const st of roster) {
      if (!drafts.has(st.id)) continue
      const { score, valid } = parseRaw(drafts.get(st.id) ?? '')
      if (!valid) continue
      const server = serverMap.get(st.id) ?? null
      if (score !== server) entries.push({ studentId: st.id, score })
    }
    return entries
  }

  const saveEntries = (entries: ScoreEntry[], successMsg?: string) => {
    if (entries.length === 0) return
    saveMut.mutate(
      { assessmentId: assessment.id, entries },
      {
        onSuccess: () => {
          // المسودات المحفوظة تسقط — القيم الفعّالة تأتي من القاعدة بعد الإبطال
          setDraftState((prev) => {
            if (!prev || prev.assessmentId !== assessment.id) return prev
            const values = new Map(prev.values)
            for (const e of entries) values.delete(e.studentId)
            return { assessmentId: assessment.id, values }
          })
          if (successMsg) toast(successMsg)
        },
        onError: () => toast('حصلت مشكلة في حفظ الدرجات — راجع القيم وحاول تاني'),
      },
    )
  }

  const saveRow = (studentId: string) => {
    if (!drafts.has(studentId)) return
    const { valid } = parseRaw(drafts.get(studentId) ?? '')
    if (!valid) {
      toast('الدرجة لازم تكون رقماً صفر أو أكبر')
      return
    }
    saveEntries(changedEntries().filter((e) => e.studentId === studentId))
  }

  // إحصاءات الملخص ولوحة الشرف — من القيم الفعّالة (مسودة صالحة أو قاعدة)
  const effective = roster.map((st) => {
    const { score, valid } = parseRaw(rawOf(st.id))
    return { student: st, score: valid ? score : (serverMap.get(st.id) ?? null) }
  })
  const scored = effective.filter((e) => e.score != null)
  const done = scored.length
  const total = roster.length
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0
  const passedCount = scored.filter((e) => (e.score ?? 0) >= assessment.pass_score).length
  const below50Count = scored.filter(
    (e) => (pctOf(e.score ?? 0, assessment.max_score) ?? 100) < 50,
  ).length
  const honor = [...scored]
    .map((e) => ({ ...e, pct: pctOf(e.score ?? 0, assessment.max_score) ?? 0 }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)

  const questionsTotal = questions.reduce((s, q) => s + q.points, 0)
  // القابلة للتصحيح التلقائي في الامتحان الإلكتروني (0010): اختيارية
  // بإجابة صحيحة وخيارين فأكثر — وسؤال صح/خطأ داخل فيها بطبيعته
  const gradableCount = questions.filter(
    (q) =>
      q.type === 'mcq' &&
      Boolean(q.correct_answer?.trim()) &&
      Array.isArray(q.options) &&
      q.options.length >= 2,
  ).length
  const maxMismatch = questions.length > 0 && questionsTotal > 0 && questionsTotal !== assessment.max_score

  const rowsReady = Boolean(scoresQ.data) && !rosterQ.isPending
  const pendingChanges = changedEntries().length

  return (
    <div>
      {/* شريط الملخص */}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-extrabold text-[16px]">{assessment.title}</div>
            <div className="text-muted text-[13.5px]">
              {ASSESSMENT_TYPE_LABELS[assessment.type]} · {assessment.group_name} ·{' '}
              {formatDateLabel(assessment.assess_date)} · النهائية {fmtScore(assessment.max_score)}{' '}
              · النجاح {fmtScore(assessment.pass_score)}
            </div>
          </div>
          <span className="shrink-0 type-badge text-muted inline-flex items-center gap-1">
            {saveMut.isPending ? (
              'بنحفظ…'
            ) : (
              <>
                <Check size={14} className="text-ok-text" />
                الحفظ عند الخروج من الحقل
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <div className="flex-1 h-2 rounded-full bg-soft overflow-hidden">
            <div
              className={`h-full rounded-full ${done >= total && total > 0 ? 'bg-ok' : 'bg-primary'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[13.5px] font-extrabold">
            {rowsReady ? `${done}/${total}` : '…'} درجة مسجلة
          </span>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className="text-[12px] font-bold bg-ok/10 text-ok-text border border-ok/30 rounded-full px-2.5 py-1">
            ناجح {passedCount}
          </span>
          <span className="text-[12px] font-bold bg-bad/10 text-bad-text border border-bad/30 rounded-full px-2.5 py-1">
            أقل من 50%: {below50Count}
          </span>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Button variant="soft" onClick={() => setBuilderOpen(true)}>
            <ListChecks size={20} />
            الأسئلة ({questions.length})
          </Button>
          <Button
            variant="soft"
            onClick={() => setSheetOpen(true)}
            disabled={questionsQ.isPending}
          >
            <Printer size={20} />
            ورقة الامتحان
          </Button>
          <Button variant="ghost" onClick={() => setEditOpen(true)}>
            <Pencil size={20} />
            تعديل بيانات الامتحان
          </Button>
        </div>
      </Card>

      {/* الامتحان الإلكتروني بتصحيح تلقائي — Phase 3 خطوة 4 */}
      {teacherId && (
        <OnlineExamPanel
          teacherId={teacherId}
          assessment={assessment}
          gradableCount={gradableCount}
          questionsTotal={questionsTotal}
        />
      )}

      {maxMismatch && (
        <div className="border border-warn/50 bg-warn/10 rounded-xl px-3 py-2.5 mb-3 text-[13.5px] flex items-center justify-between gap-2 flex-wrap">
          <span className="flex items-start gap-2">
            <AlertTriangle size={20} className="shrink-0 mt-0.5 text-warn-text" />
            <span>
              مجموع درجات الأسئلة ({fmtScore(questionsTotal)}) لا يساوي الدرجة النهائية (
              {fmtScore(assessment.max_score)}).
            </span>
          </span>
          <Button
            variant="soft"
            className="min-h-[48px] text-[13.5px] px-3"
            disabled={syncMut.isPending}
            onClick={() =>
              syncMut.mutate(
                { assessment, questionsTotal },
                {
                  onSuccess: () =>
                    toast(
                      `اتحدثت النهائية إلى ${fmtScore(questionsTotal)} ودرجة النجاح إلى ${fmtScore(Math.round(questionsTotal / 2))}`,
                    ),
                  onError: () => toast('حصلت مشكلة في المزامنة — حاول تاني'),
                },
              )
            }
          >
            تحديث الدرجة النهائية إلى {fmtScore(questionsTotal)}
          </Button>
        </div>
      )}

      {/* إدخال الدرجات السريع */}
      {rosterQ.isPending || scoresQ.isPending || !rowsReady ? (
        <>
          <Skeleton className="h-[64px] mb-3" />
          <Skeleton className="h-[64px] mb-3" />
          <Skeleton className="h-[64px]" />
        </>
      ) : rosterQ.isError || scoresQ.isError ? (
        <ErrorState
          message={
            (rosterQ.error ?? scoresQ.error) instanceof Error
              ? ((rosterQ.error ?? scoresQ.error) as Error).message
              : 'خطأ غير معروف'
          }
          onRetry={() => {
            void rosterQ.refetch()
            void scoresQ.refetch()
          }}
        />
      ) : roster.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title="لا يوجد طلاب نشطون مسجلون في مجموعة التقييم دي"
            hint="سجّل طلاباً في المجموعة من ملفاتهم أو من صفحة المجموعة، وهيظهروا هنا لإدخال درجاتهم."
          />
        </Card>
      ) : (
        <>
          <Card className="p-0 overflow-hidden">
            {roster.map((st, i) => {
              const raw = rawOf(st.id)
              const { score, valid } = parseRaw(raw)
              const effScore = valid ? score : (serverMap.get(st.id) ?? null)
              const pct = effScore != null ? pctOf(effScore, assessment.max_score) : null
              const tone = pctTone(pct, assessment)
              const wa =
                effScore != null
                  ? scoreWaUrl(st, contactsQ.data?.get(st.id), assessment, effScore)
                  : null
              return (
                <div
                  key={st.id}
                  className={`px-[14px] py-3 ${i > 0 ? 'border-t border-border' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          to={`/students/${st.id}`}
                          className="font-bold text-[15px] text-text no-underline"
                        >
                          {st.name}
                        </Link>
                        <span
                          className="text-[12px] font-bold bg-soft text-muted rounded-full px-2 py-0.5"
                          dir="ltr"
                        >
                          {st.public_code}
                        </span>
                      </div>
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary text-[13.5px] font-semibold no-underline inline-flex items-center gap-1 min-h-[48px]"
                        >
                          <MessageCircle size={18} />
                          إرسال الدرجة لولي الأمر
                        </a>
                      ) : effScore != null ? (
                        <span className="text-muted text-[12px]">
                          لا يوجد رقم ولي أمر أو موبايل طالب مسجل للإرسال
                        </span>
                      ) : null}
                    </div>
                    <span
                      className={`shrink-0 min-w-[52px] text-center text-[13.5px] font-extrabold rounded-full px-2 py-1 ${TONE_BADGE[tone]}`}
                    >
                      {pct == null ? '—' : `${pct}%`}
                    </span>
                    <div className="w-[92px] shrink-0">
                      <input
                        ref={(el: HTMLInputElement | null) => {
                          inputRefs.current[i] = el
                        }}
                        type="number"
                        min="0"
                        step="0.5"
                        inputMode="decimal"
                        dir="ltr"
                        placeholder={`من ${fmtScore(assessment.max_score)}`}
                        value={raw}
                        onChange={(e) => setDraft(st.id, e.target.value)}
                        onBlur={() => saveRow(st.id)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          const next = inputRefs.current[i + 1]
                          if (next) next.focus()
                          else e.currentTarget.blur()
                        }}
                        className={`w-full border rounded-xl px-3 min-h-[52px] bg-card text-text text-[15px] outline-none focus:border-primary ${!valid ? 'border-bad' : 'border-border'}`}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </Card>

          <Button
            full
            disabled={saveMut.isPending || pendingChanges === 0}
            onClick={() =>
              saveEntries(changedEntries(), `اتحفظت ${pendingChanges} درجة`)
            }
            className="mb-3"
          >
            {saveMut.isPending ? (
              'بنحفظ…'
            ) : (
              <>
                <Save size={20} />
                {pendingChanges > 0 ? `حفظ كل الدرجات (${pendingChanges} تعديل)` : 'كل الدرجات محفوظة'}
              </>
            )}
          </Button>
          <p className="text-muted text-[12px] mt-0 mb-3">
            الدرجة بتتحفظ تلقائياً لما تخرج من الحقل أو تدوس Enter (اللي بينقلك للي بعده)، وزر
            الحفظ اللي فوق بيحفظ أي تعديلات متبقية دفعة واحدة. مسح الحقل وحفظه بيمسح درجة الطالب.
          </p>
        </>
      )}

      {/* لوحة الشرف — أعلى 3 طلاب بالنسبة (المرجع §3.11) */}
      {honor.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-bold text-[16px] flex items-center gap-2"><Trophy size={22} className="text-accent" /> لوحة الشرف</span>
            <Button
              variant="ghost"
              className="min-h-[48px] text-[13.5px] px-3"
              onClick={() => {
                const lines = honor
                  .map((h, i) => `${i + 1}. ${h.student.name} — ${h.pct}%`)
                  .join('\n')
                const text = `لوحة الشرف في ${assessment.title}:\n${lines}\nألف مبروك للأوائل!`
                void navigator.clipboard
                  ?.writeText(text)
                  .then(() => toast('اتنسخت تهنئة الأوائل'))
                  .catch(() => toast('النسخ مش متاح في المتصفح ده'))
              }}
            >
              نسخ تهنئة الأوائل
            </Button>
          </div>
          {honor.map((h, i) => (
            <div
              key={h.student.id}
              className="flex items-center justify-between gap-2 py-1.5 border-b border-border/60 last:border-0"
            >
              <span className="font-semibold text-[15px] flex items-center gap-2">
                <RankBadge rank={i + 1} />
                {h.student.name}
              </span>
              <span className="font-extrabold text-[13.5px]">
                {fmtScore(h.score ?? 0)} من {fmtScore(assessment.max_score)} · {h.pct}%
              </span>
            </div>
          ))}
        </Card>
      )}

      {editOpen && teacherId && (
        <AssessmentFormSheet
          teacherId={teacherId}
          groups={groupsQ.data ?? []}
          initial={assessment}
          onClose={() => setEditOpen(false)}
          onDeleted={() => navigate('/grades')}
        />
      )}
      {builderOpen && teacherId && (
        <ExamBuilderSheet
          teacherId={teacherId}
          assessment={assessment}
          onClose={() => setBuilderOpen(false)}
        />
      )}
      {sheetOpen && teacherId && (
        <ExamSheetSheet
          teacherId={teacherId}
          assessment={assessment}
          groupName={assessment.group_name}
          questions={questions}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}
