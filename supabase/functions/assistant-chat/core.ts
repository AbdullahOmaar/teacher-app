// ============================================================================
// تطبيق المدرس — Edge Function: assistant-chat (Phase 2 T6 — خطة ب)
// ----------------------------------------------------------------------------
// المساعد المنفّذ بلا إطار (قرار المدير ق1، 2026-11-25 ~01:07 EET):
// كود صريح على بنية التطبيق الحالية، بنمط دوال الواتساب (0045):
// منطق نقي هنا (اعتماديات محقونة) حتى تحاكيه المحاكاة المحلية
// (scripts/simulate-assistant.mjs) بنفس كود الإنتاج؛ مدخل Deno في
// index.ts يمرّر عميل Supabase بتوكن المستدعي فقط.
//
// قواعد حاكمة (وثيقة التجهيز PHASE2-T6-PREP §2):
// • هوية المستدعي دائماً: لا مفتاح إدارة (service) في هذه الدالة إطلاقاً —
//   كل قراءة وكتابة تمر بعميل المستدعي فتخضع لـ RLS كما تخضع الواجهة.
// • المالية للمالك فقط: أدوات المال تتطلب can_view_money عند العضو،
//   وRLS المالك-فقط على invoices/payments خط الدفاع الثاني.
// • لا كتابة قبل التأكيد: الاقتراح يخزّن الحمولة وهاشها خادمياً (0048)،
//   والتأكيد لا يقبل إلا الهاش المطابق، والتنفيذ يقرأ الحمولة المخزّنة.
// • الإيقاف/الإلغاء قبل التنفيذ = صفر كتابات أعمال بنيوياً.
// • لا إجابة بلا تدقيق: فشل كتابة قيد assistant_runs يوقف الرد (500) —
//   الفشل ظاهر لا صامت (نفس قاعدة «لا إرسال بلا سجل» في واتساب).
//
// حالة المزوّد (ق5 عند المالك): لا نداء نموذج في هذا البناء. «المخطط»
// هنا هو المخطط الاختباري الحتمي DeterministicTestPlanner — بديل اختبار
// (test double) بقواعد أوامر ثابتة، موسوم صراحةً أنه ليس نموذجاً. وصلة
// المزوّد الحقيقي هي واجهة AssistantPlanner: مخطط المزوّد بعد ق5
// يُركَّب مكان البديل دون مساس بآلة التأكيد أو الأدوات أو التدقيق.
// ============================================================================

export interface AssistantEnv {
  ASSISTANT_ENABLED?: string
}

export type AssistantRole = 'owner' | 'assistant'

export interface CallerContext {
  role: AssistantRole
  /** صلاحيات العضو من teacher_members.permissions (المالك يتجاوزها كلها) */
  permissions: Record<string, boolean>
}

export interface BalanceRow {
  invoice_id: string
  student_id: string
  group_id: string
  period_month: string
  total: number
  paid: number
  balance: number
}

export interface StudentRow {
  id: string
  name: string
}

export interface AttendanceRow {
  student_id: string
  status: string | null
}

export interface PaymentRow {
  amount: number
  method: string
  paid_on: string
}

export interface ProposalReceipt {
  id: string
  payload_hash: string
  expires_at: string
}

export type ConfirmOutcome =
  | { ok: true; teacher_id: string; tool: string; payload: Record<string, unknown> }
  | { ok: false; error: string }

