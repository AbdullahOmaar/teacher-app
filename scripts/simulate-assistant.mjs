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
// وجولة التنفيذ (0049 + المخطط الحقيقي): إدارة مفتاح BYOK (حفظ مشفّر
// فقط، حالة بلا نص مشفّر، مالك فقط، متاحة والمساعد مطفأ)، مخطط مزوّد
// بـ HTTP مُحاكى (نداء أداة OpenAI، غياب المفتاح 422 بلا أي نداء، تنقية
// خطأ المزوّد من المفتاح نفسه، إجابة نصية Anthropic مُدقَّقة، مقترح
// Gemini يُنفَّذ بالتأكيد)، وأدوات الواجب/الحصص (قاعدة الصف الفارغ +
// توليد حصص لا يتكرر). والمخطط الحتمي الإنتاجي (3A-924): تطبيع عربي،
// نيّات منمّطة للقراءات الخمس والإجراءات (اقتراح ← تأكيد)، توضيحات
// الغموض بالقوائم، رد مصمم للإدخال غير المفهوم، وحالة needs_key=false
// في الوضع الحتمي.
//
// التشغيل: node scripts/simulate-assistant.mjs
// ============================================================================
import {
  DeterministicPlanner,
  DeterministicTestPlanner,
  PlannerError,
  ProviderPlanner,
  buildPermissionMatrix,
  computeAbsence,
  computeCollection,
  computeHomeworkSummary,
  computeUnpaid,
  extractAddedStudentName,
  handleAssistantChat,
  hashPayload,
  normalizeArabicText,
  resolvePlatformKeyConfig,
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
      { id: 's4', name: 'طالب رابع' },
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
    sessions: [
      { id: 'sess1', group_id: GROUP, session_date: '2026-11-20', start_time: '17:00', kind: 'regular', status: 'scheduled' },
      { id: 'sess2', group_id: GROUP, session_date: '2026-11-13', start_time: '17:00', kind: 'regular', status: 'held' },
    ],
    homeworkRows: [
      { session_id: 'sess1', student_id: 's1', status: 'p', homework_done: true, starred: false },
      { session_id: 'sess1', student_id: 's2', status: 'p', homework_done: false, starred: false },
      { session_id: 'sess1', student_id: 's3', status: 'a', homework_done: false, starred: false },
    ],
    generatedMonths: new Set(),
    keyRow: null,
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
    fetchGroupSessions: async (_t, groupId, limit) => world.sessions
      .filter((s) => s.group_id === groupId)
      .sort((a, b) => (b.session_date + b.start_time).localeCompare(a.session_date + a.start_time))
      .slice(0, limit),
    fetchHomeworkMarks: async (_t, sessionIds) => world.homeworkRows
      .filter((r) => sessionIds.includes(r.session_id))
      .map((r) => ({
        session_id: r.session_id, student_id: r.student_id,
        status: r.status, homework_done: r.homework_done,
      })),
    fetchSessionsInMonth: async (_t, groupId, month) => world.sessions
      .filter((s) => s.group_id === groupId && s.session_date.startsWith(month))
      .sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time)),
    fetchSession: async (_t, sessionId) => world.sessions.find((s) => s.id === sessionId) ?? null,
    fetchStudentById: async (_t, studentId) => world.students.find((s) => s.id === studentId) ?? null,
    setHomeworkMark: async (_t, sessionId, studentId, done) => {
      // نفس قاعدة التطبيق: دمج مع الصف القائم، والقيمة الفارغة تماماً = حذف
      const idx = world.homeworkRows.findIndex(
        (r) => r.session_id === sessionId && r.student_id === studentId)
      const existing = idx >= 0 ? world.homeworkRows[idx] : null
      const status = existing?.status ?? null
      const starred = existing?.starred ?? false
      if (status === null && !done && !starred) {
        if (idx >= 0) world.homeworkRows.splice(idx, 1)
        return
      }
      const row = { session_id: sessionId, student_id: studentId, status, homework_done: done, starred }
      if (idx >= 0) world.homeworkRows[idx] = row
      else world.homeworkRows.push(row)
    },
    generateGroupSessions: async (_t, groupId, monthDate) => {
      const month = monthDate.slice(0, 7)
      const key = `${groupId}:${month}`
      if (world.generatedMonths.has(key)) return 0
      world.generatedMonths.add(key)
      let created = 0
      for (const day of ['05', '12', '19', '26']) {
        world.sessions.push({
          id: `gen-${month}-${day}`, group_id: groupId,
          session_date: `${month}-${day}`, start_time: '17:00',
          kind: 'regular', status: 'scheduled',
        })
        created++
      }
      return created
    },
    encryptApiKey: async (plain) => ({
      ciphertext: `fake-enc(${Buffer.from(plain, 'utf8').toString('base64')})`,
      iv: 'aXYtdGVzdA==',
    }),
    saveProviderKey: async (_t, provider, model, baseUrl, ciphertext, iv) => {
      world.keyRow = {
        provider, model, base_url: baseUrl,
        key_ciphertext: ciphertext, key_iv: iv, updated_at: '2026-11-25T10:00:00Z',
      }
      return { is_set: true, provider, model, updated_at: world.keyRow.updated_at }
    },
    providerKeyStatus: async () => world.keyRow
      ? {
          is_set: true, provider: world.keyRow.provider,
          model: world.keyRow.model, updated_at: world.keyRow.updated_at,
        }
      : { is_set: false },
    deleteProviderKey: async () => { world.keyRow = null; return true },
    readProviderKeyRow: async () => world.keyRow
      ? {
          provider: world.keyRow.provider, model: world.keyRow.model,
          base_url: world.keyRow.base_url,
          key_ciphertext: world.keyRow.key_ciphertext, key_iv: world.keyRow.key_iv,
        }
      : null,
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

