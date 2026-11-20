import { useMemo, useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Check, Printer, Trash2 } from 'lucide-react'
import { Button } from '../../components/ui/Button'
import { Chip, ChipRow, Field, FormError, Select, TextArea, TextInput } from '../../components/ui/form'
import type {
  AssessmentQuestionRow,
  AssessmentRow,
  AssessmentType,
  GroupRow,
  QuestionType,
} from '../../types/database'
import { formatDateLabel } from '../schedule/api'
import { useTeacherDisplayName } from '../invoices/hooks'
import { useBrandIdentity } from '../../hooks/useBrandIdentity'
import {
  ASSESSMENT_TYPES,
  OPTION_LETTERS,
  QUESTION_TYPES,
  fmtScore,
  todayStr,
} from './api'
import {
  useAddQuestion,
  useCreateAssessment,
  useDeleteAssessment,
  useDeleteQuestion,
  useQuestions,
  useUpdateAssessment,
} from './hooks'

function errText(e: unknown): string {
  return e instanceof Error ? e.message : 'حصل خطأ غير متوقع'
}

// ---------------------------------------------------------------------------
// امتحان أو واجب جديد / تعديل — المرجع §4 مودال assessment:
// العنوان إلزامي، النوع (exam/homework)، المجموعة، التاريخ، النهائية
// (افتراضي 20) ودرجة النجاح (افتراضي 10). وفي التعديل زر حذف أحمر —
// الحذف يزيل الأسئلة والدرجات مع التقييم (CASCADE في المخطط).
// ---------------------------------------------------------------------------

export function AssessmentFormSheet({
  teacherId,
  groups,
  initial,
  onClose,
  onDeleted,
}: {
  teacherId: string
  groups: GroupRow[]
  /** عند التعديل: التقييم الحالي؛ عند الإنشاء: undefined */
  initial?: AssessmentRow
  onClose: () => void
  /** يُستدعى بعد حذف ناجح (للتنقل بعيداً عن صفحة التفاصيل مثلاً) */
  onDeleted?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [type, setType] = useState<AssessmentType>(initial?.type ?? 'exam')
  const [groupId, setGroupId] = useState(initial?.group_id ?? groups[0]?.id ?? '')
  const [date, setDate] = useState(initial?.assess_date ?? todayStr())
  const [maxScore, setMaxScore] = useState(String(initial?.max_score ?? 20))
  const [passScore, setPassScore] = useState(String(initial?.pass_score ?? 10))

  const create = useCreateAssessment(teacherId)
  const update = useUpdateAssessment(teacherId)
  const del = useDeleteAssessment(teacherId)
  const mut = initial ? update : create
  const max = parseFloat(maxScore)
  const pass = parseFloat(passScore)
  const valid =
    title.trim().length > 0 &&
    Boolean(groupId) &&
    Boolean(date) &&
    Number.isFinite(max) &&
    max > 0 &&
    Number.isFinite(pass) &&
    pass >= 0

  return (
    <Sheet
      open
      title={initial ? 'تعديل بيانات الامتحان' : 'امتحان أو واجب جديد'}
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="assessment-form" disabled={mut.isPending || !valid}>
            {mut.isPending ? 'بنحفظ…' : initial ? 'حفظ التعديلات' : 'إنشاء التقييم'}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            إلغاء
          </Button>
        </>
      }
    >
      <form
        id="assessment-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          const input = {
            group_id: groupId,
            title: title.trim(),
            type,
            assess_date: date,
            max_score: max,
            pass_score: pass,
          }
          if (initial) {
            update.mutate({ assessmentId: initial.id, input }, { onSuccess: onClose })
          } else {
            create.mutate(input, { onSuccess: onClose })
          }
        }}
      >
        <Field label="عنوان الامتحان / الواجب">
          <TextInput
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: امتحان الجبر — الوحدة الأولى"
          />
        </Field>
        <Field label="النوع">
          <Select value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المجموعة">
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            {groups.length === 0 && <option value="">لا توجد مجموعات بعد</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="التاريخ">
          <TextInput
            type="date"
            dir="ltr"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الدرجة النهائية">
            <TextInput
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              required
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
            />
          </Field>
          <Field label="درجة النجاح">
            <TextInput
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              required
              value={passScore}
              onChange={(e) => setPassScore(e.target.value)}
            />
          </Field>
        </div>
        {pass > max && (
          <p className="text-warn-text text-[13.5px] font-semibold">
            درجة النجاح أكبر من النهائية — كل الطلاب هيظهروا تحت النجاح.
          </p>
        )}
        {mut.isError && <FormError message={errText(mut.error)} />}
      </form>

      {initial && (
        <div className="mt-4 border-t border-border pt-3">
          {del.isError && <FormError message={errText(del.error)} />}
          <Button
            full
            variant="danger"
            disabled={del.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `حذف «${initial.title}» نهائياً؟ هتتحذف أسئلته وكل درجات الطلاب المسجلة فيه.`,
                )
              ) {
                del.mutate(initial.id, {
                  onSuccess: () => {
                    onClose()
                    onDeleted?.()
                  },
                })
              }
            }}
          >
            {del.isPending ? 'بنحذف…' : (<><Trash2 size={20} /> حذف الامتحان</>)}
          </Button>
        </div>
      )}
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// بنك الأسئلة الأساسي — المرجع §4 مودال examBuilder: نموذج إضافة سؤال
// (النوع mcq/essay، النص إلزامي، حتى 4 اختيارات للـ MCQ تُتجاهل الفارغة،
// الإجابة الصحيحة/النموذجية، درجة السؤال افتراضي 1) + قائمة الأسئلة
// المضافة بحذف فوري لكل سؤال. الأسئلة تُحفظ في assessment_questions
// مرتبطة بهذا التقييم فقط — لا جدول بنك مستقل في المخطط.
// ---------------------------------------------------------------------------

