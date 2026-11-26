import { useMemo, useState } from 'react'
import { t } from '../../i18n'
import { errText } from '../../lib/supabaseErrors'
import { Sheet } from '../../components/ui/Sheet'
import { useToast } from '../../components/ui/toast'
import { Check, Plus, Printer, Save, Trash2 } from 'lucide-react'
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
import { usePrintFont } from '../../hooks/usePrintFont'
import { printFontStyle } from '../../lib/printFonts'
import { PrintBrandHeader } from '../../components/brand/PrintBrandHeader'
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
      title={initial ? t('grades.formEditTitle') : t('grades.formCreateTitle')}
      onClose={onClose}
      footer={
        <>
          <Button full type="submit" form="assessment-form" disabled={mut.isPending || !valid}>
            <Save size={18} />
            {mut.isPending ? t('grades.saving') : initial ? t('grades.formSaveEdit') : t('grades.formCreate')}
          </Button>
          <Button full variant="ghost" type="button" onClick={onClose} className="mt-2">
            {t('grades.cancel')}
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
        <Field label={t('grades.formTitleLabel')}>
          <TextInput
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('grades.formTitlePlaceholder')}
          />
        </Field>
        <Field label={t('grades.formTypeLabel')}>
          <Select value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('grades.formGroupLabel')}>
          <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            {groups.length === 0 && <option value="">{t('grades.formNoGroups')}</option>}
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('grades.formDateLabel')}>
          <TextInput
            type="date"
            dir="ltr"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('grades.formMaxLabel')}>
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
          <Field label={t('grades.formPassLabel')}>
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
            {t('grades.formPassWarn')}
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
                  t('grades.formDeleteConfirm', { title: initial.title }),
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
            {del.isPending ? t('grades.formDeleting') : (<><Trash2 size={20} /> {t('grades.formDeleteBtn')}</>)}
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
  const toast = useToast()

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
    <Sheet open title={t('grades.builderTitle', { title: assessment.title })} onClose={onClose}>
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
            {
              onSuccess: resetForm,
              onError: () => toast(t('grades.builderAddError'), 'error'),
            },
          )
        }}
      >
        <Field label={t('grades.builderTypeLabel')}>
          <Select value={qType} onChange={(e) => setQType(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('grades.builderTextLabel')}>
          <TextArea
            required
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('grades.builderTextPlaceholder')}
          />
        </Field>
        {qType === 'mcq' && (
          <button
            type="button"
            className="text-primary text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer p-0 mb-2 min-h-[48px]"
            onClick={() => setOpts([t('grades.tfOptionTrue'), t('grades.tfOptionFalse'), '', ''])}
          >
            {t('grades.builderTfHint')}
          </button>
        )}
        {qType === 'mcq' && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {opts.map((o, i) => (
              <TextInput
                key={i}
                value={o}
                onChange={(e) =>
                  setOpts((prev) => prev.map((v, j) => (j === i ? e.target.value : v)))
                }
                placeholder={t('grades.builderOptionPlaceholder', { letter: OPTION_LETTERS[i] })}
              />
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={qType === 'mcq' ? t('grades.builderCorrectLabel') : t('grades.builderModelLabel')}>
            <TextInput value={ans} onChange={(e) => setAns(e.target.value)} placeholder={t('grades.builderAnswerPlaceholder')} />
          </Field>
          <Field label={t('grades.builderPointsLabel')}>
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
          <Plus size={18} />
          {add.isPending ? t('grades.builderAdding') : t('grades.builderAddBtn')}
        </Button>
      </form>

      <div className="mt-4 border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-[15px]">{t('grades.builderListTitle', { count: questions.length })}</span>
          <span className="text-muted text-[13.5px] font-semibold">
            {t('grades.builderTotal', { total: fmtScore(totalPts), max: fmtScore(assessment.max_score) })}
          </span>
        </div>
        {questionsQ.isPending ? (
          <p className="text-muted text-[13.5px]">{t('grades.builderLoading')}</p>
        ) : questionsQ.isError ? (
          <FormError message={errText(questionsQ.error)} />
        ) : questions.length === 0 ? (
          <p className="text-muted text-[13.5px] mb-0">
            {t('grades.builderEmpty')}
          </p>
        ) : (
          <div>
            {questions.map((q, i) => (
              <div key={q.id} className="py-2.5 border-b border-border last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-[15px]">
                      {t('grades.builderQuestionLabel', { n: i + 1, text: q.text })}
                    </span>
                    <span className="text-muted text-[12px] font-bold">{t('grades.builderPointsSuffix', { points: fmtScore(q.points) })}</span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 text-bad-text text-[13.5px] font-semibold bg-transparent border-0 cursor-pointer"
                    disabled={del.isPending}
                    onClick={() =>
                      del.mutate(q.id, {
                        onError: () => toast(t('grades.builderDeleteError'), 'error'),
                      })
                    }
                  >
                    {t('grades.builderDelete')}
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
                    {t('grades.builderAnswerLine', { answer: q.correct_answer })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {del.isError && <FormError message={errText(del.error)} />}
      </div>

      <Button full variant="ghost" onClick={onClose} className="mt-3">
        {t('common.close')}
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
  // خط طباعة المستندات المختار (مهمة 12 — ج16-1): الافتراضي بلا ستايل
  const { printFont } = usePrintFont(teacherId, true)

  return (
    <Sheet open title={t('grades.examSheet')} onClose={onClose}>
      <ChipRow>
        <Chip active={!showAns} onClick={() => setShowAns(false)}>
          {t('grades.sheetStudentCopy')}
        </Chip>
        <Chip active={showAns} onClick={() => setShowAns(true)}>
          {t('grades.sheetAnswerCopy')}
        </Chip>
      </ChipRow>

      <div
        className="print-area bg-white text-slate-900 border border-dashed border-slate-300 rounded-xl p-4 mb-3"
        style={printFontStyle(printFont)}
      >
        <PrintBrandHeader
          brand={brand}
          fallbackTitle={teacherNameQ.data ? teacherNameQ.data : t('grades.examSheet')}
          logoAlt={t('grades.sheetLogoAlt')}
        >
          <div className="text-[13.5px] text-slate-600">
            {assessment.title} · {groupName}
          </div>
          <div className="text-[13.5px] text-slate-500">
            {t('grades.sheetMeta', { max: fmtScore(assessment.max_score), date: formatDateLabel(assessment.assess_date) })}
          </div>
        </PrintBrandHeader>
        <div className="text-[13.5px] mb-3 flex justify-between gap-4">
          <span>
            {t('grades.sheetStudentName')} <span className="text-slate-400">…………………………</span>
          </span>
          <span>
            {t('grades.sheetCode')} <span className="text-slate-400">…………</span>
          </span>
        </div>
        {questions.length === 0 ? (
          <p className="text-slate-500 text-[13.5px] mb-0">
            {t('grades.sheetEmpty')}
          </p>
        ) : (
          <div>
            {questions.map((q, i) => (
              <div key={q.id} className="mb-3">
                <div className="font-bold text-[15px]">
                  {t('grades.builderQuestionLabel', { n: i + 1, text: q.text })}{' '}
                  <span className="text-slate-500 font-semibold">{t('grades.sheetPointsSuffix', { points: fmtScore(q.points) })}</span>
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
                    {t('grades.builderAnswerLine', { answer: q.correct_answer })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Button full onClick={() => window.print()} disabled={questions.length === 0}>
        <Printer size={20} />
        {t('grades.sheetPrint')}
      </Button>
      <Button full variant="ghost" onClick={onClose} className="mt-2">
        {t('common.close')}
      </Button>
    </Sheet>
  )
}