// --- مفتاح المزوّد BYOK (مهاجرة 0049) ------------------------------------------
console.log('PROVIDER KEY (BYOK):')
{
  const { world, deps } = makeWorld()
  const FAKE_KEY = 'sk-' + ['fake', 'simulated', 'provider', 'key'].join('-') + '-0000'
  // أفعال المفتاح متاحة والمساعد مطفأ — إعداد مالك لا تشغيل مساعد
  const st0 = await handleAssistantChat(
    req('owner-token', { action: 'key_status', teacher_id: TEACHER }),
    {}, deps, planner, quiet)
  const st0Body = await st0.json()
  check('key actions work while the assistant is disabled → is_set false',
    st0.status === 200 && st0Body.is_set === false, JSON.stringify(st0Body).slice(0, 200))
  const save = await handleAssistantChat(
    req('owner-token', { action: 'key_save', teacher_id: TEACHER, provider: 'gemini', api_key: FAKE_KEY }),
    {}, deps, planner, quiet)
  const saveText = JSON.stringify(await save.json())
  check('key_save stores ciphertext only; the plaintext is never in the response',
    save.status === 200 && world.keyRow !== null
      && world.keyRow.key_ciphertext !== FAKE_KEY && !saveText.includes(FAKE_KEY),
    saveText.slice(0, 200))
  const st1 = await handleAssistantChat(
    req('owner-token', { action: 'key_status', teacher_id: TEACHER }),
    {}, deps, planner, quiet)
  const st1Body = await st1.json()
  check('key_status returns metadata only (no ciphertext anywhere)',
    st1Body.is_set === true && st1Body.provider === 'gemini'
      && !('key_ciphertext' in st1Body) && !JSON.stringify(st1Body).includes('fake-enc'),
    JSON.stringify(st1Body).slice(0, 200))
  const memberSave = await handleAssistantChat(
    req('member-token', { action: 'key_save', teacher_id: TEACHER, provider: 'gemini', api_key: FAKE_KEY }),
    ON, deps, planner, quiet)
  check('member cannot save a provider key → 403', memberSave.status === 403)
  const badCompat = await handleAssistantChat(
    req('owner-token', { action: 'key_save', teacher_id: TEACHER, provider: 'openai_compatible', api_key: FAKE_KEY }),
    {}, deps, planner, quiet)
  check('openai_compatible without an https base_url → 400', badCompat.status === 400)
  const del = await handleAssistantChat(
    req('owner-token', { action: 'key_delete', teacher_id: TEACHER }),
    {}, deps, planner, quiet)
  check('key_delete removes the stored row', del.status === 200 && world.keyRow === null)
  const status = await handleAssistantChat(
    req('owner-token', { action: 'status', teacher_id: TEACHER }),
    {}, deps, planner, quiet)
  const statusBody = await status.json()
  check('status action reports enabled=false while the switch is off',
    status.status === 200 && statusBody.enabled === false && statusBody.has_key === false,
    JSON.stringify(statusBody).slice(0, 200))
}