export interface AssistantDeps {
  /** يتحقق من JWT الترويسة ويرجع معرّف المستخدم أو null */
  getUserId: (req: Request) => Promise<string | null>
  /** دور المستدعي وصلاحياته داخل هذا السنتر، أو null إن لم يكن مالكاً/عضواً نشطاً */
  getCallerContext: (teacherId: string, userId: string) => Promise<CallerContext | null>
  /** أرصدة الفواتير من view ‏invoice_balances (security_invoker — RLS فعّال) */
  fetchBalances: (teacherId: string) => Promise<BalanceRow[]>
  fetchStudents: (teacherId: string) => Promise<StudentRow[]>
  /** كل صفوف الحضور للسنتر (أداة الغياب تجمع الكل في هذه الجولة) */
  fetchAttendance: (teacherId: string) => Promise<AttendanceRow[]>
  fetchPayments: (teacherId: string, from: string, to: string) => Promise<PaymentRow[]>
  fetchGroup: (teacherId: string, groupId: string) => Promise<{ id: string; name: string } | null>
  /** تنفيذ add_student بعميل المستدعي: صف طالب + تسجيل في المجموعة */
  insertStudent: (
    teacherId: string,
    payload: AddStudentPayload,
  ) => Promise<{ student_id: string }>
  /** RPC ‏assistant_begin_read — قيد قراءة مجابة أو null عند الفشل */
  beginRead: (
    teacherId: string,
    tool: string,
    request: string,
    result: unknown,
  ) => Promise<string | null>
  /** RPC ‏assistant_create_proposal — إيصال المقترح أو null عند الفشل */
  createProposal: (
    teacherId: string,
    tool: string,
    request: string,
    payload: Record<string, unknown>,
    payloadHash: string,
  ) => Promise<ProposalReceipt | null>
  /** RPC ‏assistant_confirm_proposal — يرجع الحمولة المخزّنة خادمياً */
  confirmProposal: (runId: string, payloadHash: string) => Promise<ConfirmOutcome>
  /** RPC ‏assistant_complete_run */
  completeRun: (
    runId: string,
    success: boolean,
    result: unknown,
    error: string | null,
  ) => Promise<boolean>
  /** RPC ‏assistant_cancel_run */
  cancelRun: (
    runId: string,
    reason: 'cancelled' | 'stopped',
  ) => Promise<{ ok: boolean; error?: string }>
  now: () => number
}

// ----------------------------------------------------------------------------
// وصلة المخطط (provider seam) — الواجهة التي سيركب عليها مخطط المزوّد بعد ق5
// ----------------------------------------------------------------------------

export type PlannedStep =
  | { type: 'read'; tool: string; args: Record<string, unknown> }
  | { type: 'action'; tool: string; payload: Record<string, unknown> }

export interface AssistantPlanner {
  plan: (input: { message: string }) => Promise<PlannedStep>
}

export class PlannerError extends Error {}

/**
 * ⚠️ مخطط اختباري حتمي — بديل اختبار (test double)، ليس نموذج ذكاء.
 * يفهم أوامر ثابتة حرفية فقط حتى تُختبر آلة التأكيد والأدوات والتدقيق
 * طرف-لطرف قبل وصول أي مزوّد (ق5). القواعد:
 *   unpaid                      → أداة المتأخرات
 *   absence[:<حد الغياب>]       → أداة الغياب (الحد افتراضياً 3)
 *   collect:<من>:<إلى>          → ملخص تحصيل فترة (YYYY-MM-DD)
 *   add-student:<الاسم>:<groupId> → اقتراح إضافة طالب
 * أي رسالة أخرى تُرفض صراحةً — لا تخمين ولا فهم لغوي هنا.
 */
export class DeterministicTestPlanner implements AssistantPlanner {
  async plan(input: { message: string }): Promise<PlannedStep> {
    const msg = input.message.trim()
    if (msg === 'unpaid') return { type: 'read', tool: 'unpaid_students', args: {} }
    if (msg === 'absence' || msg.startsWith('absence:')) {
      const raw = msg === 'absence' ? '' : msg.slice('absence:'.length)
      const min = raw === '' ? 3 : Number(raw)
      if (!Number.isInteger(min) || min < 1) {
        throw new PlannerError('absence threshold must be a positive integer')
      }
      return { type: 'read', tool: 'absence_summary', args: { min_absences: min } }
    }
    if (msg.startsWith('collect:')) {
      const parts = msg.split(':')
      if (parts.length !== 3 || !isIsoDate(parts[1]) || !isIsoDate(parts[2])) {
        throw new PlannerError('collect expects collect:<from>:<to> as YYYY-MM-DD')
      }
      return {
        type: 'read',
        tool: 'collection_summary',
        args: { from: parts[1], to: parts[2] },
      }
    }
    if (msg.startsWith('add-student:')) {
      const rest = msg.slice('add-student:'.length)
      const cut = rest.lastIndexOf(':')
      if (cut <= 0 || cut === rest.length - 1) {
        throw new PlannerError('add-student expects add-student:<name>:<groupId>')
      }
      return {
        type: 'action',
        tool: 'add_student',
        payload: { name: rest.slice(0, cut).trim(), group_id: rest.slice(cut + 1).trim() },
      }
    }
    throw new PlannerError(
      'unrecognized command (deterministic test planner — not a model)',
    )
  }
}

