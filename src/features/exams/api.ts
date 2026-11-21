import { db } from '../../lib/supabase'
import { brandLogoUrl, isValidAccent } from '../../lib/brand'
import type {
  ExamAttemptRow,
  ExamPresentationQuestion,
  OnlineExamInput,
  OnlineExamRow,
  OnlineExamStatus,
  OnlineExamTokenRow,
} from '../../types/database'
import { generateRawToken, sha256Hex } from '../portal/api'

// ===========================================================================
// الامتحانات الإلكترونية بتصحيح تلقائي — Phase 3 خطوة 4 (migration ‏0010).
//
// النموذج: online_exams صف واحد فوق تقييم قائم (assessment_id فريد) —
// الأسئلة نفسها من بنك التقييم (assessment_questions)، والقابلة للتصحيح
// التلقائي منها هي MCQ ذات إجابة صحيحة وخيارين فأكثر (وسؤال «صح/خطأ»
// MCQ بخيارين فيدخل النمط). المقالية لا تدخل الامتحان الإلكتروني.
//
// جهة المدرس (جلسة مصادقة — RLS المالك/مساعد الدرجات على الجداول):
// إنشاء/ضبط الامتحان، توليد رابط الامتحان (نفس نمط روابط البوابة:
// رمز عشوائي في العميل، SHA-256 hash فقط يُخزّن في online_exam_tokens،
// وإعادة التوليد تُلغي النشط السابق)، وقراءة محاولات الطلاب ونتائجهم.
//
// جهة الطالب (بلا جلسة — anon key + RPC ‏security definer بالتوكن فقط):
// exam_info_by_token (وصف فقط) ← exam_start_attempt (بدء/استئناف بلقطة
// عرض مخلوطة بلا أي إجابة صحيحة) ← exam_submit_attempt (تصحيح خادمي
// كامل من correct_answer المخزنة + ترحيل أفضل درجة إلى scores بمصدر
// «امتحان إلكتروني»). لا قراءة مباشرة لأي جدول من anon إطلاقاً.
// ===========================================================================

export const ONLINE_EXAM_STATUS_LABELS: Record<OnlineExamStatus, string> = {
  draft: 'مسودة — غير منشور',
  published: 'منشور — الطلاب يقدروا يدخلوا',
  closed: 'مغلق — لا دخول جديد',
}

const EXAM_COLS =
  'id, teacher_id, assessment_id, group_id, status, duration_minutes, max_attempts, starts_at, ends_at, allow_review, shuffle_questions, shuffle_options, created_at, updated_at'
const TOKEN_COLS = 'id, teacher_id, exam_id, expires_at, revoked_at, last_used_at, created_at'
const ATTEMPT_COLS =
  'id, teacher_id, exam_id, student_id, attempt_no, status, seed, presentation, answers, started_at, submitted_at, score, max_score, pct, score_posted, created_at, updated_at'

function toExam(row: Record<string, unknown>): OnlineExamRow {
  return {
    ...(row as unknown as OnlineExamRow),
    duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
    max_attempts: Number(row.max_attempts) || 1,
  }
}

function toAttempt(row: Record<string, unknown>): ExamAttemptRow {
  return {
    ...(row as unknown as ExamAttemptRow),
    attempt_no: Number(row.attempt_no) || 0,
    presentation: (Array.isArray(row.presentation)
      ? row.presentation
      : []) as ExamPresentationQuestion[],
    answers: (row.answers ?? {}) as Record<string, string>,
    score: row.score == null ? null : Number(row.score),
    max_score: row.max_score == null ? null : Number(row.max_score),
    pct: row.pct == null ? null : Number(row.pct),
  }
}

// ---------------------------------------------------------------------------
// جهة المدرس — الامتحان وإعداداته
// ---------------------------------------------------------------------------