// --- المخطط الحقيقي بـ HTTP مُحاكى ------------------------------------------------
console.log('PROVIDER PLANNER (mocked HTTP):')
{
  const { world, deps } = makeWorld()
  const API_KEY = 'sk-provider-FAKE-13579'
  const openAiDeps = {
    resolveKey: async () => ({ provider: 'openai', model: null, base_url: null, api_key: API_KEY }),
    loadGroups: async () => world.groups,
  }
  let seenUrl = ''
  let seenAuth = ''
  const openAiPlanner = new ProviderPlanner({
    ...openAiDeps,
    fetchFn: async (url, init) => {
      seenUrl = url
      seenAuth = init.headers.Authorization ?? ''
      return new Response(JSON.stringify({
        choices: [{
          message: {
            tool_calls: [{ function: { name: 'unpaid_students', arguments: '{}' } }],
          },
        }],
      }), { status: 200 })
    },
  })
  const r1 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'مين عليه متأخرات؟' }),
    ON, deps, openAiPlanner, quiet)
  const r1Text = JSON.stringify(await r1.json())
  check('provider tool call runs the read end-to-end with the teacher key',
    r1.status === 200 && seenUrl === 'https://api.openai.com/v1/chat/completions'
      && seenAuth === `Bearer ${API_KEY}` && r1Text.includes('"total_balance":1050'),
    r1Text.slice(0, 200))
  check('the API key never appears in any response', !r1Text.includes(API_KEY))

  let fetchCalled = false
  const noKeyPlanner = new ProviderPlanner({
    resolveKey: async () => null,
    loadGroups: async () => [],
    fetchFn: async () => { fetchCalled = true; return new Response('{}', { status: 200 }) },
  })
  const r2 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'أي حاجة' }),
    ON, deps, noKeyPlanner, quiet)
  const r2Body = await r2.json()
  check('no key → 422 no_api_key and zero provider calls',
    r2.status === 422 && r2Body.error.code === 'no_api_key' && fetchCalled === false,
    JSON.stringify(r2Body).slice(0, 200))

  const errPlanner = new ProviderPlanner({
    ...openAiDeps,
    fetchFn: async () => new Response(JSON.stringify({
      error: { message: `invalid api key ${API_KEY} rejected` },
    }), { status: 401 }),
  })
  const r3 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'أي حاجة' }),
    ON, deps, errPlanner, quiet)
  const r3Text = JSON.stringify(await r3.json())
  check('provider error → 502 with the key stripped from the message',
    r3.status === 502 && r3Text.includes('invalid api key') && !r3Text.includes(API_KEY),
    r3Text.slice(0, 200))

  const anthropicPlanner = new ProviderPlanner({
    resolveKey: async () => ({ provider: 'anthropic', model: null, base_url: null, api_key: API_KEY }),
    loadGroups: async () => world.groups,
    fetchFn: async () => new Response(JSON.stringify({
      content: [{ type: 'text', text: 'أهلاً بك في السنتر' }],
    }), { status: 200 }),
  })
  const runsBefore = world.runs.length
  const r4 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'أهلاً' }),
    ON, deps, anthropicPlanner, quiet)
  const r4Body = await r4.json()
  check('a text answer is audited as a read and returned',
    r4.status === 200 && r4Body.status === 'answered' && r4Body.tool === 'assistant_answer'
      && r4Body.result.text === 'أهلاً بك في السنتر' && world.runs.length === runsBefore + 1,
    JSON.stringify(r4Body).slice(0, 200))

  let geminiUrl = ''
  let geminiKeyHeader = ''
  const geminiPlanner = new ProviderPlanner({
    resolveKey: async () => ({ provider: 'gemini', model: null, base_url: null, api_key: API_KEY }),
    loadGroups: async () => world.groups,
    fetchFn: async (url, init) => {
      geminiUrl = url
      geminiKeyHeader = init.headers['x-goog-api-key'] ?? ''
      return new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              functionCall: {
                name: 'set_homework',
                args: { session_id: 'sess1', student_id: 's2', done: true },
              },
            }],
          },
        }],
      }), { status: 200 })
    },
  })
  const r5 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'علّم واجب طالب ثانٍ' }),
    ON, deps, geminiPlanner, quiet)
  const r5Body = await r5.json()
  check('gemini functionCall becomes a hash-bound proposal (zero writes yet)',
    r5.status === 200 && r5Body.status === 'proposed' && r5Body.tool === 'set_homework'
      && geminiUrl.includes(':generateContent') && geminiKeyHeader === API_KEY
      && world.homeworkRows.find((r) => r.student_id === 's2').homework_done === false,
    JSON.stringify(r5Body).slice(0, 200))
  const r5c = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: r5Body.run_id, payload_hash: r5Body.payload_hash }),
    ON, deps, geminiPlanner, quiet)
  const s2row = world.homeworkRows.find((r) => r.student_id === 's2')
  check('confirm executes set_homework preserving the attendance status',
    r5c.status === 200 && s2row.homework_done === true && s2row.status === 'p')
}