// ----------------------------------------------------------------------------
// سجل الأدوات: النوع + صلاحية العضو المقابلة (المالك له الكل)
// ----------------------------------------------------------------------------

export interface AddStudentPayload {
  name: string
  group_id: string
  phone?: string
  guardian_name?: string
  guardian_phone?: string
  grade?: string
}

interface ToolSpec {
  kind: 'read' | 'action'
  permission: string
}

export const ASSISTANT_TOOLS: Record<string, ToolSpec> = {
  unpaid_students: { kind: 'read', permission: 'can_view_money' },
  absence_summary: { kind: 'read', permission: 'can_take_attendance' },
  collection_summary: { kind: 'read', permission: 'can_view_money' },
  add_student: { kind: 'action', permission: 'can_manage_students' },
}

function hasToolPermission(ctx: CallerContext, spec: ToolSpec): boolean {
  return ctx.role === 'owner' || ctx.permissions[spec.permission] === true
}

// ----------------------------------------------------------------------------
// دوال حساب نقية (تُختبر مباشرة في المحاكاة)
// ----------------------------------------------------------------------------

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))
}

export interface UnpaidStudentLine {
  student_id: string
  name: string
  balance: number
  overdue_balance: number
  open_invoices: number
}

export function computeUnpaid(
  balances: BalanceRow[],
  students: StudentRow[],
  currentMonth: string,
): { students: UnpaidStudentLine[]; count: number; total_balance: number; overdue_total: number } {
  const names = new Map(students.map((s) => [s.id, s.name]))
  const byStudent = new Map<string, UnpaidStudentLine>()
  for (const b of balances) {
    if (b.balance <= 0) continue
    const cur = byStudent.get(b.student_id) ?? {
      student_id: b.student_id,
      name: names.get(b.student_id) ?? '',
      balance: 0,
      overdue_balance: 0,
      open_invoices: 0,
    }
    cur.balance = round2(cur.balance + b.balance)
    if (b.period_month < currentMonth) {
      cur.overdue_balance = round2(cur.overdue_balance + b.balance)
    }
    cur.open_invoices += 1
    byStudent.set(b.student_id, cur)
  }
  const rows = [...byStudent.values()].sort((a, b) => b.balance - a.balance)
  return {
    students: rows,
    count: rows.length,
    total_balance: round2(rows.reduce((s, r) => s + r.balance, 0)),
    overdue_total: round2(rows.reduce((s, r) => s + r.overdue_balance, 0)),
  }
}

export interface AbsenceLine {
  student_id: string
  name: string
  absences: number
}

export function computeAbsence(
  attendance: AttendanceRow[],
  students: StudentRow[],
  minAbsences: number,
): { students: AbsenceLine[]; total_absences: number; marked_rows: number } {
  const names = new Map(students.map((s) => [s.id, s.name]))
  const counts = new Map<string, number>()
  let marked = 0
  for (const row of attendance) {
    if (row.status === null) continue
    marked += 1
    if (row.status === 'a') {
      counts.set(row.student_id, (counts.get(row.student_id) ?? 0) + 1)
    }
  }
  const rows = [...counts.entries()]
    .map(([student_id, absences]) => ({
      student_id,
      name: names.get(student_id) ?? '',
      absences,
    }))
    .filter((r) => r.absences >= minAbsences)
    .sort((a, b) => b.absences - a.absences)
  return {
    students: rows,
    total_absences: [...counts.values()].reduce((s, n) => s + n, 0),
    marked_rows: marked,
  }
}

export function computeCollection(
  payments: PaymentRow[],
): { total: number; count: number; by_method: Record<string, number> } {
  // دلالة السجل الصافي (نفس view ‏invoice_balances): دفعات العكس صفوف
  // سالبة بقيمتها، فالمجموع المباشر هو الصافي الفعلي للفترة.
  const byMethod: Record<string, number> = {}
  let total = 0
  for (const p of payments) {
    total += p.amount
    byMethod[p.method] = round2((byMethod[p.method] ?? 0) + p.amount)
  }
  return { total: round2(total), count: payments.length, by_method: byMethod }
}

