// ============================================================================
// محاكاة محلية كاملة لدالة assistant-chat (Phase 2 T6 — خطة ب، مهاجرة 0048)
// ----------------------------------------------------------------------------
// تشغّل نفس core.ts الذي يعمل في الإنتاج حرفياً، مع اعتماديات وهمية في
// الذاكرة تحاكي عقد دوال RPC في 0048 (حارس الممثل، ربط الهاش، الانتهاء،
// انتقالات الحالة) — بلا أي اتصال بـ Supabase أو أي مزوّد ذكاء. سلوك
// الدوال الحية نفسه تغطيه اختبارات التفويض (scripts/authz_tests.py).
//
// تغطي: Kill switch ‏503 بلا أثر، بلا JWT ‏401، غريب 403، قراءات حتمية
// (متأخرات/غياب/تحصيل) بأرقام محسوبة يدوياً، بوابات الصلاحيات (عضو بلا
// can_view_money لا يلمس البيانات المالية أصلاً)، دوال الحساب النقية،
// ثبات هاش الحمولة ضد ترتيب المفاتيح، ودورة التأكيد كاملة: اقتراح بلا
// أي كتابة ← تأكيد بهاش خاطئ مرفوض ← إيقاف = صفر كتابات ← اقتراح جديد
// ← تأكيد صحيح ينفّذ مرة واحدة ← مقترح منتهٍ مرفوض ← إلغاء = صفر
// كتابات ← فشل إعادة التحقق (مجموعة حُذفت) يغلق التشغيل failed بلا كتابة.
//
// التشغيل: node scripts/simulate-assistant.mjs
// ============================================================================
import {
  DeterministicTestPlanner,
  computeAbsence,
  computeCollection,
  computeUnpaid,
  handleAssistantChat,
  hashPayload,
} from '../supabase/functions/assistant-chat/core.ts'

const OWNER = '11111111-1111-4111-8111-111111111111'
const MEMBER = '22222222-2222-4222-8222-222222222222'
const STRANGER = '99999999-9999-4999-8999-999999999999'
const TEACHER = '33333333-3333-4333-8333-333333333333'
const GROUP = '44444444-4444-4444-8444-444444444444'
const NOW = Date.parse('2026-11-25T10:00:00Z')