// --- أدوات الواجب والحصص -----------------------------------------------------------
console.log('HOMEWORK + SESSIONS TOOLS:')
{
  const { world, deps } = makeWorld()
  const pure = computeHomeworkSummary(
    world.sessions[0],
    world.homeworkRows,
    world.students,
  )
  check('pure homework summary counts attended only',
    pure.attended === 2 && pure.submitted === 1 && pure.pending === 1 && pure.rate === 50
      && pure.pending_students.length === 1 && pure.pending_students[0].student_id === 's2',
    JSON.stringify(pure))
  const hw = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `homework:${GROUP}` }),
    ON, deps, planner, quiet)
  const hwBody = await hw.json()
  check('homework read over the latest session',
    hw.status === 200 && hwBody.result.group_id === GROUP
      && hwBody.result.session.id === 'sess1' && hwBody.result.attended === 2
      && hwBody.result.submitted === 1,
    JSON.stringify(hwBody).slice(0, 300))
  const ov = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `sessions:${GROUP}:2026-11` }),
    ON, deps, planner, quiet)
  const ovBody = await ov.json()
  check('sessions overview counts the month',
    ov.status === 200 && ovBody.result.count === 2, JSON.stringify(ovBody).slice(0, 200))

  const p1 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'set-homework:sess1:s4:0' }),
    ON, deps, planner, quiet)
  const p1Body = await p1.json()
  const c1 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: p1Body.run_id, payload_hash: p1Body.payload_hash }),
    ON, deps, planner, quiet)
  check('set_homework done=false on an empty value creates no row (app rule)',
    c1.status === 200 && !world.homeworkRows.some((r) => r.student_id === 's4'))
  const p2 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'set-homework:sess1:s4:1' }),
    ON, deps, planner, quiet)
  const p2Body = await p2.json()
  const c2 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: p2Body.run_id, payload_hash: p2Body.payload_hash }),
    ON, deps, planner, quiet)
  const s4row = world.homeworkRows.find((r) => r.student_id === 's4')
  check('set_homework done=true creates the row with null status',
    c2.status === 200 && s4row !== undefined && s4row.homework_done === true && s4row.status === null)

  const g1 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `gen-sessions:${GROUP}:2026-12` }),
    ON, deps, planner, quiet)
  const g1Body = await g1.json()
  const gc1 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: g1Body.run_id, payload_hash: g1Body.payload_hash }),
    ON, deps, planner, quiet)
  const gc1Body = await gc1.json()
  check('generate_sessions creates the month sessions',
    gc1.status === 200 && gc1Body.result.created === 4, JSON.stringify(gc1Body).slice(0, 200))
  const g2 = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: `gen-sessions:${GROUP}:2026-12` }),
    ON, deps, planner, quiet)
  const g2Body = await g2.json()
  const gc2 = await handleAssistantChat(
    req('owner-token', { action: 'confirm', teacher_id: TEACHER, run_id: g2Body.run_id, payload_hash: g2Body.payload_hash }),
    ON, deps, planner, quiet)
  const gc2Body = await gc2.json()
  check('re-generating the same month creates zero (idempotent RPC)',
    gc2.status === 200 && gc2Body.result.created === 0, JSON.stringify(gc2Body).slice(0, 200))
}