/** JSON حتمي (مفاتيح مرتبة على كل المستويات) — أساس هاش الحمولة المستقر */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export async function hashPayload(payload: Record<string, unknown>): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(payload))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ----------------------------------------------------------------------------
// المعالج الرئيسي
// ----------------------------------------------------------------------------

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function jsonError(status: number, message: string): Response {
  return json(status, { error: { http_code: status, message } })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateAddStudentPayload(
  payload: Record<string, unknown>,
): AddStudentPayload | null {
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const groupId = typeof payload.group_id === 'string' ? payload.group_id.trim() : ''
  if (!name || !groupId) return null
  const out: AddStudentPayload = { name, group_id: groupId }
  for (const key of ['phone', 'guardian_name', 'guardian_phone', 'grade'] as const) {
    const v = payload[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
  }
  return out
}

export async function handleAssistantChat(
  req: Request,
  env: AssistantEnv,
  deps: AssistantDeps,
  planner: AssistantPlanner,
  log: (msg: string) => void,
): Promise<Response> {
  // بوابة Kill switch المنصة أولاً — غياب العلم = OFF (نمط 3A-300)
  if (env.ASSISTANT_ENABLED !== 'true') {
    return jsonError(503, 'assistant is disabled')
  }
  if (req.method !== 'POST') return jsonError(405, 'POST only')

  const userId = await deps.getUserId(req)
  if (!userId) return jsonError(401, 'invalid or missing JWT')

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, 'request body must be JSON')
  }
  if (!isRecord(body)) return jsonError(400, 'request body must be a JSON object')
  const teacherId = typeof body.teacher_id === 'string' ? body.teacher_id : ''
  const action = typeof body.action === 'string' ? body.action : ''
  if (!teacherId) return jsonError(400, 'teacher_id is required')

  const ctx = await deps.getCallerContext(teacherId, userId)
  if (!ctx) return jsonError(403, 'not a member of this centre')

  if (action === 'message') {
    return handleMessage(body, teacherId, ctx, deps, planner, log)
  }
  if (action === 'confirm') {
    return handleConfirm(body, teacherId, deps, log)
  }
  if (action === 'stop' || action === 'cancel') {
    const runId = typeof body.run_id === 'string' ? body.run_id : ''
    if (!runId) return jsonError(400, 'run_id is required')
    const res = await deps.cancelRun(runId, action === 'stop' ? 'stopped' : 'cancelled')
    if (!res.ok) return jsonError(409, res.error ?? 'run cannot be cancelled')
    return json(200, { status: action === 'stop' ? 'stopped' : 'cancelled', run_id: runId })
  }
  return jsonError(400, `unknown action: ${action || '(missing)'}`)
}

async function handleMessage(
  body: Record<string, unknown>,
  teacherId: string,
  ctx: CallerContext,
  deps: AssistantDeps,
  planner: AssistantPlanner,
  log: (msg: string) => void,
): Promise<Response> {
  const message = typeof body.message === 'string' ? body.message : ''
  if (!message.trim()) return jsonError(400, 'message is required')

  let step: PlannedStep
  try {
    step = await planner.plan({ message })
  } catch (e) {
    if (e instanceof PlannerError) return jsonError(422, e.message)
    throw e
  }
  const spec = ASSISTANT_TOOLS[step.tool]
  if (!spec) return jsonError(422, `unknown tool: ${step.tool}`)
  // بوابة الصلاحية قبل أي جلب بيانات — الرفض لا يلمس البيانات أصلاً
  if (!hasToolPermission(ctx, spec)) {
    return jsonError(403, `missing permission: ${spec.permission}`)
  }

  if (step.type === 'read') {
    if (spec.kind !== 'read') return jsonError(422, `tool ${step.tool} is not a read tool`)
    const result = await runReadTool(step.tool, step.args, teacherId, deps)
    if (!result.ok) return jsonError(400, result.error)
    // لا إجابة بلا تدقيق: فشل القيد يوقف الرد كله
    const runId = await deps.beginRead(teacherId, step.tool, message, result.data)
    if (!runId) return jsonError(500, 'audit write failed')
    return json(200, { status: 'answered', run_id: runId, tool: step.tool, result: result.data })
  }

  // إجراء: تحقق شكلي من الحمولة ثم اقتراح فقط — صفر كتابات أعمال هنا
  if (spec.kind !== 'action') return jsonError(422, `tool ${step.tool} is not an action tool`)
  const payload = normalizeActionPayload(step.tool, step.payload)
  if (!payload) return jsonError(400, `invalid payload for tool ${step.tool}`)
  const payloadHash = await hashPayload(payload)
  const receipt = await deps.createProposal(teacherId, step.tool, message, payload, payloadHash)
  if (!receipt) return jsonError(500, 'proposal write failed')
  log(`assistant proposal created: run=${receipt.id} tool=${step.tool}`)
  return json(200, {
    status: 'proposed',
    run_id: receipt.id,
    tool: step.tool,
    payload_hash: receipt.payload_hash,
    expires_at: receipt.expires_at,
    preview: payload,
  })
}