/** الامتحان الإلكتروني المرتبط بتقييم (إن حُوّل) — null = لم يُحوَّل بعد */
export async function fetchOnlineExam(
  teacherId: string,
  assessmentId: string,
): Promise<OnlineExamRow | null> {
  const { data, error } = await db()
    .from('online_exams')
    .select(EXAM_COLS)
    .eq('teacher_id', teacherId)
    .eq('assessment_id', assessmentId)
    .maybeSingle()
  if (error) throw error
  return data ? toExam(data as unknown as Record<string, unknown>) : null
}

/** تحويل تقييم لامتحان إلكتروني: صف مسودة بالإعدادات الافتراضية الآمنة */
export async function createOnlineExam(
  teacherId: string,
  assessmentId: string,
  groupId: string,
): Promise<OnlineExamRow> {
  const { data, error } = await db()
    .from('online_exams')
    .insert({
      teacher_id: teacherId,
      assessment_id: assessmentId,
      group_id: groupId,
      status: 'draft',
      duration_minutes: null,
      max_attempts: 1,
      starts_at: null,
      ends_at: null,
      allow_review: false,
      shuffle_questions: true,
      shuffle_options: true,
    })
    .select(EXAM_COLS)
    .single()
  if (error) throw error
  return toExam(data as unknown as Record<string, unknown>)
}

export async function updateOnlineExam(
  teacherId: string,
  examId: string,
  input: OnlineExamInput,
): Promise<OnlineExamRow> {
  if (!(input.max_attempts >= 1)) throw new Error('حد المحاولات لازم يكون 1 على الأقل')
  if (input.duration_minutes != null && !(input.duration_minutes > 0)) {
    throw new Error('مدة الامتحان لازم تكون أكبر من صفر — أو سيبها فاضية لامتحان بلا مؤقّت')
  }
  if (input.starts_at && input.ends_at && input.ends_at <= input.starts_at) {
    throw new Error('نهاية نافذة الإتاحة لازم تكون بعد بدايتها')
  }
  const { data, error } = await db()
    .from('online_exams')
    .update(input)
    .eq('teacher_id', teacherId)
    .eq('id', examId)
    .select(EXAM_COLS)
    .single()
  if (error) throw error
  return toExam(data as unknown as Record<string, unknown>)
}