// --- خدمة المنصة ومصفوفة الصلاحيات (مهمة 22) ------------------------------------
console.log('PLATFORM KEY + PERMISSION MATRIX (T22):')
{
  // resolvePlatformKeyConfig: دالة نقية — بلا مفتاح/بمزود غير مدعوم → null
  check('no platform key → null',
    resolvePlatformKeyConfig({ apiKey: '' }) === null
      && resolvePlatformKeyConfig({}) === null)
  check('unsupported provider → null',
    resolvePlatformKeyConfig({ apiKey: 'sk-x', provider: 'nope' }) === null)
  const plat = resolvePlatformKeyConfig({ apiKey: 'sk-platform-test', provider: 'gemini', model: 'gemini-2.0-flash' })
  check('key + provider → platform config (source platform)',
    plat !== null && plat.source === 'platform' && plat.provider === 'gemini'
      && plat.model === 'gemini-2.0-flash' && plat.api_key === 'sk-platform-test')

  // buildPermissionMatrix: مشتقة من سجل الأدوات نفسه — لا قوائم مكررة
  const matrix = buildPermissionMatrix()
  check('matrix derives reads/direct/confirm from the tool registry',
    matrix.reads.length === 5 && matrix.direct.length === 5 && matrix.confirm.length === 3
      && matrix.reads.every((e) => e.tool && e.description)
      && matrix.confirm.map((e) => e.tool).join(',') === 'add_student,set_homework,generate_sessions',
    JSON.stringify(matrix))

  const { world, deps } = makeWorld()
  // فعل permissions متاح والمساعد مطفأ — معلومة منشورة لا تشغيل
  const perm = await handleAssistantChat(
    req('owner-token', { action: 'permissions', teacher_id: TEACHER }),
    {}, deps, planner, quiet)
  const permBody = await perm.json()
  check('permissions action works while disabled → 200 + full matrix',
    perm.status === 200 && permBody.status === 'ok'
      && permBody.matrix.reads.length === 5 && permBody.matrix.confirm.length === 3,
    JSON.stringify(permBody).slice(0, 300))

  // status: مفتاح المنصة وحده → key_source platform
  const platDeps = { ...deps, platformKeyStatus: () => ({ configured: true, provider: 'openai', model: 'gpt-4o-mini' }) }
  const stPlat = await handleAssistantChat(
    req('owner-token', { action: 'status', teacher_id: TEACHER }),
    {}, platDeps, planner, quiet)
  const stPlatBody = await stPlat.json()
  check('status key_source platform with platform key and no BYOK',
    stPlat.status === 200 && stPlatBody.key_source === 'platform' && stPlatBody.has_key === true,
    JSON.stringify(stPlatBody).slice(0, 200))

  // status: صف BYOK موجود → BYOK يفوز
  world.keyRow = {
    provider: 'gemini', model: 'gemini-2.0-flash', base_url: null,
    key_ciphertext: 'fake-enc(dGVzdA==)', key_iv: 'aXYtdGVzdA==', updated_at: '2026-11-27T00:00:00Z',
  }
  const stByok = await handleAssistantChat(
    req('owner-token', { action: 'status', teacher_id: TEACHER }),
    {}, platDeps, planner, quiet)
  const stByokBody = await stByok.json()
  check('BYOK wins over the platform key in status',
    stByok.status === 200 && stByokBody.key_source === 'byok' && stByokBody.provider === 'gemini',
    JSON.stringify(stByokBody).slice(0, 200))

  // بوابة الحد: تجاوز الحد → 429 limit_reached بلا آثار جانبية
  const limitedDeps = { ...deps, checkAiLimit: async () => ({ allowed: false, limit: 100, used: 100 }) }
  const blocked = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, limitedDeps, planner, quiet)
  const blockedBody = await blocked.json()
  check('over-limit message → 429 limit_reached, zero side effects',
    blocked.status === 429 && blockedBody.error.code === 'limit_reached' && world.runs.length === 0,
    JSON.stringify(blockedBody).slice(0, 200))

  // لا دالة حد (قبل 0062) → الرسالة تمر عادياً (مسار متسامح)
  const free = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'unpaid' }),
    ON, deps, planner, quiet)
  check('limit dep absent → message flows normally', free.status === 200)
}