let failures = 0
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name} ${extra}`)
  }
}

// --- مخزن وهمي يحاكي عقد 0048 ------------------------------------------------
function makeWorld() {
  const world = {
    currentUser: null,
    balances: [
      { invoice_id: 'i1', student_id: 's1', group_id: GROUP, period_month: '2026-10-01', total: 500, paid: 200, balance: 300 },
      { invoice_id: 'i2', student_id: 's1', group_id: GROUP, period_month: '2026-11-01', total: 500, paid: 0, balance: 500 },
      { invoice_id: 'i3', student_id: 's2', group_id: GROUP, period_month: '2026-11-01', total: 400, paid: 400, balance: 0 },
      { invoice_id: 'i4', student_id: 's3', group_id: GROUP, period_month: '2026-09-01', total: 350, paid: 100, balance: 250 },
    ],
    students: [
      { id: 's1', name: 'طالب أول' },
      { id: 's2', name: 'طالب ثانٍ' },
      { id: 's3', name: 'طالب ثالث' },
    ],
    attendance: [
      { student_id: 's1', status: 'a' }, { student_id: 's1', status: 'a' },
      { student_id: 's1', status: 'a' }, { student_id: 's1', status: 'p' },
      { student_id: 's2', status: 'a' }, { student_id: 's2', status: 'l' },
      { student_id: 's3', status: null }, { student_id: 's3', status: 'p' },
    ],
    payments: [
      { amount: 200, method: 'cash', paid_on: '2026-11-03' },
      { amount: 150, method: 'instapay', paid_on: '2026-11-10' },
      { amount: -50, method: 'cash', paid_on: '2026-11-12' }, // عكس دفعة
    ],
    groups: [{ id: GROUP, name: 'مجموعة السبت' }],
    insertedStudents: [],
    enrollments: [],
    runs: [],
    balancesFetched: 0,
  }
  let runSeq = 0
  const contexts = {
    [OWNER]: { role: 'owner', permissions: {} },
    [MEMBER]: {
      role: 'assistant',
      permissions: { can_take_attendance: true }, // بلا مال وبلا إدارة طلاب
    },
  }
  const deps = {
    getUserId: async (req) => {
      const auth = req.headers.get('Authorization') ?? ''
      const token = auth.replace('Bearer ', '')
      world.currentUser = token === 'owner-token' ? OWNER
        : token === 'member-token' ? MEMBER
        : token === 'stranger-token' ? STRANGER
        : null
      return world.currentUser
    },
    getCallerContext: async (_teacherId, userId) => contexts[userId] ?? null,
    fetchBalances: async () => { world.balancesFetched++; return world.balances },
    fetchStudents: async () => world.students,
    fetchAttendance: async () => world.attendance,
    fetchPayments: async () => world.payments,
    fetchGroup: async (_t, groupId) => world.groups.find((g) => g.id === groupId) ?? null,
    insertStudent: async (_t, payload) => {
      const id = `new-${world.insertedStudents.length + 1}`
      world.insertedStudents.push({ id, ...payload })
      world.enrollments.push({ student_id: id, group_id: payload.group_id })
      return { student_id: id }
    },
    beginRead: async (teacherId, tool, request, result) => {
      const id = `run-${++runSeq}`
      world.runs.push({ id, teacher_id: teacherId, actor: world.currentUser, kind: 'read', tool, request, status: 'answered', result })
      return id
    },
    createProposal: async (teacherId, tool, request, payload, payloadHash) => {
      const id = `run-${++runSeq}`
      const expires = new Date(NOW + 600_000).toISOString()
      world.runs.push({
        id, teacher_id: teacherId, actor: world.currentUser, kind: 'action', tool,
        request, payload, payload_hash: payloadHash, status: 'proposed', expires_at: expires,
      })
      return { id, payload_hash: payloadHash, expires_at: expires }
    },
    confirmProposal: async (runId, payloadHash) => {
      const run = world.runs.find((r) => r.id === runId)
      if (!run) return { ok: false, error: 'run not found' }
      if (run.actor !== world.currentUser) return { ok: false, error: 'only the proposer can confirm' }
      if (run.status === 'proposed' && Date.parse(run.expires_at) < NOW) {
        run.status = 'expired'
        return { ok: false, error: 'proposal expired' }
      }
      if (run.status !== 'proposed') return { ok: false, error: 'proposal not pending' }
      if (run.payload_hash !== payloadHash) return { ok: false, error: 'payload hash mismatch' }
      run.status = 'confirmed'
      return { ok: true, teacher_id: run.teacher_id, tool: run.tool, payload: run.payload }
    },
    completeRun: async (runId, success, result, error) => {
      const run = world.runs.find((r) => r.id === runId)
      if (!run || run.status !== 'confirmed') return false
      run.status = success ? 'executed' : 'failed'
      run.result = result
      run.error = error
      return true
    },
    cancelRun: async (runId, reason) => {
      const run = world.runs.find((r) => r.id === runId)
      if (!run) return { ok: false, error: 'run not found' }
      if (run.status !== 'proposed' && run.status !== 'confirmed') {
        return { ok: false, error: 'run already finished' }
      }
      run.status = reason
      return { ok: true }
    },
    now: () => NOW,
  }
  return { world, deps }
}

function req(token, body) {
  return new Request('http://local/assistant-chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
}

const planner = new DeterministicTestPlanner()
const ON = { ASSISTANT_ENABLED: 'true' }
const quiet = () => {}

// --- دوال نقية ---------------------------------------------------------------
console.log('PURE FUNCTIONS:')
{
  const unpaid = computeUnpaid(
    [
      { invoice_id: 'a', student_id: 's1', group_id: 'g', period_month: '2026-10-01', total: 500, paid: 200, balance: 300 },
      { invoice_id: 'b', student_id: 's1', group_id: 'g', period_month: '2026-11-01', total: 500, paid: 0, balance: 500 },
      { invoice_id: 'c', student_id: 's2', group_id: 'g', period_month: '2026-11-01', total: 100, paid: 100, balance: 0 },
    ],
    [{ id: 's1', name: 'أول' }, { id: 's2', name: 'ثانٍ' }],
    '2026-11-01',
  )
  check('unpaid aggregates per student and splits overdue',
    unpaid.count === 1 && unpaid.students[0].balance === 800
      && unpaid.students[0].overdue_balance === 300 && unpaid.total_balance === 800,
    JSON.stringify(unpaid))
  const absence = computeAbsence(
    [
      { student_id: 's1', status: 'a' }, { student_id: 's1', status: 'a' },
      { student_id: 's1', status: 'p' }, { student_id: 's2', status: 'a' },
      { student_id: 's2', status: null },
    ],
    [{ id: 's1', name: 'أول' }, { id: 's2', name: 'ثانٍ' }],
    2,
  )
  check('absence counts only a-status and applies the threshold',
    absence.students.length === 1 && absence.students[0].absences === 2
      && absence.total_absences === 3 && absence.marked_rows === 4,
    JSON.stringify(absence))
  const collection = computeCollection([
    { amount: 200, method: 'cash', paid_on: '2026-11-03' },
    { amount: -50, method: 'cash', paid_on: '2026-11-12' },
    { amount: 150, method: 'instapay', paid_on: '2026-11-10' },
  ])
  check('collection is net of reversal rows, split by method',
    collection.total === 300 && collection.by_method.cash === 150
      && collection.by_method.instapay === 150 && collection.count === 3,
    JSON.stringify(collection))
  const h1 = await hashPayload({ name: 'طالب', group_id: 'g', phone: '0100' })
  const h2 = await hashPayload({ phone: '0100', group_id: 'g', name: 'طالب' })
  check('payload hash is key-order independent', h1 === h2 && h1.length === 64)
}

// --- البوابات ----------------------------------------------------------------
console.log('GATES:')
{
  const { world, deps } = makeWorld()
  const off = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    {}, deps, planner, quiet)
  check('kill switch off → 503 and zero side effects',
    off.status === 503 && world.runs.length === 0 && world.balancesFetched === 0)
  const noJwt = await handleAssistantChat(
    req(null, { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, deps, planner, quiet)
  check('missing JWT → 401', noJwt.status === 401)
  const stranger = await handleAssistantChat(
    req('stranger-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, deps, planner, quiet)
  check('non-member → 403', stranger.status === 403)
  const unknown = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'اكتب قصيدة' }),
    ON, deps, planner, quiet)
  const unknownBody = await unknown.json()
  check('unknown message → 422 (test planner is not a model)',
    unknown.status === 422 && String(unknownBody.error.message).includes('not a model'),
    JSON.stringify(unknownBody))
}

// --- القراءات ------------------------------------------------------------------
console.log('READS:')
{
  const { world, deps } = makeWorld()
  const unpaid = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, deps, planner, quiet)
  const unpaidBody = await unpaid.json()
  check('owner unpaid → answered with computed arrears',
    unpaid.status === 200 && unpaidBody.status === 'answered'
      && unpaidBody.result.total_balance === 1050 && unpaidBody.result.count === 2
      && unpaidBody.result.students[0].student_id === 's1',
    JSON.stringify(unpaidBody).slice(0, 200))
  check('read is audited as answered',
    world.runs.length === 1 && world.runs[0].status === 'answered' && world.runs[0].kind === 'read')

  const memberUnpaid = await handleAssistantChat(
    req('member-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, deps, planner, quiet)
  check('member without can_view_money → 403 before any data fetch',
    memberUnpaid.status === 403 && world.balancesFetched === 1,
    `fetched=${world.balancesFetched}`)

  const memberAbsence = await handleAssistantChat(
    req('member-token', { action: 'message', teacher_id: TEACHER, message: 'absence' }),
    ON, deps, planner, quiet)
  const absenceBody = await memberAbsence.json()
  check('attendance member reads absence summary',
    memberAbsence.status === 200 && absenceBody.result.students.length === 1
      && absenceBody.result.students[0].absences === 3,
    JSON.stringify(absenceBody).slice(0, 200))

  const collect = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'collect:2026-11-01:2026-11-30' }),
    ON, deps, planner, quiet)
  const collectBody = await collect.json()
  check('collection summary over the period is net',
    collect.status === 200 && collectBody.result.total === 300,
    JSON.stringify(collectBody).slice(0, 200))
}

// --- دورة التأكيد ---------------------------------------------------------------
console.log('CONFIRMATION FLOW:')
{
  const { world, deps } = makeWorld()
  const propose = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب جديد:${GROUP}` }),
    ON, deps, planner, quiet)
  const proposeBody = await propose.json()
  check('proposal created with hash and expiry',
    propose.status === 200 && proposeBody.status === 'proposed'
      && typeof proposeBody.payload_hash === 'string' && proposeBody.payload_hash.length === 64,
    JSON.stringify(proposeBody).slice(0, 200))
  check('proposal writes zero business rows',
    world.insertedStudents.length === 0 && world.enrollments.length === 0)

  const wrongHash = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: proposeBody.run_id, payload_hash: 'f'.repeat(64) }),
    ON, deps, planner, quiet)
  check('confirm with wrong hash → 409, still zero writes',
    wrongHash.status === 409 && world.insertedStudents.length === 0
      && world.runs[0].status === 'proposed')

  const stop = await handleAssistantChat(
    req('owner-token', { action: 'stop', teacher_id: TEACHER, run_id: proposeBody.run_id }),
    ON, deps, planner, quiet)
  check('stop cancels the pending proposal',
    stop.status === 200 && world.runs[0].status === 'stopped')
  const confirmStopped = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: proposeBody.run_id, payload_hash: proposeBody.payload_hash }),
    ON, deps, planner, quiet)
  check('confirm after stop → 409 and zero writes',
    confirmStopped.status === 409 && world.insertedStudents.length === 0)

  // مقترح ثانٍ يُنفَّذ
  const propose2 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب منفذ:${GROUP}` }),
    ON, deps, planner, quiet)
  const propose2Body = await propose2.json()
  const confirm2 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: propose2Body.run_id, payload_hash: propose2Body.payload_hash }),
    ON, deps, planner, quiet)
  const confirm2Body = await confirm2.json()
  check('confirm with the stored hash executes exactly once',
    confirm2.status === 200 && confirm2Body.status === 'executed'
      && world.insertedStudents.length === 1 && world.enrollments.length === 1
      && world.runs[1].status === 'executed',
    JSON.stringify(confirm2Body).slice(0, 200))

  // مقترح منتهٍ
  const propose3 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب منتهٍ:${GROUP}` }),
    ON, deps, planner, quiet)
  const propose3Body = await propose3.json()
  world.runs[2].expires_at = new Date(NOW - 1000).toISOString()
  const confirmExpired = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: propose3Body.run_id, payload_hash: propose3Body.payload_hash }),
    ON, deps, planner, quiet)
  check('expired proposal → 409, marked expired, zero writes',
    confirmExpired.status === 409 && world.runs[2].status === 'expired'
      && world.insertedStudents.length === 1)

  // إلغاء صريح
  const propose4 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب ملغي:${GROUP}` }),
    ON, deps, planner, quiet)
  const propose4Body = await propose4.json()
  const cancel = await handleAssistantChat(
    req('owner-token', { action: 'cancel', teacher_id: TEACHER, run_id: propose4Body.run_id }),
    ON, deps, planner, quiet)
  check('cancel → cancelled with zero writes',
    cancel.status === 200 && world.runs[3].status === 'cancelled'
      && world.insertedStudents.length === 1)

  // فشل إعادة التحقق: المجموعة حُذفت بعد الاقتراح
  const propose5 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب يتيم:${GROUP}` }),
    ON, deps, planner, quiet)
  const propose5Body = await propose5.json()
  world.groups = []
  const confirm5 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: propose5Body.run_id, payload_hash: propose5Body.payload_hash }),
    ON, deps, planner, quiet)
  check('re-verify failure → 422, run failed, zero writes',
    confirm5.status === 422 && world.runs[4].status === 'failed'
      && world.insertedStudents.length === 1,
    `status=${confirm5.status} run=${world.runs[4].status}`)

  // عضو بلا can_manage_students لا يقترح كتابة أصلاً
  const memberPropose = await handleAssistantChat(
    req('member-token', { action: 'message', teacher_id: TEACHER, message: `add-student:طالب عضو:${GROUP}` }),
    ON, deps, planner, quiet)
  check('member without can_manage_students → 403 on propose',
    memberPropose.status === 403 && world.runs.length === 5)
}

console.log(failures === 0 ? '\nALL SIMULATION CHECKS PASSED' : `\n${failures} SIMULATION CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
