import { t } from '../../i18n'
import { db } from '../../lib/supabase'
import { friendlyDbError } from '../../lib/supabaseErrors'
import { waLink } from '../../lib/format'
import type {
  AssessmentInput,
  AssessmentQuestionRow,
  AssessmentRow,
  AssessmentType,
  QuestionInput,
  QuestionType,
  ScoreRow,
  ScoreSource,
  Tables,
} from '../../types/database'
import { todayStr } from '../home/api'
import {
  fetchGuardianContacts,
  fetchSessionRoster,
  resolveGuardian,
  type GuardianContact,
  type RosterStudent,
} from '../attendance/api'

export { fetchSessionRoster, fetchGuardianContacts, resolveGuardian, todayStr }
export type { RosterStudent, GuardianContact }

// ---------------------------------------------------------------------------
// الأنواع — enums المخطط حرفياً: assessment_type ('exam'|'homework')
// و question_type ('mcq'|'essay')
// ---------------------------------------------------------------------------

export const ASSESSMENT_TYPES: { code: AssessmentType; label: string }[] = [
  { code: 'exam', label: t('grades.typeExam') },
  { code: 'homework', label: t('grades.typeHomework') },
]

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  exam: t('grades.typeExam'),
  homework: t('grades.typeHomework'),
}

export const QUESTION_TYPES: { code: QuestionType; label: string }[] = [
  { code: 'mcq', label: t('grades.questionMcq') },
  { code: 'essay', label: t('grades.questionEssay') },
]

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  mcq: t('grades.questionMcq'),
  essay: t('grades.questionEssay'),
}

/** حروف اختيارات الـ MCQ في ورقة الامتحان (المرجع §4 مودال examSheet) */
export const OPTION_LETTERS = [
  t('grades.optionLetterA'),
  t('grades.optionLetterB'),
  t('grades.optionLetterC'),
  t('grades.optionLetterD'),
]

// ---------------------------------------------------------------------------
// النسب والتقدير — المرجع §3.4/§3.11: النسبة = الدرجة ÷ النهائية × 100.
// لون الشارة: أخضر إن كانت النسبة ≥ نسبة النجاح (pass ÷ max)، أحمر إن < 50%،
// وإلا كهرماني؛ وبلا درجة = رمادي.
// ---------------------------------------------------------------------------

export function pctOf(score: number, max: number): number | null {
  if (!(max > 0)) return null
  return Math.round((score / max) * 100)
}

export function passPctOf(a: Pick<AssessmentRow, 'max_score' | 'pass_score'>): number {
  if (!(a.max_score > 0)) return 0
  return (a.pass_score / a.max_score) * 100
}

export type PctTone = 'ok' | 'warn' | 'bad' | 'none'

export function pctTone(
  pct: number | null,
  a: Pick<AssessmentRow, 'max_score' | 'pass_score'>,
): PctTone {
  if (pct == null) return 'none'
  if (pct >= passPctOf(a)) return 'ok'
  if (pct < 50) return 'bad'
  return 'warn'
}

export const TONE_BADGE: Record<PctTone, string> = {
  ok: 'bg-ok text-white',
  warn: 'bg-warn text-white',
  bad: 'bg-bad text-white',
  none: 'bg-muted/15 text-muted border border-border',
}

/** تنسيق رقم درجة/نهائية: بلا كسور زائدة (20 بدل 20.00، و12.5 كما هي) */
export function fmtScore(n: number): string {
  return String(Math.round(n * 100) / 100)
}

// ---------------------------------------------------------------------------
// التقييمات — جدول assessments في المخطط حرفياً
// (id, teacher_id, group_id, title, type, assess_date, max_score, pass_score)
// ---------------------------------------------------------------------------

const ASSESS_COLS =
  'id, teacher_id, group_id, title, type, assess_date, max_score, pass_score, created_at, updated_at'
const QUESTION_COLS =
  'id, teacher_id, assessment_id, position, type, text, options, correct_answer, points, created_at'
const SCORE_COLS =
  'teacher_id, assessment_id, student_id, score, source, exam_attempt_id, created_at, updated_at'

function toAssessment(row: AssessmentRow): AssessmentRow {
  return {
    ...row,
    max_score: Number(row.max_score) || 0,
    pass_score: Number(row.pass_score) || 0,
  }
}

