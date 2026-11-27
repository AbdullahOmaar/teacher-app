// ============================================================================
// تطبيق المدرس — Edge Function: assistant-chat (Phase 2 T6 — خطة ب)
// ----------------------------------------------------------------------------
// مدخل Deno فقط: المنطق كله في core.ts (نقي وقابل للمحاكاة محلياً).
// التصميم الكامل: docs/PHASE2-T6-PREP.md ‏(§2 المدخلات + §4 خطة ب)
// ومهاجرتا 0048 (assistant_runs + التأكيد) و0049 (مفتاح المزوّد BYOK).
//
// verify_jwt مفعّل على مستوى المنصة لهذه الدالة: المستدعي مستخدم حقيقي
// بـ JWT من التطبيق. الأسرار (أسماء فقط):
// • ASSISTANT_ENABLED — Kill switch المنصة لأفعال المحادثة (غير مضبوط
//   = OFF). أفعال إدارة المفتاح والحالة لا يخضعان له (إعداد مالك).
// • ASSISTANT_KEY_ENCRYPTION_KEY — مفتاح تشفير AES-GCM (32 بايت base64)
//   لمفاتيح المزوّدات: التشفير/الفك خادمي هنا فقط، والمفاتيح الصريحة
//   لا تُسجَّل ولا تخرج في أي رد.
// • ASSISTANT_PLATFORM_API_KEY (+ ASSISTANT_PLATFORM_PROVIDER/MODEL/
//   BASE_URL) — مفتاح المنصة المركزي (مهمة 22): يُحلّ بعد BYOK فقط
//   عند غيابه. غيابه = المسار نائم. ضبط قيمة حيّة له قرار مالك تجاري
//   (التكلفة والاشتراكات) — لا يُضبط في هذا التكليف إطلاقاً، والمفاتيح
//   المستخدمة هنا للاختبار فقط.
// • ASSISTANT_PLANNER — 'test' يركّب المخطط الاختباري الحتمي (للطيار
//   والتحقق الوظيفي فقط)؛ أي قيمة أخرى/غيابه = مخطط المزوّد الحقيقي.
// • SUPABASE_URL + مفتاح المنصة المحقون SUPABASE_PUBLISHABLE_KEYS
//   لعميل المستدعي (مدخل default — وبرجوع للمحفوظ القديم حتى يُعطَّل،
//   نمط ترحيل المفاتيح 3A-695).
//
// ⚠️ لا عميل إدارة (service role) في هذه الدالة إطلاقاً — بقاعدة التجهيز
// §2-2: المساعد يعمل بهوية المستدعي دائماً؛ قراءاته وكتاباته بعميل
// بتوكن المستدعي فتخضع لـ RLS، وكتابات سجل التشغيل ومفتاح المزوّد عبر
// دوال RPC محروسة (0048/0049) بنفس التوكن. أي احتياج مستقبلي لمفتاح
// إدارة يُرفض تصميمياً لا يُمرَّر.
// ============================================================================

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  DeterministicTestPlanner,
  PlannerError,
  ProviderPlanner,
  aesGcmDecrypt,
  aesGcmEncrypt,
  handleAssistantChat,
  parseEncryptionKey,
  resolvePlatformKeyConfig,
  type AddStudentPayload,
  type AssistantDeps,
  type AssistantEnv,
  type CallerContext,
  type ConfirmOutcome,
  type ProviderId,
  type ProviderKeyConfig,
  type StoredKeyRow,
} from './core.ts'

// مفتاح المشروع القابل للنشر — تحقنه المنصة JSON بأسمائه في
// SUPABASE_PUBLISHABLE_KEYS. مفتاح النوع هو 'default'، وبغيابه نرجع
// للمحفوظ القديم المقابل (صالح حتى تعطيل القديم).
function injectedKeys(envName: string): Record<string, string> {
  try {
    const raw = Deno.env.get(envName)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value) out[name] = value
    }
    return out
  } catch {
    return {} // بيئة بلا مفاتيح جديدة — يبقى الرجوع للقديم وحده
  }
}
const PUBLISHABLE_KEY = injectedKeys('SUPABASE_PUBLISHABLE_KEYS')['default'] ??
  Deno.env.get('SUPABASE_ANON_KEY') ?? ''