export function ExamBuilderSheet({
  teacherId,
  assessment,
  onClose,
}: {
  teacherId: string
  assessment: AssessmentRow
  onClose: () => void
}) {
  const questionsQ = useQuestions(teacherId, assessment.id)
  const questions = useMemo(() => questionsQ.data ?? [], [questionsQ.data])
  const add = useAddQuestion(teacherId)
  const del = useDeleteQuestion(teacherId)

  const [qType, setQType] = useState<QuestionType>('mcq')
  const [text, setText] = useState('')
  const [opts, setOpts] = useState<string[]>(['', '', '', ''])
  const [ans, setAns] = useState('')
  const [pts, setPts] = useState('1')

  const totalPts = questions.reduce((s, q) => s + q.points, 0)
  const points = parseFloat(pts)
  const valid = text.trim().length > 0 && Number.isFinite(points) && points >= 0

  const resetForm = () => {
    setText('')
    setOpts(['', '', '', ''])
    setAns('')
    setPts('1')
  }

  return (
    <Sheet open title={`الأسئلة: ${assessment.title}`} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!valid) return
          add.mutate(
            {
              assessmentId: assessment.id,
              position: questions.length,
              input: {
                type: qType,
                text: text.trim(),
                options:
                  qType === 'mcq'
                    ? opts.map((o) => o.trim()).filter((o) => o.length > 0)
                    : null,
                correct_answer: ans.trim() ? ans.trim() : null,
                points,
              },
            },
            { onSuccess: resetForm },
          )
        }}
      >
        <Field label="نوع السؤال">
          <Select value={qType} onChange={(e) => setQType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="نص السؤال">
          <TextArea
            required
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="اكتب نص السؤال…"
          />
        </Field>
        {qType === 'mcq' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {opts.map((o, i) => (
              <TextInput
                key={i}
                value={o}
                onChange={(e) =>
                  setOpts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder={`الاختيار ${OPTION_LETTERS[i]}`}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={qType === 'mcq' ? 'الإجابة الصحيحة' : 'الإجابة النموذجية'}>
            <TextInput value={ans} onChange={(e) => setAns(e.target.value)} placeholder="الإجابة" />
          </Field>
          <Field label="درجة السؤال">
            <TextInput
              type="number"
              min="0"
              step="0.5"
              inputMode="decimal"
              required
              value={pts}
              onChange={(e) => setPts(e.target.value)}
            />
          </Field>
        </div>
        {add.isError && <FormError message={errText(add.error)} />}
        <Button full type="submit" disabled={add.isPending || !valid}>
          {add.isPending ? 'بنضيف…' : '+ إضافة السؤال'}
        </Button>
      </form>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[15px]">أسئلة التقييم ({questions.length})</span>
          <span className="text-muted text-[13.5px] font-semibold">
            مجموع الدرجات: {fmtScore(totalPts)} من {fmtScore(assessment.max_score)}
          </span>
        </div>
        {questionsQ.isPending ? (
          <p className="text-muted text-[13.5px]">بنحمّل الأسئلة…</p>
        ) : questionsQ.isError ? (
          <FormError message={errText(questionsQ.error)} />
        ) : questions.length === 0 ? (
          <p className="text-muted text-[13.5px] mb-0">
            لسه مفيش أسئلة — أضف أول سؤال من النموذج اللي فوق.
          </p>
        ) : (
          <div>
            {questions.map((q, i) => (
              <div key={q.id} className="py-2.5 border-b border-border last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-[15px]">
                      س{i + 1}: {q.text}
                    </span>
                    <span className="text-muted text-[12px] font-bold"> ({fmtScore(q.points)} د)</span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-bad-text text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer"
                    disabled={del.isPending}
                    onClick={() => del.mutate(q.id)}
                  >
                    حذف
                  </button>
                </div>
                {q.type === 'mcq' && q.options && q.options.length > 0 && (
                  <div className="text-muted text-[13.5px] mt-1">
                    {q.options.map((o, j) => `${OPTION_LETTERS[j]}) ${o}`).join(' · ')}
                  </div>
                )}
                {q.correct_answer && (
                  <div className="text-ok-text text-[13.5px] font-semibold mt-0.5 flex items-center gap-1">
                    <Check size={16} />
                    الإجابة: {q.correct_answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {del.isError && <FormError message={errText(del.error)} />}
      </div>

      <Button full variant="ghost" onClick={onClose} className="mt-3">
        إغلاق
      </Button>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------
// ورقة الامتحان — المرجع §4 مودال examSheet + §6.8: مبدّل «نسخة الطالب» /
// «نموذج الإجابة»، منطقة طباعة .print-area بيضاء دائماً: ترويسة باسم
// المدرس والمجموعة والعنوان والنهائية والتاريخ، سطر اسم الطالب والكود،
// أسئلة مرقمة بدرجاتها، اختيارات MCQ بحروف أ/ب/ج/د أو سطر إجابة منقّط
// للمقالي، وفي نموذج الإجابة تظهر «الإجابة:» خضراء بعلامة صح.
// ---------------------------------------------------------------------------

export function ExamSheetSheet({
  teacherId,
  assessment,
  groupName,
  questions,
  onClose,
}: {
  teacherId: string
  assessment: AssessmentRow
  groupName: string
  questions: AssessmentQuestionRow[]
  onClose: () => void
}) {
  const [showAns, setShowAns] = useState(false)
  const teacherNameQ = useTeacherDisplayName(teacherId, true)
  // الهوية البيضاء (Phase 3 خطوة 1): شعار واسم ولهجة السنتر على ترويسة
  // الورقة إن وُجدت، وإلا اسم المدرس كما كان.
  const { brand } = useBrandIdentity(teacherId, true)

  return (
    <Sheet open title="ورقة الامتحان" onClose={onClose}>
      <ChipRow>
        <Chip active={!showAns} onClick={() => setShowAns(false)}>
          نسخة الطالب
        </Chip>
        <Chip active={showAns} onClick={() => setShowAns(true)}>
          نموذج الإجابة
        </Chip>
      </ChipRow>

      <div className="print-area bg-white text-slate-900 border border-dashed border-slate-300 rounded-xl p-4 mb-3">
        <div
          className="text-center border-b border-slate-200 pb-2 mb-3"
          style={brand.accent ? { borderBottomColor: brand.accent, borderBottomWidth: 2 } : undefined}
        >
          {brand.logoUrl && (
            <div className="flex justify-center mb-1.5">
              <img
                src={brand.logoUrl}
                alt={brand.name ?? 'شعار السنتر'}
                className="h-[52px] max-w-[180px] object-contain"
              />
            </div>
          )}
          <div
            className="font-extrabold text-[16px]"
            style={brand.accent ? { color: brand.accent } : undefined}
          >
            {brand.name ?? (teacherNameQ.data ? teacherNameQ.data : 'ورقة الامتحان')}
          </div>
          <div className="text-[13.5px] text-slate-600">
            {assessment.title} · {groupName}
          </div>
          <div className="text-[13.5px] text-slate-500">
            الدرجة النهائية: {fmtScore(assessment.max_score)} · التاريخ:{' '}
            {formatDateLabel(assessment.assess_date)}
          </div>
        </div>
        <div className="text-[13.5px] mb-3 flex justify-between gap-4">
          <span>
            اسم الطالب: <span className="text-slate-400">…………………………</span>
          </span>
          <span>
            الكود: <span className="text-slate-400">…………</span>
          </span>
        </div>
        {questions.length === 0 ? (
          <p className="text-slate-500 text-[13.5px] mb-0">
            لسه مفيش أسئلة في التقييم ده — أضف أسئلة من بنك الأسئلة الأول.
          </p>
        ) : (
          <div>
            {questions.map((q, i) => (
              <div key={q.id} className="mb-3">
                <div className="font-bold text-[15px]">
                  س{i + 1}: {q.text}{' '}
                  <span className="text-slate-500 font-semibold">({fmtScore(q.points)} درجة)</span>
                </div>
                {q.type === 'mcq' && q.options && q.options.length > 0 ? (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-1 text-[13.5px]">
                    {q.options.map((o, j) => (
                      <span key={j}>
                        {OPTION_LETTERS[j]}) {o}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="border-b border-dotted border-slate-300 h-6" />
                )}
                {showAns && q.correct_answer && (
                  <div className="text-green-700 font-semibold text-[13.5px] mt-1 flex items-center gap-1">
                    <Check size={16} />
                    الإجابة: {q.correct_answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Button full onClick={() => window.print()} disabled={questions.length === 0}>
        <Printer size={20} />
        طباعة الورقة
      </Button>
      <Button full variant="ghost" onClick={onClose} className="mt-2">
        إغلاق
      </Button>
    </Sheet>
  )
}