/** حذف الامتحان الإلكتروني (محاولاته وروابطه تُحذف CASCADE؛ درجات scores المُرحَّلة تبقى بس تفقد رابط المحاولة) */
export async function deleteOnlineExam(teacherId: string, examId: string): Promise<void> {
  const { error } = await db()
    .from('online_exams')
    .delete()
    .eq('teacher_id', teacherId)
    .eq('id', examId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// جهة المدرس — رابط الامتحان (هاش فقط في القاعدة، كروابط البوابة)
// ---------------------------------------------------------------------------

/** رابط الامتحان العام: /exam?t=<rawToken> — الامتحان يُعرَف بالتوكن وحده، والطالب يُعرَف بكوده عند الدخول */
export function buildExamLink(origin: string, rawToken: string): string {
  return `${origin}/exam?t=${encodeURIComponent(rawToken)}`
}

export interface CreatedExamLink {
  link: string
  expiresAt: string | null
}

/**
 * توليد رابط امتحان جديد: رمز عشوائي في العميل → هاش SHA-256 فقط يُرسل
 * ويُخزّن. الروابط النشطة السابقة لنفس الامتحان تُبطَل أولاً (إعادة
 * التوليد = إبطال القديم، كنفس قاعدة روابط البوابة). انتهاء الرابط
 * يتبع نهاية نافذة الامتحان إن ضُبطت، وإلا بلا انتهاء مستقل.
 */
export async function createExamLink(
  teacherId: string,
  examId: string,
  endsAt: string | null,
): Promise<CreatedExamLink> {
  const supa = db()
  const rawToken = generateRawToken()
  const tokenHash = await sha256Hex(rawToken)

  const { error: revokeErr } = await supa
    .from('online_exam_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('exam_id', examId)
    .is('revoked_at', null)
  if (revokeErr) throw revokeErr

  const { error: insErr } = await supa.from('online_exam_tokens').insert({
    teacher_id: teacherId,
    exam_id: examId,
    token_hash: tokenHash,
    expires_at: endsAt,
  })
  if (insErr) throw insErr

  return { link: buildExamLink(window.location.origin, rawToken), expiresAt: endsAt }
}

/** روابط امتحان واحد — بلا عمود الهاش */
export async function fetchExamTokens(
  teacherId: string,
  examId: string,
): Promise<OnlineExamTokenRow[]> {
  const { data, error } = await db()
    .from('online_exam_tokens')
    .select(TOKEN_COLS)
    .eq('teacher_id', teacherId)
    .eq('exam_id', examId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as OnlineExamTokenRow[]
}

export async function revokeExamToken(teacherId: string, tokenId: string): Promise<void> {
  const { error } = await db()
    .from('online_exam_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('teacher_id', teacherId)
    .eq('id', tokenId)
    .is('revoked_at', null)
  if (error) throw error
}

/** حالة رابط للعرض: ملغي صراحة، أو منتهٍ بمرور وقته، أو نشط */
export function examTokenStatus(t: OnlineExamTokenRow): 'active' | 'expired' | 'revoked' {
  if (t.revoked_at) return 'revoked'
  if (t.expires_at && new Date(t.expires_at).getTime() <= Date.now()) return 'expired'
  return 'active'
}

// ---------------------------------------------------------------------------
// جهة المدرس — محاولات الطلاب ونتائجهم
// ---------------------------------------------------------------------------

export interface ExamAttemptItem extends ExamAttemptRow {
  student_name: string
  student_code: string
}

/** كل محاولات امتحان — الأحدث أولاً، مع اسم الطالب وكوده للعرض */
export async function fetchExamAttempts(
  teacherId: string,
  examId: string,
): Promise<ExamAttemptItem[]> {
  const { data, error } = await db()
    .from('exam_attempts')
    .select(`${ATTEMPT_COLS}, students(name, public_code)`)
    .eq('teacher_id', teacherId)
    .eq('exam_id', examId)
    .order('started_at', { ascending: false })
  if (error) throw error
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const s = (row.students ?? {}) as { name?: string; public_code?: string }
    return {
      ...toAttempt(row),
      student_name: s.name ?? '—',
      student_code: s.public_code ?? '',
    }
  })
}

// ---------------------------------------------------------------------------
// جهة الطالب العامة (بلا جلسة — RPC بالتوكن فقط)
// ---------------------------------------------------------------------------

export interface ExamBrand {
  name: string | null
  logo_url: string | null
  accent: string | null
}

export interface ExamInfo {
  title: string
  group_name: string | null
  status: OnlineExamStatus
  duration_minutes: number | null
  max_attempts: number
  starts_at: string | null
  ends_at: string | null
  allow_review: boolean
  questions_count: number
  total_points: number
  pass_score: number
  brand: ExamBrand
}

export interface ExamStartResult {
  attempt_id: string
  resumed: boolean
  attempt_no: number
  started_at: string
  deadline_at: string | null
  duration_minutes: number | null
  max_attempts: number
  attempts_used: number
  student_name: string
  exam_title: string
  allow_review: boolean
  presentation: ExamPresentationQuestion[]
}

export interface ExamReviewItem {
  question_id: string
  chosen: string | null
  correct_answer: string | null
  is_correct: boolean
}

export interface ExamSubmitResult {
  already_submitted: boolean
  score: number
  max_score: number
  pct: number
  passed: boolean
  attempt_no: number
  attempts_used: number
  attempts_left: number
  /** مراجعة الإجابات — تأتي من الخادم بعد التسليم فقط وإن سمح الإعداد */
  review: ExamReviewItem[] | null
}

function num(v: unknown): number {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : 0
}

/** معلومات الامتحان بالتوكن — وصف فقط، لا أسئلة ولا إجابات */
export async function fetchExamInfo(rawToken: string): Promise<ExamInfo> {
  const { data, error } = await db().rpc('exam_info_by_token', { p_token: rawToken })
  if (error) throw error
  if (!data) throw new Error('invalid or expired token')
  const raw = data as unknown as {
    exam: {
      title: string
      group_name: string | null
      status: OnlineExamStatus
      duration_minutes: number | null
      max_attempts: number
      starts_at: string | null
      ends_at: string | null
      allow_review: boolean
      questions_count: number
      total_points: number | string
      pass_score: number | string
    }
    brand?: {
      name?: string | null
      teacher_name?: string | null
      logo_path?: string | null
      accent?: string | null
    } | null
  }
  const e = raw.exam
  return {
    title: e.title,
    group_name: e.group_name ?? null,
    status: e.status,
    duration_minutes: e.duration_minutes == null ? null : Number(e.duration_minutes),
    max_attempts: Number(e.max_attempts) || 1,
    starts_at: e.starts_at ?? null,
    ends_at: e.ends_at ?? null,
    allow_review: Boolean(e.allow_review),
    questions_count: Number(e.questions_count) || 0,
    total_points: num(e.total_points),
    pass_score: num(e.pass_score),
    brand: {
      name: raw.brand?.name?.trim() || raw.brand?.teacher_name?.trim() || null,
      logo_url: brandLogoUrl(raw.brand?.logo_path),
      accent: isValidAccent(raw.brand?.accent) ? raw.brand.accent.toLowerCase() : null,
    },
  }
}

/** بدء محاولة أو استئناف الجارية — الرد يحمل لقطة العرض فقط (بلا إجابات صحيحة) */
export async function startExamAttempt(
  rawToken: string,
  studentCode: string,
): Promise<ExamStartResult> {
  const { data, error } = await db().rpc('exam_start_attempt', {
    p_token: rawToken,
    p_student_code: studentCode,
  })
  if (error) throw error
  const raw = data as unknown as {
    attempt_id: string
    resumed: boolean
    attempt_no: number
    started_at: string
    deadline_at: string | null
    duration_minutes: number | null
    max_attempts: number
    attempts_used: number
    student: { name: string }
    exam: { title: string; allow_review: boolean }
    presentation: ExamPresentationQuestion[]
  }
  return {
    attempt_id: raw.attempt_id,
    resumed: Boolean(raw.resumed),
    attempt_no: Number(raw.attempt_no) || 1,
    started_at: raw.started_at,
    deadline_at: raw.deadline_at ?? null,
    duration_minutes: raw.duration_minutes == null ? null : Number(raw.duration_minutes),
    max_attempts: Number(raw.max_attempts) || 1,
    attempts_used: Number(raw.attempts_used) || 0,
    student_name: raw.student?.name ?? '',
    exam_title: raw.exam?.title ?? '',
    allow_review: Boolean(raw.exam?.allow_review),
    presentation: (raw.presentation ?? []).map((q) => ({
      id: q.id,
      text: q.text,
      points: num(q.points),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    })),
  }
}

/** تسليم المحاولة — التصحيح كله خادمي؛ الرد هو النتيجة (والمراجعة إن سُمح بها) */
export async function submitExamAttempt(
  rawToken: string,
  attemptId: string,
  answers: Record<string, string>,
): Promise<ExamSubmitResult> {
  const { data, error } = await db().rpc('exam_submit_attempt', {
    p_token: rawToken,
    p_attempt_id: attemptId,
    p_answers: answers,
  })
  if (error) throw error
  const raw0 = data as unknown as { expired?: boolean }
  // مهلة منتهية خادمياً: الـ RPC يرجع {expired: true} (لا استثناء حتى
  // لا يلغي الـ rollback تحديث حالة المحاولة) — نحوّلها لخطأ بنفس
  // الرسالة التي تتعرف عليها رسائل الطالب المهذبة.
  if (raw0?.expired) throw new Error('time expired')
  const raw = data as unknown as {
    already_submitted: boolean
    score: number | string
    max_score: number | string
    pct: number | string
    passed: boolean
    attempt_no: number
    attempts_used: number
    attempts_left: number
    review: ExamReviewItem[] | null
  }
  return {
    already_submitted: Boolean(raw.already_submitted),
    score: num(raw.score),
    max_score: num(raw.max_score),
    pct: num(raw.pct),
    passed: Boolean(raw.passed),
    attempt_no: Number(raw.attempt_no) || 1,
    attempts_used: Number(raw.attempts_used) || 0,
    attempts_left: Number(raw.attempts_left) || 0,
    review: raw.review ?? null,
  }
}

/** رسالة مهذبة للطالب من خطأ RPC الامتحان — بلا أي تفاصيل داخلية */
export function examErrorInfo(error: unknown): { title: string; hint: string } {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  if (msg.includes('invalid or expired')) {
    return {
      title: 'رابط الامتحان غير صالح',
      hint: 'الرابط ده منتهي أو ملغي. اطلب من المدرس رابط الامتحان الجديد.',
    }
  }
  if (msg.includes('exam not published')) {
    return {
      title: 'الامتحان لسه مش منشور',
      hint: 'المدرس لسه ما نشّرش الامتحان ده. جرّب تاني بعد ما يعلن إنه جاهز.',
    }
  }
  if (msg.includes('exam not started yet')) {
    return {
      title: 'الامتحان لسه ما بدأش',
      hint: 'نافذة الامتحان لسه ما فتحتش. ارجع في الوقت اللي المدرس حدده.',
    }
  }
  if (msg.includes('exam window closed')) {
    return {
      title: 'نافذة الامتحان قفلت',
      hint: 'وقت إتاحة الامتحان انتهى خلاص. تواصل مع المدرس لو في ظرف خاص.',
    }
  }
  if (msg.includes('student code not found')) {
    return {
      title: 'الكود غير صحيح',
      hint: 'الكود ده مش موجود عند المدرس. اتأكد إنك كاتبه زي ما هو في كارت الطالب بالظبط.',
    }
  }
  if (msg.includes('student not in exam group')) {
    return {
      title: 'الكود مش في مجموعة الامتحان',
      hint: 'الامتحان ده لمجموعة تانية. اتأكد من الكود، أو اسأل المدرس عن رابط مجموعتك.',
    }
  }
  if (msg.includes('student is paused')) {
    return {
      title: 'الحساب موقوف مؤقتاً',
      hint: 'اشتراكك موقوف حالياً عند المدرس — تواصل معاه قبل دخول الامتحان.',
    }
  }
  if (msg.includes('attempt limit reached')) {
    return {
      title: 'خلصت محاولاتك',
      hint: 'استخدمت كل المحاولات المتاحة للامتحان ده. نتيجتك المسجلة هي أفضل محاولة، ولو محتاج محاولة إضافية كلّم المدرس.',
    }
  }
  if (msg.includes('exam has no gradable questions')) {
    return {
      title: 'الامتحان مش جاهز',
      hint: 'لسه مفيش أسئلة اختيارية قابلة للتصحيح في الامتحان ده. بلّغ المدرس.',
    }
  }
  if (msg.includes('time expired')) {
    return {
      title: 'انتهى وقت الامتحان',
      hint: 'مهلة المحاولة خلصت قبل التسليم فاتقفلت المحاولة. تواصل مع المدرس لو محتاج محاولة جديدة.',
    }
  }
  return {
    title: 'حصلت مشكلة',
    hint: 'ماقدرناش نكمل العملية دي. اتأكد من النت وحاول تاني، ولو اتكررت بلّغ المدرس.',
  }
}