/** عميل بتوكن المستدعي: كل قراءة وكتابة في هذه الدالة تمر به فقط */
function callerClient(req: Request): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    PUBLISHABLE_KEY,
    {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

const SESSION_COLS = 'id, group_id, session_date, start_time, kind, status'

function mapSession(r: Record<string, unknown>) {
  return {
    id: String(r.id),
    group_id: String(r.group_id),
    session_date: String(r.session_date),
    start_time: String(r.start_time),
    kind: String(r.kind),
    status: String(r.status),
  }
}

/** قراءة صف المفتاح المشفّر عبر RPC 0049 — يرمي عند خطأ RPC، وnull عند غياب الصف */
async function readKeyRow(
  db: () => SupabaseClient,
  teacherId: string,
): Promise<StoredKeyRow | null> {
  const { data, error } = await db().rpc('assistant_read_provider_key', {
    p_teacher_id: teacherId,
  })
  if (error) throw new Error(`provider key read failed: ${error.message}`)
  if (!isRecord(data)) return null
  return {
    provider: String(data.provider ?? ''),
    model: typeof data.model === 'string' ? data.model : null,
    base_url: typeof data.base_url === 'string' ? data.base_url : null,
    key_ciphertext: String(data.key_ciphertext ?? ''),
    key_iv: String(data.key_iv ?? ''),
  }
}

function makeDeps(req: Request): AssistantDeps {
  const db = () => callerClient(req)
  return {
    getUserId: async (r) => {
      const authHeader = r.headers.get('Authorization') ?? ''
      if (!authHeader) return null
      const { data, error } = await callerClient(r).auth.getUser()
      if (error || !data.user) return null
      return data.user.id
    },
    getCallerContext: async (teacherId, userId) => {
      const client = db()
      const { data: owned } = await client
        .from('teachers')
        .select('id')
        .eq('id', teacherId)
        .eq('owner_user_id', userId)
        .maybeSingle()
      if (owned) return { role: 'owner', permissions: {} } satisfies CallerContext
      const { data: member } = await client
        .from('teacher_members')
        .select('permissions')
        .eq('teacher_id', teacherId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle()
      if (!member) return null
      const raw = (member as { permissions?: unknown }).permissions
      const permissions: Record<string, boolean> = {}
      if (typeof raw === 'object' && raw !== null) {
        for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
          if (typeof v === 'boolean') permissions[k] = v
        }
      }
      return { role: 'assistant', permissions } satisfies CallerContext
    },
    fetchBalances: async (teacherId) => {
      const { data, error } = await db()
        .from('invoice_balances')
        .select('invoice_id, student_id, group_id, period_month, total, paid, balance')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`balances fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        invoice_id: String(r.invoice_id),
        student_id: String(r.student_id),
        group_id: String(r.group_id),
        period_month: String(r.period_month),
        total: Number(r.total) || 0,
        paid: Number(r.paid) || 0,
        balance: Number(r.balance) || 0,
      }))
    },
    fetchStudents: async (teacherId) => {
      const { data, error } = await db()
        .from('students')
        .select('id, name')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`students fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }))
    },
    fetchAttendance: async (teacherId) => {
      const { data, error } = await db()
        .from('attendance')
        .select('student_id, status')
        .eq('teacher_id', teacherId)
      if (error) throw new Error(`attendance fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        student_id: String(r.student_id),
        status: r.status === null ? null : String(r.status),
      }))
    },
    fetchPayments: async (teacherId, from, to) => {
      const { data, error } = await db()
        .from('payments')
        .select('amount, method, paid_on')
        .eq('teacher_id', teacherId)
        .gte('paid_on', from)
        .lte('paid_on', to)
      if (error) throw new Error(`payments fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        amount: Number(r.amount) || 0,
        method: String(r.method),
        paid_on: String(r.paid_on),
      }))
    },
    fetchGroup: async (teacherId, groupId) => {
      const { data, error } = await db()
        .from('groups')
        .select('id, name')
        .eq('teacher_id', teacherId)
        .eq('id', groupId)
        .maybeSingle()
      if (error || !data) return null
      return { id: String(data.id), name: String(data.name) }
    },
    insertStudent: async (teacherId: string, payload: AddStudentPayload) => {
      const client = db()
      const { data, error } = await client
        .from('students')
        .insert({
          teacher_id: teacherId,
          name: payload.name,
          phone: payload.phone ?? null,
          guardian_name: payload.guardian_name ?? null,
          guardian_phone: payload.guardian_phone ?? null,
          grade: payload.grade ?? null,
        })
        .select('id')
        .single()
      if (error || !data) {
        throw new Error(`student insert failed: ${error?.message ?? 'no row returned'}`)
      }
      const studentId = String(data.id)
      const { error: enrollError } = await client
        .from('enrollments')
        .insert({ teacher_id: teacherId, student_id: studentId, group_id: payload.group_id })
      if (enrollError) {
        throw new Error(`enrollment insert failed: ${enrollError.message}`)
      }
      return { student_id: studentId }
    },
    beginRead: async (teacherId, tool, request, result) => {
      const { data, error } = await db().rpc('assistant_begin_read', {
        p_teacher_id: teacherId,
        p_tool: tool,
        p_request: request,
        p_result: result,
      })
      if (error || typeof data !== 'string') return null
      return data
    },
    createProposal: async (teacherId, tool, request, payload, payloadHash) => {
      const { data, error } = await db().rpc('assistant_create_proposal', {
        p_teacher_id: teacherId,
        p_tool: tool,
        p_request: request,
        p_payload: payload,
        p_payload_hash: payloadHash,
      })
      if (error || typeof data !== 'object' || data === null) return null
      const row = data as Record<string, unknown>
      if (typeof row.id !== 'string' || typeof row.payload_hash !== 'string') return null
      return {
        id: row.id,
        payload_hash: row.payload_hash,
        expires_at: typeof row.expires_at === 'string' ? row.expires_at : '',
      }
    },
    confirmProposal: async (runId, payloadHash): Promise<ConfirmOutcome> => {
      const { data, error } = await db().rpc('assistant_confirm_proposal', {
        p_run_id: runId,
        p_payload_hash: payloadHash,
      })
      if (error) return { ok: false, error: error.message }
      const row = data as Record<string, unknown>
      return {
        ok: true,
        teacher_id: String(row.teacher_id ?? ''),
        tool: String(row.tool ?? ''),
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }
    },
    completeRun: async (runId, success, result, error) => {
      const { error: rpcError } = await db().rpc('assistant_complete_run', {
        p_run_id: runId,
        p_success: success,
        p_result: result,
        p_error: error,
      })
      return !rpcError
    },
    cancelRun: async (runId, reason) => {
      const { error } = await db().rpc('assistant_cancel_run', {
        p_run_id: runId,
        p_reason: reason,
      })
      if (error) return { ok: false, error: error.message }
      return { ok: true }
    },
    fetchGroupSessions: async (teacherId, groupId, limit) => {
      const { data, error } = await db()
        .from('sessions')
        .select(SESSION_COLS)
        .eq('teacher_id', teacherId)
        .eq('group_id', groupId)
        .order('session_date', { ascending: false })
        .order('start_time', { ascending: false })
        .limit(limit)
      if (error) throw new Error(`group sessions fetch failed: ${error.message}`)
      return (data ?? []).map((r) => mapSession(r as Record<string, unknown>))
    },
    fetchHomeworkMarks: async (teacherId, sessionIds) => {
      if (sessionIds.length === 0) return []
      const { data, error } = await db()
        .from('attendance')
        .select('session_id, student_id, status, homework_done')
        .eq('teacher_id', teacherId)
        .in('session_id', sessionIds)
      if (error) throw new Error(`homework marks fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({
        session_id: String(r.session_id),
        student_id: String(r.student_id),
        status: r.status === null ? null : String(r.status),
        homework_done: Boolean(r.homework_done),
      }))
    },
    fetchSessionsInMonth: async (teacherId, groupId, month) => {
      const from = `${month}-01`
      const [y, m] = month.split('-').map(Number)
      const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
      const { data, error } = await db()
        .from('sessions')
        .select(SESSION_COLS)
        .eq('teacher_id', teacherId)
        .eq('group_id', groupId)
        .gte('session_date', from)
        .lt('session_date', next)
        .order('session_date', { ascending: true })
        .order('start_time', { ascending: true })
      if (error) throw new Error(`month sessions fetch failed: ${error.message}`)
      return (data ?? []).map((r) => mapSession(r as Record<string, unknown>))
    },
    fetchSession: async (teacherId, sessionId) => {
      const { data, error } = await db()
        .from('sessions')
        .select(SESSION_COLS)
        .eq('teacher_id', teacherId)
        .eq('id', sessionId)
        .maybeSingle()
      if (error || !data) return null
      return mapSession(data as Record<string, unknown>)
    },
    fetchStudentById: async (teacherId, studentId) => {
      const { data, error } = await db()
        .from('students')
        .select('id, name')
        .eq('teacher_id', teacherId)
        .eq('id', studentId)
        .maybeSingle()
      if (error || !data) return null
      return { id: String(data.id), name: String(data.name) }
    },
    setHomeworkMark: async (teacherId, sessionId, studentId, done) => {
      const client = db()
      const { data: existing, error: readError } = await client
        .from('attendance')
        .select('status, starred')
        .eq('teacher_id', teacherId)
        .eq('session_id', sessionId)
        .eq('student_id', studentId)
        .maybeSingle()
      if (readError) throw new Error(`homework read failed: ${readError.message}`)
      const status = existing?.status ?? null
      const starred = Boolean(existing?.starred)
      // نفس قاعدة مسار الحفظ الموحّد في التطبيق: القيمة الفارغة تماماً
      // (لا حالة + لا واجب + لا نجمة) تعني حذف الصف لا تخزينه.
      if (status === null && !done && !starred) {
        const { error } = await client
          .from('attendance')
          .delete()
          .eq('teacher_id', teacherId)
          .eq('session_id', sessionId)
          .eq('student_id', studentId)
        if (error) throw new Error(`homework delete failed: ${error.message}`)
        return
      }
      const { error } = await client.from('attendance').upsert(
        {
          teacher_id: teacherId,
          session_id: sessionId,
          student_id: studentId,
          status,
          homework_done: done,
          starred,
        },
        { onConflict: 'session_id,student_id' },
      )
      if (error) throw new Error(`homework upsert failed: ${error.message}`)
    },
    generateGroupSessions: async (teacherId, groupId, monthDate) => {
      const { data, error } = await db().rpc('generate_group_sessions', {
        p_teacher_id: teacherId,
        p_group_id: groupId,
        p_month: monthDate,
      })
      if (error) throw new Error(`session generation failed: ${error.message}`)
      return typeof data === 'number' ? data : 0
    },
    encryptApiKey: async (plaintext) => {
      const keyB64 = Deno.env.get('ASSISTANT_KEY_ENCRYPTION_KEY')
      if (!keyB64) throw new Error('ASSISTANT_KEY_ENCRYPTION_KEY is not set')
      return aesGcmEncrypt(plaintext, parseEncryptionKey(keyB64))
    },
    saveProviderKey: async (teacherId, provider, model, baseUrl, ciphertext, iv) => {
      const { data, error } = await db().rpc('assistant_save_provider_key', {
        p_teacher_id: teacherId,
        p_provider: provider,
        p_model: model,
        p_base_url: baseUrl,
        p_ciphertext: ciphertext,
        p_iv: iv,
      })
      if (error || !isRecord(data)) return null
      return {
        is_set: true,
        provider: typeof data.provider === 'string' ? data.provider : provider,
        model: typeof data.model === 'string' ? data.model : null,
        updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
      }
    },
    providerKeyStatus: async (teacherId) => {
      const { data, error } = await db().rpc('assistant_provider_key_status', {
        p_teacher_id: teacherId,
      })
      if (error || !isRecord(data)) return null
      return {
        is_set: data.is_set === true,
        provider: typeof data.provider === 'string' ? data.provider : undefined,
        model: typeof data.model === 'string' ? data.model : null,
        updated_at: typeof data.updated_at === 'string' ? data.updated_at : undefined,
      }
    },
    deleteProviderKey: async (teacherId) => {
      const { error } = await db().rpc('assistant_delete_provider_key', {
        p_teacher_id: teacherId,
      })
      return !error
    },
    readProviderKeyRow: async (teacherId) => readKeyRow(db, teacherId),
    // مفتاح المنصة المركزي (مهمة 22): أسماء بيئة فقط — القيمة لا تُقرأ
    // هنا إلا للتحقق من وجودها، ولا تخرج في أي رد.
    platformKeyStatus: () => {
      const configured = Boolean((Deno.env.get('ASSISTANT_PLATFORM_API_KEY') ?? '').trim())
      return {
        configured,
        provider: configured ? (Deno.env.get('ASSISTANT_PLATFORM_PROVIDER') ?? 'openai') : null,
        model: configured ? (Deno.env.get('ASSISTANT_PLATFORM_MODEL') ?? null) : null,
      }
    },
    // حد رسائل الذكاء (0062 — مهمة 19): RPC ‏check_usage_limit عبر
    // عميل المستدعي. غياب الدالة (قبل تطبيق المهاجرة) أو أي خطأ في
    // الاستدعاء → null فيُسمح: الحد قاعدة أعمال لا حدود أمنية (الملكية
    // فُحصت فوق)، والعدّاد في السجل يسجّل المحاولة أصلاً فيُعاد
    // الفحص عند الرسالة التالية (نمط الخطوة 5 في واتساب).
    checkAiLimit: async (teacherId) => {
      const { data, error } = await db().rpc('check_usage_limit', {
        p_teacher_id: teacherId,
        p_key: 'max_ai_messages_month',
      })
      if (error || !isRecord(data)) return null
      if (typeof data.allowed !== 'boolean') return null
      return {
        allowed: data.allowed,
        limit: typeof data.limit === 'number' ? data.limit : null,
        used: typeof data.used === 'number' ? data.used : 0,
      }
    },
    now: () => Date.now(),
  }
}

const PROVIDER_IDS: ProviderId[] = ['openai', 'anthropic', 'gemini', 'openai_compatible']

/**
 * مخطط المزوّد الحقيقي: مفتاح المدرّس يُقرأ مشفّراً عبر RPC (بهوية
 * المستدعي) ويُفكّ هنا في الذاكرة فقط — لا يُسجَّل ولا يخرج في رد.
 * ترتيب الحلّ (مهمة 22): BYOK أولاً، وعند غيابه مفتاح المنصة المركزي
 * من متغيرات البيئة — بلا مفتاح حيّ مضبوط اليوم فيبقى المسار نائماً.
 */
function makeProviderPlanner(req: Request): ProviderPlanner {
  const db = () => callerClient(req)
  return new ProviderPlanner({
    resolveKey: async (teacherId): Promise<ProviderKeyConfig | null> => {
      const row = await readKeyRow(db, teacherId)
      if (!row) {
        return resolvePlatformKeyConfig({
          apiKey: Deno.env.get('ASSISTANT_PLATFORM_API_KEY'),
          provider: Deno.env.get('ASSISTANT_PLATFORM_PROVIDER'),
          model: Deno.env.get('ASSISTANT_PLATFORM_MODEL') ?? null,
          baseUrl: Deno.env.get('ASSISTANT_PLATFORM_BASE_URL') ?? null,
        })
      }
      if (!PROVIDER_IDS.includes(row.provider as ProviderId)) {
        throw new PlannerError(
          'the stored provider is not supported',
          'planner_unconfigured',
          500,
        )
      }
      const keyB64 = Deno.env.get('ASSISTANT_KEY_ENCRYPTION_KEY')
      if (!keyB64) {
        throw new PlannerError(
          'key storage is not configured on the platform',
          'planner_unconfigured',
          500,
        )
      }
      let apiKey: string
      try {
        apiKey = await aesGcmDecrypt(
          row.key_ciphertext,
          row.key_iv,
          parseEncryptionKey(keyB64),
        )
      } catch {
        throw new PlannerError(
          'the stored provider key cannot be decrypted',
          'key_decrypt_failed',
          500,
        )
      }
      return {
        provider: row.provider as ProviderId,
        model: row.model,
        base_url: row.base_url,
        api_key: apiKey,
        source: 'byok',
      }
    },
    loadGroups: async (teacherId) => {
      const { data, error } = await db()
        .from('groups')
        .select('id, name')
        .eq('teacher_id', teacherId)
        .is('archived_at', null)
      if (error) throw new Error(`groups fetch failed: ${error.message}`)
      return (data ?? []).map((r) => ({ id: String(r.id), name: String(r.name) }))
    },
  })
}

Deno.serve((req: Request) => {
  const env: AssistantEnv = {
    ASSISTANT_ENABLED: Deno.env.get('ASSISTANT_ENABLED'),
  }
  // الافتراضي: مخطط المزوّد الحقيقي بمفتاح المدرّس (BYOK — ق5).
  // ASSISTANT_PLANNER=test يركّب البديل الاختباري الحتمي — للطيار
  // والتحقق الوظيفي فقط، وبقرار منصة صريح (علم بيئة) لا من العميل.
  const planner =
    Deno.env.get('ASSISTANT_PLANNER') === 'test'
      ? new DeterministicTestPlanner()
      : makeProviderPlanner(req)
  return handleAssistantChat(req, env, makeDeps(req), planner, (msg) => console.log(msg))
})
