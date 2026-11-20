import { useEffect, useState } from 'react'
import {
  Check,
  Copy,
  Globe,
  Link2,
  Link2Off,
  MonitorSmartphone,
  Trash2,
} from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Field, FormError, Select, TextInput } from '../../components/ui/form'
import { useToast } from '../../components/ui/toast'
import { Skeleton } from '../../components/ui/states'
import type {
  AssessmentRow,
  OnlineExamInput,
  OnlineExamStatus,
} from '../../types/database'
import { fmtScore } from '../grades/api'
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

const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: 'جارية الآن',
  submitted: 'مُسلَّمة',
  expired: 'انتهى وقتها',
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
              امتحان إلكتروني بتصحيح تلقائي
            </div>
            <p className="text-muted text-[13.5px] mt-1 mb-0">
              {gradableCount > 0
                ? `حوّل التقييم ده لامتحان أونلاين: الطالب يدخل برابط وكوده، الأسئلة مخلوطة لكل طالب، والتصحيح فوري والنتيجة بتترحّل لدرجاته تلقائياً. عندك ${gradableCount} سؤال اختياري قابل للتصحيح التلقائي (مجموعها ${fmtScore(questionsTotal)} درجة).`
                : 'حوّل التقييم ده لامتحان أونلاين بتصحيح فوري — بس لسه مفيش أسئلة اختيارية بإجابة صحيحة في البنك. أضف أسئلة اختيار من متعدد أو صح/خطأ من زر «الأسئلة» الأول.'}
            </p>
          </div>
          <Button
            disabled={createMut.isPending || gradableCount === 0}
            onClick={() =>
              createMut.mutate(
                { assessmentId: assessment.id, groupId: assessment.group_id },
                {
                  onSuccess: () => toast('اتعمل الامتحان الإلكتروني كمسودة — ظبّط إعداداته وانشره وابعته بالرابط'),
                  onError: () => toast('حصلت مشكلة في إنشاء الامتحان — حاول تاني'),
                },
              )
            }
          >
            <Globe size={20} />
            {createMut.isPending ? 'بنعمل…' : 'تحويل لامتحان إلكتروني'}
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
      <div className="font-bold text-[16px] flex items-center gap-2 mb-1">
        <MonitorSmartphone size={22} className="text-primary" />
        الامتحان الإلكتروني
        <span
          className={`text-[12px] font-bold rounded-full px-2.5 py-1 ${
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
        {gradableCount} سؤال قابل للتصحيح التلقائي. الطالب يدخل بالرابط + كوده، والتصحيح
        خادمي فوري — أفضل درجة لكل طالب بتترحّل لدرجاته تلقائياً بمصدر «امتحان إلكتروني».
      </p>

      <div className="grid grid-cols-2 gap-3">
        <Field label="حالة النشر">
          <Select value={status} onChange={(e) => setStatus(e.target.value as OnlineExamStatus)}>
            {(Object.keys(ONLINE_EXAM_STATUS_LABELS) as OnlineExamStatus[]).map((s) => (
              <option key={s} value={s}>
                {ONLINE_EXAM_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="حد المحاولات لكل طالب">
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
        <Field label="مدة الامتحان (دقيقة) — فاضي = بلا مؤقّت">
          <TextInput
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            dir="ltr"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="مثال: 30"
          />
        </Field>
        <Field label="مراجعة الإجابات الصحيحة">
          <Select value={allowReview ? 'yes' : 'no'} onChange={(e) => setAllowReview(e.target.value === 'yes')}>
            <option value="no">النتيجة بس بعد التسليم</option>
            <option value="yes">النتيجة + مراجعة الإجابات بعد التسليم</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="يبدأ من (اختياري)">
          <TextInput
            type="datetime-local"
            dir="ltr"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </Field>
        <Field label="ينتهي في (اختياري)">
          <TextInput
            type="datetime-local"
            dir="ltr"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex gap-4 flex-wrap mb-3">
        <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer min-h-[48px]">
          <input
            type="checkbox"
            checked={shuffleQ}
            onChange={(e) => setShuffleQ(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
          خلط ترتيب الأسئلة لكل طالب
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold cursor-pointer min-h-[48px]">
          <input
            type="checkbox"
            checked={shuffleO}
            onChange={(e) => setShuffleO(e.target.checked)}
            className="w-5 h-5 accent-primary"
          />
          خلط ترتيب الاختيارات
        </label>
      </div>
      {startsAt && endsAt && endsAt <= startsAt && (
        <p className="text-warn-text text-[13.5px] font-semibold">
          نهاية النافذة لازم تكون بعد بدايتها.
        </p>
      )}
      {updateMut.isError && (
        <FormError
          message={updateMut.error instanceof Error ? updateMut.error.message : 'حصل خطأ غير متوقع'}
        />
      )}
      <Button
        full
        disabled={updateMut.isPending || !valid}
        onClick={() =>
          updateMut.mutate(
            { examId, input: buildInput() },
            {
              onSuccess: () => toast('اتحفظت إعدادات الامتحان الإلكتروني'),
              onError: () => toast('حصلت مشكلة في الحفظ — حاول تاني'),
            },
          )
        }
      >
        <Check size={20} />
        {updateMut.isPending ? 'بنحفظ…' : 'حفظ إعدادات الامتحان'}
      </Button>

      {/* رابط الامتحان */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="font-bold text-[15px] mb-1.5 flex items-center gap-2">
          <Link2 size={19} className="text-primary" />
          رابط الامتحان للطلاب
        </div>
        {freshLink ? (
          <div className="bg-soft rounded-xl px-3 py-2.5 mb-2">
            <div className="text-[13.5px] font-semibold mb-1">
              الرابط الجديد جاهز — انسخه وابعته لطلاب المجموعة (بيظهر هنا مرة واحدة، وإعادة
              التوليد بتلغي أي رابط قديم):
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
                    .then(() => toast('اتنسخ رابط الامتحان'))
                    .catch(() => toast('النسخ مش متاح في المتصفح ده'))
                }
              >
                <Copy size={18} />
                نسخ
              </Button>
            </div>
          </div>
        ) : activeToken ? (
          <p className="text-muted text-[13.5px] mt-0">
            في رابط نشط حالياً (اتعمل {new Date(activeToken.created_at).toLocaleDateString('ar-EG')}
            {activeToken.last_used_at
              ? ` · آخر استخدام ${new Date(activeToken.last_used_at).toLocaleString('ar-EG')}`
              : ' · لسه ما اتستخدمش'}
            ). الرابط الخام نفسه مش بيتحفظ — لو ضاع منك، ولّد رابط جديد (القديم هيتلغي).
          </p>
        ) : (
          <p className="text-muted text-[13.5px] mt-0">
            لسه مفيش رابط — ولّد رابط وابعته لطلاب المجموعة على واتساب.
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
                    toast('اتولّد رابط الامتحان — انسخه دلوقتي')
                  },
                  onError: () => toast('حصلت مشكلة في توليد الرابط — حاول تاني'),
                },
              )
            }
          >
            <Link2 size={19} />
            {linkMut.isPending ? 'بنولّد…' : activeToken || freshLink ? 'إعادة توليد الرابط' : 'توليد رابط الامتحان'}
          </Button>
          {activeToken && !freshLink && (
            <Button
              variant="ghost"
              disabled={revokeMut.isPending}
              onClick={() => {
                if (window.confirm('إلغاء رابط الامتحان الحالي؟ أي طالب معاه الرابط مش هيقدر يدخل بيه.')) {
                  revokeMut.mutate(activeToken.id, {
                    onSuccess: () => toast('اتلغى رابط الامتحان'),
                    onError: () => toast('حصلت مشكلة في الإلغاء — حاول تاني'),
                  })
                }
              }}
            >
              <Link2Off size={19} />
              إلغاء الرابط الحالي
            </Button>
          )}
        </div>
      </div>

      {/* نتائج ومحاولات الطلاب */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-bold text-[15px]">
            محاولات الطلاب ({attempts.length})
            {submitted.length > 0 ? ` — ${submitted.length} مُسلَّمة` : ''}
          </span>
          <Button
            variant="ghost"
            className="min-h-[48px] text-[13.5px] px-3"
            onClick={() => void attemptsQ.refetch()}
          >
            تحديث
          </Button>
        </div>
        {attemptsQ.isPending ? (
          <Skeleton className="h-[56px]" />
        ) : attempts.length === 0 ? (
          <p className="text-muted text-[13.5px] mb-0">
            لسه مفيش طالب دخل الامتحان. أول ما طالب يبدأ هتظهر محاولته ونتيجته هنا.
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
                    محاولة {a.attempt_no} · بدأت {new Date(a.started_at).toLocaleString('ar-EG')}
                    {a.submitted_at
                      ? ` · سُلّمت ${new Date(a.submitted_at).toLocaleString('ar-EG')}`
                      : ''}
                  </div>
                </div>
                <span className="text-[12px] font-bold bg-soft text-muted border border-border rounded-full px-2.5 py-1">
                  {ATTEMPT_STATUS_LABELS[a.status] ?? a.status}
                </span>
                {a.status === 'submitted' && a.score != null && (
                  <span className="text-[13.5px] font-extrabold">
                    {fmtScore(a.score)} من {fmtScore(a.max_score ?? 0)} ·{' '}
                    {a.pct != null ? `${Math.round(a.pct)}%` : ''}
                  </span>
                )}
                {a.score_posted && (
                  <span className="text-[12px] font-bold bg-ok-soft text-ok-text border border-ok/30 rounded-full px-2.5 py-1 inline-flex items-center gap-1">
                    <Check size={14} />
                    مُرحَّلة لدرجاته
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
                'حذف الامتحان الإلكتروني نهائياً؟ هتتحذف روابطه وكل محاولات الطلاب ونتائجها هنا (الدرجات اللي اترحّلت لملفات الطلاب هتفضل موجودة). التقييم نفسه وأسئلته مش هيتأثروا.',
              )
            ) {
              deleteMut.mutate(examId, {
                onSuccess: () => toast('اتحذف الامتحان الإلكتروني'),
                onError: () => toast('حصلت مشكلة في الحذف — حاول تاني'),
              })
            }
          }}
        >
          <Trash2 size={20} />
          {deleteMut.isPending ? 'بنحذف…' : 'حذف الامتحان الإلكتروني'}
        </Button>
      </div>
    </Card>
  )
}