// --- المخطط الحتمي الإنتاجي (3A-924 — أساس المساعد من غير API) ------------------
console.log('DETERMINISTIC PLANNER (3A-924):')
{
  const { world, deps } = makeWorld()
  const det = new DeterministicPlanner({
    loadGroups: async () => world.groups,
    now: () => NOW, // 2026-11-25
  })
  const plan = (message) => det.plan({ message, teacherId: TEACHER, history: [] })

  // تطبيع: تشكيل + همزات + أرقام عربية
  check('normalize: diacritics/hamza/Arabic-Indic digits',
    normalizeArabicText('المُتأخِّرينَ ٥ مرات') === 'المتاخرين 5 مرات',
    normalizeArabicText('المُتأخِّرينَ ٥ مرات'))

  // القراءات بالعربية المنمّطة
  const unpaid = await plan('مين عليه متأخرات؟')
  check('«مين عليه متأخرات؟» → read unpaid_students',
    unpaid.type === 'read' && unpaid.tool === 'unpaid_students', JSON.stringify(unpaid))
  const absence5 = await plan('مين غاب أكتر من ٥ مرات؟')
  check('«غاب أكتر من ٥» → absence_summary min 5 (Arabic-Indic digit)',
    absence5.type === 'read' && absence5.tool === 'absence_summary'
      && absence5.args.min_absences === 5, JSON.stringify(absence5))
  const absenceDefault = await plan('مين غاب كتير؟')
  check('«مين غاب كتير؟» → absence_summary min 3 (default)',
    absenceDefault.type === 'read' && absenceDefault.args.min_absences === 3,
    JSON.stringify(absenceDefault))
  const collMonth = await plan('حصّلت كام الشهر ده؟')
  check('«حصّلت كام الشهر ده؟» → collection 2026-11 full month',
    collMonth.type === 'read' && collMonth.tool === 'collection_summary'
      && collMonth.args.from === '2026-11-01' && collMonth.args.to === '2026-11-30',
    JSON.stringify(collMonth))
  const collPrev = await plan('حصّلت كام الشهر اللي فات؟')
  check('«الشهر اللي فات» → collection 2026-10 full month',
    collPrev.type === 'read' && collPrev.args.from === '2026-10-01'
      && collPrev.args.to === '2026-10-31', JSON.stringify(collPrev))
  const collRange = await plan('التحصيل من 1/11/2026 إلى 20/11/2026')
  check('explicit «من .. إلى ..» range (DD/MM/YYYY) → collection range',
    collRange.type === 'read' && collRange.tool === 'collection_summary'
      && collRange.args.from === '2026-11-01' && collRange.args.to === '2026-11-20',
    JSON.stringify(collRange))
  const hw = await plan('واجب مجموعة السبت')
  check('«واجب مجموعة السبت» → homework_summary for the named group',
    hw.type === 'read' && hw.tool === 'homework_summary' && hw.args.group_id === GROUP,
    JSON.stringify(hw))
  const hwBare = await plan('الواجب')
  check('«الواجب» with a single group in the centre → that group (no ambiguity)',
    hwBare.type === 'read' && hwBare.tool === 'homework_summary'
      && hwBare.args.group_id === GROUP, JSON.stringify(hwBare))
  const sessNamed = await plan('حصص مجموعة السبت شهر ديسمبر')
  check('«حصص .. شهر ديسمبر» → sessions_overview 2026-12',
    sessNamed.type === 'read' && sessNamed.tool === 'sessions_overview'
      && sessNamed.args.group_id === GROUP && sessNamed.args.month === '2026-12',
    JSON.stringify(sessNamed))
  const sessDefault = await plan('حصص مجموعة السبت')
  check('«حصص ..» without a month → current month 2026-11',
    sessDefault.type === 'read' && sessDefault.args.month === '2026-11',
    JSON.stringify(sessDefault))

  // الإجراءات بالعربية المنمّطة → اقتراحات (لا تنفيذ مباشر أبداً)
  const gen = await plan('ولّد حصص مجموعة السبت الشهر الجاي')
  check('«ولّد حصص .. الشهر الجاي» → action generate_sessions 2026-12',
    gen.type === 'action' && gen.tool === 'generate_sessions'
      && gen.payload.group_id === GROUP && gen.payload.month === '2026-12',
    JSON.stringify(gen))
  const genNoMonth = await plan('ولّد حصص مجموعة السبت')
  check('generate without a month → clarification answer (no guess)',
    genNoMonth.type === 'answer' && genNoMonth.text.includes('لأي شهر'),
    JSON.stringify(genNoMonth))
  const add = await plan('أضف طالب كريم سامي في مجموعة السبت')
  check('«أضف طالب ..» → action add_student, raw name preserved',
    add.type === 'action' && add.tool === 'add_student'
      && add.payload.name === 'كريم سامي' && add.payload.group_id === GROUP
      && !('phone' in add.payload), JSON.stringify(add))
  const addPhone = await plan('أضف طالبة فاطمة علي في مجموعة السبت 01001234567')
  check('«أضف طالبة .. <phone>» → name keeps ة + phone extracted',
    addPhone.type === 'action' && addPhone.payload.name === 'فاطمة علي'
      && addPhone.payload.phone === '01001234567', JSON.stringify(addPhone))
  check('extractAddedStudentName: طالباً tanween is not part of the name',
    extractAddedStudentName('أضف طالباً كريم سامي في مجموعة السبت') === 'كريم سامي',
    extractAddedStudentName('أضف طالباً كريم سامي في مجموعة السبت'))

  // التوضيحات والردود المصممة — لا خطأ خام ولا فهم مزيّف
  const detTwo = new DeterministicPlanner({
    loadGroups: async () => [
      { id: 'g-sat', name: 'مجموعة السبت' },
      { id: 'g-sat-tue', name: 'مجموعة السبت والثلاثاء' },
    ],
    now: () => NOW,
  })
  const ambiguous = await detTwo.plan({
    message: 'واجب مجموعة السبت والثلاثاء', teacherId: TEACHER, history: [],
  })
  check('name matching two groups → clarification listing both (no guess)',
    ambiguous.type === 'answer' && ambiguous.text.includes('بيطابق أكتر من مجموعة')
      && ambiguous.text.includes('مجموعة السبت والثلاثاء'), JSON.stringify(ambiguous))
  const detNoName = new DeterministicPlanner({
    loadGroups: async () => [
      { id: 'g-sat', name: 'مجموعة السبت' },
      { id: 'g-mon', name: 'مجموعة الاثنين' },
    ],
    now: () => NOW,
  })
  const noName = await detNoName.plan({ message: 'الواجب', teacherId: TEACHER, history: [] })
  check('group intent without a name (2 groups) → clarification listing groups',
    noName.type === 'answer' && noName.text.includes('محتاج اسم المجموعة')
      && noName.text.includes('مجموعة الاثنين'), JSON.stringify(noName))
  const help = await plan('مساعدة')
  check('«مساعدة» → capabilities answer built from the tool registry',
    help.type === 'answer' && help.text.includes('مساعد إجراءات سريع')
      && help.text.includes('المتأخرون'), JSON.stringify(help).slice(0, 200))
  const unknown = await plan('إيه أخبار الطقس النهاردة؟')
  check('unknown input → designed fallback answer (never a throw, never fake understanding)',
    unknown.type === 'answer' && unknown.text.includes('مش فاهم الصياغة دي')
      && unknown.text.includes('بطاقة تأكيد'), JSON.stringify(unknown).slice(0, 200))
  const setHw = await plan('علّم واجب أحمد')
  check('natural set-homework → honest patterned-form hint (no execution)',
    setHw.type === 'answer' && setHw.text.includes('set-homework:'),
    JSON.stringify(setHw).slice(0, 200))

  // النحو الحرفي يبقى كما هو داخل المخطط الحتمي
  const strict = await plan('unpaid')
  check('strict «unpaid» still routes via the deterministic planner',
    strict.type === 'read' && strict.tool === 'unpaid_students', JSON.stringify(strict))
  let strictErr = null
  try {
    await plan('collect:bad:dates')
  } catch (e) {
    strictErr = e
  }
  check('malformed strict command → explicit PlannerError (designed, not silent)',
    strictErr instanceof PlannerError, String(strictErr))

  // التوجيه عبر المعالج الكامل: الحالة بلا مفتاح + قراءة تُنفَّذ +
  // إجراء يُقترح بلا كتابة ثم يُنفَّذ بالتأكيد + عضو بلا صلاحية مال 403
  const DET_ON = { ASSISTANT_ENABLED: 'true', ASSISTANT_PLANNER: 'deterministic' }
  const stDet = await handleAssistantChat(
    req('owner-token', { action: 'status', teacher_id: TEACHER }),
    DET_ON, deps, det, quiet)
  const stDetBody = await stDet.json()
  check('status in deterministic mode → needs_key false + planner_mode deterministic',
    stDet.status === 200 && stDetBody.needs_key === false
      && stDetBody.planner_mode === 'deterministic' && stDetBody.has_key === false,
    JSON.stringify(stDetBody).slice(0, 200))
  const stProv = await handleAssistantChat(
    req('owner-token', { action: 'status', teacher_id: TEACHER }),
    ON, deps, det, quiet)
  const stProvBody = await stProv.json()
  check('status without deterministic mode → needs_key true (provider default)',
    stProv.status === 200 && stProvBody.needs_key === true
      && stProvBody.planner_mode === 'provider', JSON.stringify(stProvBody).slice(0, 200))

  const readMsg = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'مين عليه متأخرات؟' }),
    DET_ON, deps, det, quiet)
  const readBody = await readMsg.json()
  check('handler: Arabic unpaid read executes → 200 answered unpaid_students',
    readMsg.status === 200 && readBody.status === 'answered'
      && readBody.tool === 'unpaid_students', JSON.stringify(readBody).slice(0, 200))
  const hwMsg = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'واجب مجموعة السبت' }),
    DET_ON, deps, det, quiet)
  const hwBody = await hwMsg.json()
  check('handler: Arabic homework read executes → 200 answered homework_summary',
    hwMsg.status === 200 && hwBody.status === 'answered'
      && hwBody.tool === 'homework_summary', JSON.stringify(hwBody).slice(0, 200))
  const unkMsg = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'كلام مش مفهوم خالص' }),
    DET_ON, deps, det, quiet)
  const unkBody = await unkMsg.json()
  check('handler: unknown input → 200 answered assistant_answer with the fallback text',
    unkMsg.status === 200 && unkBody.status === 'answered'
      && unkBody.tool === 'assistant_answer'
      && unkBody.result.text.includes('مش فاهم الصياغة دي'),
    JSON.stringify(unkBody).slice(0, 200))
  const memberMsg = await handleAssistantChat(
    req('member-token', { action: 'message', teacher_id: TEACHER, message: 'مين عليه متأخرات؟' }),
    DET_ON, deps, det, quiet)
  check('handler: member without can_view_money → 403 on the Arabic money read',
    memberMsg.status === 403, String(memberMsg.status))

  const addMsg = await handleAssistantChat(
    req('owner-token', { action: 'message', teacher_id: TEACHER, message: 'أضف طالب كريم سامي في مجموعة السبت' }),
    DET_ON, deps, det, quiet)
  const addBody = await addMsg.json()
  check('handler: Arabic add-student → proposal only, zero business writes',
    addMsg.status === 200 && addBody.status === 'proposed'
      && addBody.tool === 'add_student' && world.insertedStudents.length === 0,
    JSON.stringify(addBody).slice(0, 200))
  const addConfirm = await handleAssistantChat(
    req('owner-token', {
      action: 'confirm', teacher_id: TEACHER,
      run_id: addBody.run_id, payload_hash: addBody.payload_hash,
    }),
    DET_ON, deps, det, quiet)
  check('handler: confirming the Arabic proposal executes exactly once',
    addConfirm.status === 200 && world.insertedStudents.length === 1
      && world.insertedStudents[0].name === 'كريم سامي',
    JSON.stringify(world.insertedStudents))
}

console.log(failures === 0 ? '\nALL SIMULATION CHECKS PASSED' : `\n${failures} SIMULATION CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