export interface AssessmentListItem extends AssessmentRow {
  group_name: string
  /** عدد الدرجات المسجلة في scores */
  scored_count: number
  /** متوسط نسب الطلاب المسجلين % — null عند غياب أي درجة */
  avg_pct: number | null
  /** عدد أسئلة البنك المرتبطة (assessment_questions) */
  questions_count: number
}

/** كل تقييمات المدرس — الأحدث أولاً (بالتاريخ ثم الإنشاء)، مع إحصاءات محسوبة */
export async function fetchAssessments(teacherId: string): Promise<AssessmentListItem[]> {
  const supa = db()
  const { data, error } = await supa
    .from('assessments')
    .select(`${ASSESS_COLS}, groups(name)`)
    .eq('teacher_id', teacherId)
    .order('assess_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error
  const rows = (data ?? []).map((row) => {
    return { base: toAssessment(row), group_name: row.groups?.name ?? '—' }
  })
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.base.id)
  const maxById = new Map(rows.map((r) => [r.base.id, r.base.max_score]))

  const { data: scoreData, error: scoreErr } = await supa
    .from('scores')
    .select('assessment_id, score')
    .eq('teacher_id', teacherId)
    .in('assessment_id', ids)
  if (scoreErr) throw scoreErr
  const scoreAgg = new Map<string, { count: number; pctSum: number }>()
  for (const s of scoreData ?? []) {
    const max = maxById.get(s.assessment_id) ?? 0
    const cur = scoreAgg.get(s.assessment_id) ?? { count: 0, pctSum: 0 }
    cur.count += 1
    if (max > 0) cur.pctSum += (Number(s.score) / max) * 100
    scoreAgg.set(s.assessment_id, cur)
  }

  const { data: qData, error: qErr } = await supa
    .from('assessment_questions')
    .select('assessment_id')
    .eq('teacher_id', teacherId)
    .in('assessment_id', ids)
  if (qErr) throw qErr
  const qCount = new Map<string, number>()
  for (const q of qData ?? []) {
    qCount.set(q.assessment_id, (qCount.get(q.assessment_id) ?? 0) + 1)
  }

  return rows.map(({ base, group_name }) => {
    const agg = scoreAgg.get(base.id)
    return {
      ...base,
      group_name,
      scored_count: agg?.count ?? 0,
      avg_pct: agg && agg.count > 0 ? Math.round(agg.pctSum / agg.count) : null,
      questions_count: qCount.get(base.id) ?? 0,
    }
  })
}

export interface AssessmentWithGroup extends AssessmentRow {
  group_name: string
}