function normalizeActionPayload(
  tool: string,
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    return valid ? { ...valid } : null
  }
  return null
}

async function runReadTool(
  tool: string,
  args: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  if (tool === 'unpaid_students') {
    const [balances, students] = await Promise.all([
      deps.fetchBalances(teacherId),
      deps.fetchStudents(teacherId),
    ])
    const currentMonth = new Date(deps.now()).toISOString().slice(0, 7) + '-01'
    return { ok: true, data: computeUnpaid(balances, students, currentMonth) }
  }
  if (tool === 'absence_summary') {
    const min = typeof args.min_absences === 'number' ? args.min_absences : 3
    const [attendance, students] = await Promise.all([
      deps.fetchAttendance(teacherId),
      deps.fetchStudents(teacherId),
    ])
    return { ok: true, data: computeAbsence(attendance, students, min) }
  }
  if (tool === 'collection_summary') {
    const from = typeof args.from === 'string' ? args.from : ''
    const to = typeof args.to === 'string' ? args.to : ''
    if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
      return { ok: false, error: 'collection needs a valid from/to date range' }
    }
    const payments = await deps.fetchPayments(teacherId, from, to)
    return { ok: true, data: { from, to, ...computeCollection(payments) } }
  }
  return { ok: false, error: `unknown read tool: ${tool}` }
}

async function handleConfirm(
  body: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
  log: (msg: string) => void,
): Promise<Response> {
  const runId = typeof body.run_id === 'string' ? body.run_id : ''
  const payloadHash = typeof body.payload_hash === 'string' ? body.payload_hash : ''
  if (!runId || !payloadHash) return jsonError(400, 'run_id and payload_hash are required')

  const confirmed = await deps.confirmProposal(runId, payloadHash)
  if (!confirmed.ok) return jsonError(409, confirmed.error)
  if (confirmed.teacher_id !== teacherId) {
    return jsonError(400, 'teacher_id does not match the proposal')
  }
  const spec = ASSISTANT_TOOLS[confirmed.tool]
  if (!spec || spec.kind !== 'action') {
    await deps.completeRun(runId, false, null, `unknown action tool: ${confirmed.tool}`)
    return jsonError(422, `unknown action tool: ${confirmed.tool}`)
  }

  // إعادة التحقق من الحمولة المخزّنة ضد البيانات الحالية قبل أي كتابة
  const reverifyError = await reverifyPayload(confirmed.tool, confirmed.payload, teacherId, deps)
  if (reverifyError) {
    await deps.completeRun(runId, false, null, reverifyError)
    return jsonError(422, reverifyError)
  }

  try {
    const outcome = await executeAction(confirmed.tool, confirmed.payload, teacherId, deps)
    await deps.completeRun(runId, true, outcome, null)
    log(`assistant run executed: run=${runId} tool=${confirmed.tool}`)
    return json(200, { status: 'executed', run_id: runId, result: outcome })
  } catch (e) {
    // مصير واضح للخطأ: يُسجَّل في قيد التشغيل ويُعاد للمستدعي — لا ابتلاع
    const message = e instanceof Error ? e.message : 'execution failed'
    await deps.completeRun(runId, false, null, message)
    return jsonError(500, message)
  }
}

async function reverifyPayload(
  tool: string,
  payload: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<string | null> {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    if (!valid) return 'stored payload no longer validates'
    const group = await deps.fetchGroup(teacherId, valid.group_id)
    if (!group) return 'group no longer exists'
    return null
  }
  return `no re-verifier for tool: ${tool}`
}

async function executeAction(
  tool: string,
  payload: Record<string, unknown>,
  teacherId: string,
  deps: AssistantDeps,
): Promise<unknown> {
  if (tool === 'add_student') {
    const valid = validateAddStudentPayload(payload)
    if (!valid) throw new Error('stored payload no longer validates')
    return deps.insertStudent(teacherId, valid)
  }
  throw new Error(`no executor for tool: ${tool}`)
}