export async function fetchAssessment(
  teacherId: string,
  assessmentId: string,
): Promise<AssessmentWithGroup | null> {
  const { data, error } = await db()
    .from('assessments')
    .select(`${ASSESS_COLS}, groups(name)`)
    .eq('teacher_id', teacherId)
    .eq('id', assessmentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { ...toAssessment(data), group_name: data.groups?.name ?? '—' }
}

export async function createAssessment(
  teacherId: string,
  input: AssessmentInput,
): Promise<AssessmentRow> {
  const { data, error } = await db()
    .from('assessments')
    .insert({ teacher_id: teacherId, ...input })
    .select(ASSESS_COLS)
    .single()
  if (error) throw error
  return toAssessment(data)
}

export async function updateAssessment(
  teacherId: string,
  assessmentId: string,
  input: AssessmentInput,
): Promise<AssessmentRow> {
  const { data, error } = await db()
    .from('assessments')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', assessmentId)
    .select(ASSESS_COLS)
    .single()
  if (error) throw error
  return toAssessment(data)
}

/**
 * حذف تقييم (المرجع §4: زر «حذف الامتحان» في مودال التعديل) — أسئلته ودرجاته
 * تُحذف تلقائياً بقيود المخطط ON DELETE CASCADE على assessment_questions
 * و scores.
 */
export async function deleteAssessment(teacherId: string, assessmentId: string): Promise<void> {
  const { error } = await db()
    .from('assessments')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', assessmentId)
  if (error) throw friendlyDbError(error, t('common.deleteError'))
}

// ---------------------------------------------------------------------------
// الدرجات — جدول scores، مفتاحه الأساسي (assessment_id, student_id).
// غياب الصف = لا درجة مسجلة (المرجع §2.2)، فمسح درجة طالب = حذف صفّه،
// وحفظ درجة = upsert على قيد المفتاح الأساسي.
// ---------------------------------------------------------------------------

/**
 * صف درجة من العميل الم typed: ‏source نص في الأنواع المولّدة ومقيّد
 * بقيد CHECK في المخطط (scores_source_check) لقيمتي ScoreSource —
 * التضييق هنا توثيق لذلك القيد (انظر types/database.ts).
 */
function toScoreRow(r: Tables<'scores'>): ScoreRow {
  return { ...r, source: r.source as ScoreSource, score: Number(r.score) || 0 }
}

export async function fetchAssessmentScores(
  teacherId: string,
  assessmentId: string,
): Promise<ScoreRow[]> {
  const { data, error } = await db()
    .from('scores')
    .select(SCORE_COLS)
    .eq('teacher_id', teacherId)
    .eq('assessment_id', assessmentId)
  if (error) throw error
  return (data ?? []).map(toScoreRow)
}

export interface ScoreEntry {
  studentId: string
  /** null = مسح الدرجة (حذف الصف) */
  score: number | null
}

/** حفظ جماعي: upsert واحد للدرجات المدخلة + حذف صفوف الدرجات الممسوحة */
export async function saveScores(
  teacherId: string,
  assessmentId: string,
  entries: ScoreEntry[],
): Promise<void> {
  const supa = db()
  const upserts = entries
    .filter((e): e is { studentId: string; score: number } => e.score != null)
    .map((e) => ({
      teacher_id: teacherId,
      assessment_id: assessmentId,
      student_id: e.studentId,
      score: e.score,
      // إدخال يدوي صريح (0010): أي حفظ من شاشة الدرجات يصفّر مصدر
      // الامتحان الإلكتروني — الترحيل التلقائي وحده يضبط 'online_exam'
      source: 'manual' as const,
      exam_attempt_id: null,
    }))
  if (upserts.length > 0) {
    const { error } = await supa
      .from('scores')
      .upsert(upserts, { onConflict: 'assessment_id,student_id' })
    if (error) throw error
  }
  const deletions = entries.filter((e) => e.score == null).map((e) => e.studentId)
  if (deletions.length > 0) {
    const { error } = await supa
      .from('scores')
      .delete()
      .eq('teacher_id', teacherId)
      .eq('assessment_id', assessmentId)
      .in('student_id', deletions)
    if (error) throw error
  }
}

/**
 * رسالة درجة الامتحان لولي الأمر عبر واتساب (wa.me يدوي — المرجع §5.6):
 * «أهلاً {guardian}، درجة {name} في {title} هي {v} من {max} ‏({pct}%).»
 * الرقم: ولي الأمر المرتبط (guardians) أولاً ثم guardian_phone ثم موبايل
 * الطالب — نفس ترتيب وحدة الحضور (resolveGuardian).
 */
export function scoreWaUrl(
  student: RosterStudent,
  contact: GuardianContact | undefined,
  assessment: Pick<AssessmentRow, 'title' | 'max_score'>,
  score: number,
): string | null {
  const { name: guardianName, phone } = resolveGuardian(student, contact)
  const base = waLink(phone)
  if (!base) return null
  const pct = pctOf(score, assessment.max_score)
  const msg = t('grades.scoreWaMessage', {
    guardian: guardianName,
    name: student.name,
    title: assessment.title,
    score: fmtScore(score),
    max: fmtScore(assessment.max_score),
    pct: pct ?? 0,
  })
  return `${base}?text=${encodeURIComponent(msg)}`
}

// ---------------------------------------------------------------------------
// بنك الأسئلة الأساسي — نموذج المخطط: لا يوجد جدول بنك مستقل؛ الأسئلة
// تعيش في assessment_questions مرتبطة بتقييم واحد (assessment_id) بترتيب
// position، وهي نفس بنية المرجع (questions[] داخل التقييم §2.2).
// حدود النموذج: سؤال لا يُعاد استخدامه عبر تقييمات مختلفة إلا بنسخه يدوياً،
// ولا يوجد تجميع موضوعي/بحث عابر للتقييمات — ذلك خارج نطاق «الأساسي»
// المطلوب في هذه الخطوة حسب خطة المرحلة.
// ---------------------------------------------------------------------------

function toQuestion(row: Tables<'assessment_questions'>): AssessmentQuestionRow {
  const opts = row.options
  return {
    ...row,
    options: Array.isArray(opts) ? (opts as string[]) : null,
    points: Number(row.points) || 0,
  }
}

export async function fetchQuestions(
  teacherId: string,
  assessmentId: string,
): Promise<AssessmentQuestionRow[]> {
  const { data, error } = await db()
    .from('assessment_questions')
    .select(QUESTION_COLS)
    .eq('teacher_id', teacherId)
    .eq('assessment_id', assessmentId)
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(toQuestion)
}

/** إضافة سؤال في نهاية قائمة التقييم (position = عدد الأسئلة الحالي) */
export async function addQuestion(
  teacherId: string,
  assessmentId: string,
  input: QuestionInput,
  position: number,
): Promise<AssessmentQuestionRow> {
  const { data, error } = await db()
    .from('assessment_questions')
    .insert({ teacher_id: teacherId, assessment_id: assessmentId, position, ...input })
    .select(QUESTION_COLS)
    .single()
  if (error) throw error
  return toQuestion(data)
}

/** حذف سؤال — فوري بلا تأكيد كما في المرجع (§5.10: حذف سؤال فوري) */
export async function deleteQuestion(teacherId: string, questionId: string): Promise<void> {
  const { error } = await db()
    .from('assessment_questions')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', questionId)
  if (error) throw friendlyDbError(error, t('common.deleteError'))
}

/**
 * مزامنة الدرجة النهائية (المرجع §5.7 ‏sync-exam-max): max الجديد = مجموع
 * درجات الأسئلة (يُستدعى فقط عند وجود مجموع > 0)، ودرجة النجاح تُعاد
 * ضبطها = نصف النهائية مقرباً.
 */
export async function syncAssessmentMax(
  teacherId: string,
  assessment: AssessmentRow,
  questionsTotal: number,
): Promise<AssessmentRow> {
  const { data, error } = await db()
    .from('assessments')
    .update({ max_score: questionsTotal, pass_score: Math.round(questionsTotal / 2) })
    .eq('teacher_id', teacherId)
    .eq('id', assessment.id)
    .select(ASSESS_COLS)
    .single()
  if (error) throw error
  return toAssessment(data)
}

// ---------------------------------------------------------------------------
// درجات طالب واحد — لتبويب الدرجات في ملف الطالب (المرجع §3.4):
// تقييماته ودرجاته من scores فعلياً مع بيانات التقييم ومجموعته.
// ---------------------------------------------------------------------------

export interface StudentScoreItem {
  assessment_id: string
  title: string
  type: AssessmentType
  assess_date: string
  group_id: string
  group_name: string
  max_score: number
  pass_score: number
  score: number
  /** مصدر الدرجة (0010): 'online_exam' = مُرحَّلة من امتحان إلكتروني */
  source: 'manual' | 'online_exam'
  /** النسبة % مقربة — محسوبة دائماً من الدرجة والنهائية */
  pct: number
}

export async function fetchStudentScores(
  teacherId: string,
  studentId: string,
): Promise<StudentScoreItem[]> {
  const { data, error } = await db()
    .from('scores')
    .select(
      'assessment_id, score, source, assessments!inner(title, type, assess_date, group_id, max_score, pass_score, groups(name))',
    )
    .eq('teacher_id', teacherId)
    .eq('student_id', studentId)
  if (error) throw error
  const rows = (data ?? []).map((row) => {
    const a = row.assessments
    const max = Number(a.max_score) || 0
    const score = Number(row.score) || 0
    return {
      assessment_id: row.assessment_id,
      title: a.title ?? '—',
      type: a.type ?? 'exam',
      assess_date: a.assess_date ?? '',
      group_id: a.group_id ?? '',
      group_name: a.groups?.name ?? '—',
      max_score: max,
      pass_score: Number(a.pass_score) || 0,
      score,
      source: (row.source === 'online_exam'
        ? 'online_exam'
        : 'manual') as StudentScoreItem['source'],
      pct: max > 0 ? Math.round((score / max) * 100) : 0,
    }
  })
  // الأحدث أولاً — ترتيب محلي لأن الترتيب على جدول مرتبط غير مضمون الشكل هنا
  rows.sort((a, b) => b.assess_date.localeCompare(a.assess_date))
  return rows
}
